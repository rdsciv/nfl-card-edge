"""Public NFL snapshots; standard library only, no market credentials or private data."""
import argparse
import csv
import fcntl
import gzip
import hashlib
import io
import json
import os
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

CHICAGO = ZoneInfo("America/Chicago")
SCHEDULE_URL = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv"
RELEASE_ROOT = "https://github.com/nflverse/nflverse-data/releases/download"
POSITIONS = ("QB", "RB", "WR", "TE")
SCHEDULES = {1: ("weekly", 9, 15), 4: ("revision", 16, 15), 5: ("catchup-check", 9, 15)}


def stamp(now):
    return now.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def number(value):
    if value is None or str(value).strip() in ("", "NA", "NaN", "null"):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def average(rows, field):
    values = [r[field] for r in rows if r.get(field) is not None]
    return sum(values) / len(values) if values else None


def ratio(numerator, denominator):
    return numerator / denominator if numerator is not None and denominator and denominator > 0 else None


def next_run(now):
    local = now.astimezone(CHICAGO)
    for offset in range(8):
        date = local.date() + timedelta(days=offset)
        if date.weekday() not in SCHEDULES:
            continue
        kind, hour, minute = SCHEDULES[date.weekday()]
        scheduled = datetime(date.year, date.month, date.day, hour, minute, tzinfo=CHICAGO)
        if scheduled > local:
            return {"at": stamp(scheduled), "local": scheduled.isoformat(), "timeZone": "America/Chicago", "kind": kind}


def resolve_schedule(rows, now):
    today = now.astimezone(CHICAGO).date()
    regular = [r for r in rows if r.get("game_type") in ("REG", "WC", "DIV", "CON", "SB")
               and r.get("gameday") and r.get("game_id")]
    eligible = [int(r["season"]) for r in regular
                if datetime.fromisoformat(r["gameday"]).date() <= today + timedelta(days=60)]
    if not eligible:
        raise ValueError("Schedule has no current or recently completed season")
    season = max(eligible)
    games = [r for r in regular if int(r["season"]) == season]
    requested_season = today.year if today.month >= 9 else today.year - 1
    schedule_end = max(datetime.fromisoformat(r["gameday"]).date() for r in games)
    offseason = 2 <= today.month <= 8 and season == today.year - 1
    current = season >= requested_season and (schedule_end >= today or offseason)
    groups = {}
    for row in games:
        groups.setdefault(int(row["week"]), []).append(row)
    completed = []
    partial = False
    for week, week_games in groups.items():
        finished = [r for r in week_games if number(r.get("home_score")) is not None
                    and number(r.get("away_score")) is not None
                    and datetime.fromisoformat(r["gameday"]).date() <= today]
        if len(finished) == len(week_games):
            completed.append(week)
        elif finished or any(datetime.fromisoformat(r["gameday"]).date() <= today for r in week_games):
            partial = True
    return {"season": season, "completedWeek": max(completed, default=0),
            "partialWeek": partial, "games": games, "completedWeeks": completed,
            "current": current, "requestedSeason": requested_season,
            "scheduleThrough": schedule_end.isoformat()}


def opportunity(position, latest, prior):
    weights = {"WR": {"targets": (.55, 6), "targetShare": (.45, .2)},
               "TE": {"targets": (.55, 6), "targetShare": (.45, .2)},
               "RB": {"carries": (.65, 10), "targets": (.35, 5)},
               "QB": {"attempts": (.8, 15), "carries": (.2, 5)}}[position]
    components = []
    reasons = []
    if not prior:
        return 50, 0, ["No prior completed game available; usage score is neutral."], components
    total = 0
    used_weight = 0
    for metric, (weight, scale) in weights.items():
        current, baseline = latest.get(metric), prior.get(metric)
        if current is None or baseline is None:
            continue
        change = current - baseline
        normalized = max(-1, min(1, change / scale))
        total += normalized * weight
        used_weight += weight
        components.append({"metric": metric, "latest": current, "baseline": baseline,
                           "change": change, "weight": weight, "scale": scale})
        if metric == "targetShare":
            reasons.append(f"Team target share {current:.1%}; prior-game weighted share {baseline:.1%}.")
        else:
            reasons.append(f"{metric.title()} {current:g}; prior available-game mean {baseline:.1f}.")
    trend = round(50 * total / used_weight, 1) if used_weight else 0
    reasons.append(f"Baseline uses {prior['games']} prior available completed games; byes are excluded.")
    if prior["games"] < 3:
        reasons.append("Small sample: fewer than three prior completed games.")
    return round(50 + trend, 1), trend, reasons, components


def build_snapshot(schedule, stats, roster, snaps, now):
    info = resolve_schedule(schedule, now)
    season, completed = info["season"], info["completedWeek"]
    finished = {r["game_id"]: r for r in info["games"] if int(r["week"]) in info["completedWeeks"]}
    # IDs, not player names, establish both game coverage and joins.
    unique = {}
    conflicts = set()
    for row in stats:
        if int(row.get("season", 0)) != season or row.get("game_id") not in finished:
            continue
        key = (row.get("player_id"), row["game_id"])
        if key in unique and unique[key] != row:
            conflicts.add(key)
        unique.setdefault(key, row)
    usable = list(unique.values())
    available_week = max((int(r["week"]) for r in usable), default=0)
    missing = ["Routes and route participation: no verified current-season feed connected.",
               "Red-zone opportunities and game-script catalysts: play-by-play adapter not connected."]
    if not info["current"]:
        missing.append(f"Current-season schedule unavailable or truncated: expected season {info['requestedSeason']}; "
                       f"resolved season {season}, schedule covers through {info['scheduleThrough']}.")
    if conflicts:
        missing.append(f"Conflicting duplicate weekly stats: {len(conflicts)} player/game records require review.")
    if available_week < completed:
        missing.append(f"Weekly stats delayed: schedule complete through {completed}, stats through {available_week}.")
    teams = {}
    game_teams = set()
    for row in usable:
        team = row.get("team") or row.get("recent_team")
        key = (row["game_id"], team)
        game_teams.add(key)
        totals = teams.setdefault(key, {"targets": 0, "airYards": 0, "carries": 0})
        for source, dest in (("targets", "targets"), ("receiving_air_yards", "airYards"), ("carries", "carries")):
            value = number(row.get(source))
            if value is None and (source == "targets" or row.get("position") in (*POSITIONS, "FB")):
                totals[dest] = None
            elif value is not None and totals[dest] is not None:
                totals[dest] += value
    incomplete_targets = sum(total["targets"] is None for total in teams.values())
    if incomplete_targets:
        missing.append(f"Incomplete team target denominator in {incomplete_targets} game/team records; shares are unknown.")
    expected = {(gid, r[side]) for gid, r in finished.items() for side in ("home_team", "away_team")}
    unreported = expected - game_teams
    if unreported:
        missing.append(f"Weekly stats missing {len(unreported)} completed game/team records.")
    crosswalk = {r.get("pfr_id"): r.get("gsis_id") for r in roster if r.get("pfr_id") and r.get("gsis_id")}
    snap_lookup = {(crosswalk.get(r.get("pfr_player_id")), r.get("game_id")): r for r in snaps}
    players = {}
    # Latest roster record wins; a trade does not create a second player identity.
    for row in sorted(roster, key=lambda r: number(r.get("week")) or 0):
        if row.get("position") not in POSITIONS or not row.get("gsis_id"):
            continue
        players[row["gsis_id"]] = {"id": row["gsis_id"], "name": row.get("full_name", row["gsis_id"]),
                                   "team": row.get("team", ""), "position": row["position"], "history": []}
    seen = set()
    for row in sorted(usable, key=lambda r: int(r["week"])):
        pid = row.get("player_id")
        if row.get("position") not in POSITIONS or not pid or (pid, row["game_id"]) in seen:
            continue
        seen.add((pid, row["game_id"]))
        team = row.get("team") or row.get("recent_team")
        player = players.setdefault(pid, {"id": pid, "history": []})
        player.update(name=row.get("player_display_name") or row.get("player_name") or pid,
                      team=team, position=row["position"])
        total = teams[(row["game_id"], team)]
        snap = snap_lookup.get((pid, row["game_id"]), {})
        record = {"week": int(row["week"]), "gameId": row["game_id"], "team": team,
                  "targets": number(row.get("targets")), "receptions": number(row.get("receptions")),
                  "yards": number(row.get("passing_yards" if row["position"] == "QB" else "receiving_yards")),
                  "rushingYards": number(row.get("rushing_yards")), "carries": number(row.get("carries")),
                  "attempts": number(row.get("attempts")), "airYards": number(row.get("receiving_air_yards")),
                  "teamTargets": total["targets"], "targetShare": ratio(number(row.get("targets")), total["targets"]),
                  "airYardsShare": ratio(number(row.get("receiving_air_yards")), total["airYards"]),
                  "snapShare": number(snap.get("offense_pct")), "snaps": number(snap.get("offense_snaps")),
                  "routes": None, "routeShare": None, "redZoneOpportunities": None}
        record["touches"] = (record["carries"] + record["receptions"]
                             if record["carries"] is not None and record["receptions"] is not None else None)
        player["history"].append(record)
    for player in players.values():
        history = player["history"]
        prior = history[-4:-1]
        baseline = {"games": len(prior), **{field: average(prior, field) for field in ("targets", "carries", "attempts", "touches")}}
        baseline["targetShare"] = ratio(sum(r["targets"] for r in prior if r["targets"] is not None),
                                        sum(r["teamTargets"] for r in prior)) if prior and all(
                                            r["targets"] is not None and r["teamTargets"] is not None for r in prior) else None
        latest = history[-1] if history else {"week": None, **{field: None for field in
                 ("targets", "receptions", "yards", "carries", "touches", "attempts", "targetShare", "snapShare", "routes")}}
        score, trend, reasons, components = opportunity(player["position"], latest, baseline if prior else {})
        if not history:
            reasons = ["No completed-game stats available for this rostered player; score is neutral."]
        elif latest["week"] < available_week:
            reasons.append(f"Latest played game was week {latest['week']}; current available week is {available_week}.")
        player.update(latest=latest, baseline=baseline, score=score, trend=trend, reasons=reasons,
                      components=components, sourceUrl=f"{RELEASE_ROOT}/stats_player/stats_player_week_{season}.csv")
        player["seasonToDate"] = {field: (sum(r[field] for r in history if r.get(field) is not None)
                                          if any(r.get(field) is not None for r in history) else None)
                                  for field in ("targets", "carries", "attempts", "touches")}
        player["seasonToDate"]["targetShare"] = ratio(player["seasonToDate"]["targets"], sum(r["teamTargets"] for r in history)) if history and all(
            r["targets"] is not None and r["teamTargets"] is not None for r in history) else None
    ordered = sorted(players.values(), key=lambda p: (-p["score"], p["name"]))
    validated = info["current"] and available_week == completed and not unreported and not conflicts and not incomplete_targets and bool(usable)
    return {"status": "live" if validated else "degraded",
            "season": season, "week": available_week, "completedWeek": completed,
            "partialWeek": info["partialWeek"], "updatedAt": stamp(now) if validated else None, "sourceUrl": SCHEDULE_URL,
            "coverage": {"players": len(ordered), "games": len({r["game_id"] for r in usable}),
                         "positions": list(POSITIONS), "missing": missing}, "players": ordered,
            "reports": [], "jobs": [], "providers": [], "nextRun": next_run(now),
            "methodology": {"baseline": "Latest completed player game versus prior three available completed games.",
                "targetShare": "Targets divided by all team's recorded player targets in the same game after player/game deduplication; prior and season shares use summed numerators and denominators. Any missing player target count makes that team/game denominator and shares unknown.",
                "score": "50 + 50 × weighted normalized usage change, clipped to 0–100. WR/TE targets 55% (scale 6) and target share 45% (scale .20); RB carries 65% (scale 10), targets 35% (scale 5); QB attempts 80% (scale 15), carries 20% (scale 5). Each component change is clipped to ±1. Missing components are omitted and weights renormalized. No prior games means neutral 50. This is a transparent usage heuristic, not a calibrated investment forecast.",
                "catalysts": "No injury/depth catalyst is inferred automatically. Optional provider health is shown separately."}}


def fetch_rows(url, health_only=False):
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "NFL-Card-Edge/1.0 public-data-worker"})
            with urllib.request.urlopen(request, timeout=30) as response:
                raw = response.read(32 * 1024 * 1024 + 1)
                if len(raw) > 32 * 1024 * 1024:
                    raise ValueError("Provider download exceeds 32MB compressed limit")
                retrieved = {"etag": response.headers.get("ETag"), "lastModified": response.headers.get("Last-Modified")}
            data = gzip.decompress(raw) if url.endswith(".gz") else raw
            if len(data) > 128 * 1024 * 1024:
                raise ValueError("Provider data exceeds 128MB expanded limit")
            reader = csv.DictReader(io.StringIO(data.decode("utf-8-sig")))
            if health_only:
                rows = []
                latest, latest_week, count = None, 0, 0
                for row in reader:
                    count += 1
                    latest = max(latest or "", row.get("dt", "") or "") or None
                    latest_week = max(latest_week, int(number(row.get("week")) or 0))
                retrieved.update(rows=count, latestDate=latest, latestWeek=latest_week)
            else:
                rows = list(reader)
                retrieved["rows"] = len(rows)
            retrieved["hash"] = hashlib.sha256(data).hexdigest()
            return rows, retrieved
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def provider_health(tag, meta, now, completed_week):
    if not meta.get("rows"):
        return "unavailable"
    if tag == "injuries":
        latest = meta.get("latestWeek")
        if not latest:
            return "unknown"
        return "stale" if latest < completed_week else "live"
    if tag == "depth_charts":
        try:
            dated = datetime.fromisoformat((meta.get("latestDate") or "").replace("Z", "+00:00"))
        except ValueError:
            return "unknown"
        if dated.tzinfo is None:
            return "unknown"
        return "stale" if now - dated > timedelta(days=7) else "live"
    return "live"


def ingest(now):
    schedule, schedule_meta = fetch_rows(SCHEDULE_URL)
    schedule_info = resolve_schedule(schedule, now)
    season = schedule_info["season"]
    stats_url = f"{RELEASE_ROOT}/stats_player/stats_player_week_{season}.csv.gz"
    stats, stats_meta = fetch_rows(stats_url)
    if not stats or not {"player_id", "game_id", "week", "team", "targets"}.issubset(stats[0]):
        raise ValueError("Current weekly stats missing required documented columns or rows")
    providers = [{"id": "nfl-schedule", "status": "live" if schedule_info["current"] else "stale", "sourceUrl": SCHEDULE_URL, "retrievedAt": stamp(now), **schedule_meta},
                 {"id": "nfl-weekly-stats", "status": "live", "sourceUrl": stats_url, "retrievedAt": stamp(now), **stats_meta}]
    roster, snaps = [], []
    for tag, filename in (("rosters", f"roster_{season}"), ("snap_counts", f"snap_counts_{season}"),
                          ("injuries", f"injuries_{season}"), ("depth_charts", f"depth_charts_{season}")):
        url = f"{RELEASE_ROOT}/{tag}/{filename}.csv.gz"
        try:
            rows, meta = fetch_rows(url, health_only=tag in ("injuries", "depth_charts"))
            status = provider_health(tag, meta, now, schedule_info["completedWeek"])
            providers.append({"id": tag, "status": status, "sourceUrl": url, "retrievedAt": stamp(now), **meta})
            if tag == "rosters":
                roster = rows
            elif tag == "snap_counts":
                snaps = rows
        except Exception as error:
            providers.append({"id": tag, "status": "unavailable", "sourceUrl": url,
                              "retrievedAt": stamp(now), "message": str(error)[:200]})
    result = build_snapshot(schedule, stats, roster, snaps, now)
    providers[1]["status"] = result["status"]
    result["providers"] = providers
    result["watermark"] = hashlib.sha256(json.dumps([(p["id"], p.get("hash")) for p in providers], sort_keys=True).encode()).hexdigest()
    result["coverage"]["missing"] += [f"{p['id']}: {p['status']}" for p in providers if p["status"] != "live"]
    return result


def due_runs(now, state):
    local = now.astimezone(CHICAGO)
    due = []
    # Keep up to a week of missed wall-clock jobs. Each job retains its original ID.
    for days_ago in range(7, -1, -1):
        date = local.date() - timedelta(days=days_ago)
        spec = SCHEDULES.get(date.weekday())
        if not spec:
            continue
        kind, hour, minute = spec
        scheduled = datetime(date.year, date.month, date.day, hour, minute, tzinfo=CHICAGO)
        if scheduled > local:
            continue
        run_id = f"{kind}-{date.isoformat()}"
        due.append({"id": run_id, "kind": kind, "date": stamp(scheduled)})
    newest = {}
    for job in due:
        newest[job["kind"]] = job
    ready = []
    for job in newest.values():
        existing = state.get("runs", {}).get(job["id"], {})
        if existing.get("status") in ("live", "unchanged"):
            continue
        if existing.get("retryAfter") and now < datetime.fromisoformat(existing["retryAfter"].replace("Z", "+00:00")):
            continue
        ready.append(job)
    return sorted(ready, key=lambda job: job["date"])


def read_json(path, default):
    return json.loads(path.read_text()) if path.exists() else default


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    staging = path.with_suffix(path.suffix + ".tmp")
    staging.write_text(json.dumps(data, indent=2, allow_nan=False) + "\n")
    staging.replace(path)


def run_job(root, state, job, now, loader):
    path = root / "public/data/nfl.json"
    previous = read_json(path, {"status": "unavailable", "players": [], "reports": [], "jobs": [],
                                "season": None, "week": None, "completedWeek": None, "partialWeek": False,
                                "updatedAt": None, "sourceUrl": SCHEDULE_URL, "providers": [],
                                "coverage": {"players": 0, "games": 0, "positions": list(POSITIONS), "missing": []}})
    if state.get("runs", {}).get(job["id"], {}).get("status") in ("live", "unchanged"):
        return False
    report = None
    try:
        candidate = loader()
        status = candidate["status"]
        unchanged = (job["kind"] == "catchup-check" and status == "live" and previous.get("status") == "live"
                     and candidate.get("watermark") == previous.get("watermark"))
        if status != "live":
            write_json(root / "worker/state/staged.json", candidate)
            attempted = candidate
            candidate = json.loads(json.dumps(previous))
            candidate["status"] = "degraded" if previous.get("players") else "unavailable"
            candidate["providers"] = attempted.get("providers", [])
            candidate["refreshCoverage"] = attempted.get("coverage", {})
            candidate["coverage"]["missing"] = list(dict.fromkeys(candidate["coverage"].get("missing", []) +
                                                        attempted.get("coverage", {}).get("missing", [])))
            message = "NFL inputs failed validation; staged candidate and retained last validated player snapshot and timestamp."
        elif unchanged:
            status = "unchanged"
            candidate = previous
            message = "Upstream sources unchanged; no revision published."
        else:
            report_id = f"{job['id']}-{candidate.get('watermark', 'snapshot')[:12]}"
            report = {"id": report_id, "date": stamp(now), "scheduledFor": job["date"], "kind": job["kind"],
                      "season": candidate["season"], "week": candidate["week"], "status": status,
                      "playerCount": len(candidate["players"]),
                      "leaders": [{"id": p["id"], "name": p["name"], "score": p["score"]} for p in candidate["players"][:10]],
                      "sources": [p["sourceUrl"] for p in candidate.get("providers", [])] or [candidate["sourceUrl"]]}
            report_path = root / "public/data/reports" / f"{report_id}.json"
            if not report_path.exists():
                write_json(report_path, {"report": report, "snapshot": candidate})
            else:
                report = read_json(report_path, {})["report"]
            candidate["reports"] = [report] + [r for r in previous.get("reports", []) if r["id"] != report_id]
            candidate["reports"] = candidate["reports"][:104]
            message = f"Published {status} NFL snapshot; {len(candidate['players'])} players."
    except Exception as error:
        candidate = previous
        candidate["status"] = "degraded" if previous.get("players") else "unavailable"
        status = "degraded"
        message = f"Source refresh failed; retained last successful snapshot. {type(error).__name__}: {str(error)[:180]}"
    if status == "unchanged":
        state.setdefault("runs", {})[job["id"]] = {"status": status, "executedAt": stamp(now), "message": message}
        return False
    job_entry = {"id": job["id"], "date": stamp(now), "scheduledFor": job["date"], "status": status, "message": message}
    candidate["jobs"] = [job_entry] + [j for j in previous.get("jobs", []) if j["id"] != job["id"]]
    candidate["jobs"] = candidate["jobs"][:40]
    candidate["lastAttemptAt"] = stamp(now)
    state.setdefault("runs", {})[job["id"]] = {"status": status, "executedAt": stamp(now), "message": message,
        "attempts": state.get("runs", {}).get(job["id"], {}).get("attempts", 0) + 1,
        "retryAfter": stamp(now + timedelta(hours=1)) if status != "live" else None}
    write_json(path, candidate)
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="Run immediately using the same validated pipeline")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    root = args.root
    state_path = root / "worker/state/runs.json"
    state_path.parent.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc)
    with (state_path.parent / ".lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        state = read_json(state_path, {"runs": {}})
        jobs = due_runs(now, state)
        if args.force:
            jobs = [{"id": f"manual-{stamp(now)[:16].replace(':', '')}", "kind": "manual", "date": stamp(now)}]
        changed = False
        # One upstream retrieval can serve all missed jobs, avoiding duplicated downloads.
        cached = None
        def load():
            nonlocal cached
            if cached is None:
                cached = ingest(now)
            return json.loads(json.dumps(cached))
        for job in jobs:
            changed = run_job(root, state, job, now, load) or changed
        if jobs:
            write_json(state_path, state)
        print(json.dumps({"jobs": len(jobs), "changed": changed, "date": stamp(now)}))
        if os.environ.get("GITHUB_OUTPUT"):
            with open(os.environ["GITHUB_OUTPUT"], "a") as output:
                output.write(f"changed={str(changed).lower()}\n")


if __name__ == "__main__":
    main()
