import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from worker.pipeline import build_snapshot, due_runs, next_run, provider_health, resolve_schedule, run_job


def game(week, team, away, date, home_score="21", away_score="14", season=2026):
    return {"game_id": f"{season}_{week:02}_{away}_{team}", "season": str(season),
            "week": str(week), "game_type": "REG", "home_team": team,
            "away_team": away, "gameday": date, "home_score": home_score,
            "away_score": away_score}


def stat(player, week, targets, total_team="ARI", **extra):
    return {"player_id": player, "player_display_name": player, "position": "WR",
            "season": "2026", "week": str(week), "season_type": "REG", "team": total_team,
            "game_id": f"2026_{week:02}_SEA_ARI", "targets": str(targets),
            "receptions": "2", "receiving_yards": "30", "carries": "0", "attempts": "0", **extra}


class FootballTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 10, 2, 20, tzinfo=timezone.utc)
        self.games = [game(w, "ARI", "SEA", f"2026-09-{w * 7:02}") for w in range(1, 5)]

    def test_score_zero_is_complete_but_postponed_game_blocks_week(self):
        games = self.games + [game(5, "DAL", "NYG", "2026-10-01", "0", "0"),
                              game(5, "ARI", "SEA", "2026-10-02", "", "")]
        info = resolve_schedule(games, self.now)
        self.assertEqual(info["season"], 2026)
        self.assertEqual(info["completedWeek"], 4)
        self.assertTrue(info["partialWeek"])

    def test_baseline_share_uses_summed_team_targets_across_prior_games(self):
        rows = []
        for w, targets, other in [(1, 2, 8), (2, 2, 38), (3, 4, 6), (4, 10, 10)]:
            rows += [stat("gsis-1", w, targets), stat("gsis-2", w, other)]
        result = build_snapshot(self.games, rows, [], [], self.now)
        player = next(p for p in result["players"] if p["id"] == "gsis-1")
        self.assertAlmostEqual(player["baseline"]["targetShare"], 8 / 60)
        self.assertAlmostEqual(player["latest"]["targetShare"], .5)
        self.assertGreater(player["score"], 50)
        self.assertIsNone(player["latest"]["snapShare"])
        self.assertIsNone(player["latest"]["routes"])

    def test_bye_weeks_are_not_zero_games_and_ids_prevent_name_join(self):
        rows = [stat("one", w, w) for w in [1, 2, 4]] + [stat("two", 4, 5, player_display_name="one")]
        result = build_snapshot(self.games, rows, [], [], self.now)
        player = next(p for p in result["players"] if p["id"] == "one")
        self.assertEqual(player["baseline"]["games"], 2)
        self.assertEqual([h["week"] for h in player["history"]], [1, 2, 4])
        self.assertEqual(len(result["players"]), 2)

    def test_delayed_stats_are_degraded_not_complete(self):
        result = build_snapshot(self.games, [stat("one", w, 2) for w in [1, 2, 3]], [], [], self.now)
        self.assertEqual(result["status"], "degraded")
        self.assertEqual(result["completedWeek"], 4)
        self.assertEqual(result["week"], 3)
        self.assertTrue(any("stats" in message for message in result["coverage"]["missing"]))

    def test_snap_join_requires_stable_pfr_crosswalk(self):
        roster = [{"gsis_id": "one", "pfr_id": "Player00", "full_name": "Name", "position": "WR", "team": "ARI"}]
        snaps = [{"pfr_player_id": "Player00", "week": "4", "game_id": "2026_04_SEA_ARI",
                  "offense_pct": "0.75", "offense_snaps": "45"}]
        result = build_snapshot(self.games, [stat("one", 4, 5)], roster, snaps, self.now)
        self.assertEqual(result["players"][0]["latest"]["snapShare"], .75)

    def test_rostered_player_without_stats_has_unknown_totals(self):
        roster = [{"gsis_id": "idle", "full_name": "Idle Player", "position": "WR", "team": "ARI"}]
        result = build_snapshot(self.games, [], roster, [], self.now)
        self.assertIsNone(result["players"][0]["seasonToDate"]["targets"])

    def test_old_season_in_current_fall_is_degraded_without_fresh_stat_timestamp(self):
        schedule = [game(22, "ARI", "SEA", "2026-02-08", season=2025)]
        rows = [stat("old-1", 22, 2, season="2025", game_id="2025_22_SEA_ARI"),
                stat("old-2", 22, 5, total_team="SEA", season="2025", game_id="2025_22_SEA_ARI")]
        result = build_snapshot(schedule, rows, [], [], self.now)
        self.assertEqual(result["status"], "degraded")
        self.assertIsNone(result["updatedAt"])
        self.assertTrue(any("2026" in m and "schedule" in m.lower() for m in result["coverage"]["missing"]))

    def test_duplicate_player_game_rows_do_not_inflate_share_denominator(self):
        rows = [stat("one", 4, 5), stat("two", 4, 5)]
        result = build_snapshot(self.games, rows + [dict(rows[0])], [], [], self.now)
        player = next(p for p in result["players"] if p["id"] == "one")
        self.assertEqual(player["latest"]["targetShare"], .5)
        self.assertEqual(player["latest"]["teamTargets"], 10)
        self.assertEqual(len(player["history"]), 1)

    def test_missing_teammate_targets_make_entire_team_denominator_unknown(self):
        rows = [stat("one", 3, 2), stat("two", 3, 8),
                stat("one", 4, 5), stat("two", 4, "")]
        result = build_snapshot(self.games, rows, [], [], self.now)
        player = next(p for p in result["players"] if p["id"] == "one")
        self.assertIsNone(player["latest"]["teamTargets"])
        self.assertIsNone(player["latest"]["targetShare"])
        self.assertIsNone(player["seasonToDate"]["targetShare"])
        self.assertTrue(any("target denominator" in m for m in result["coverage"]["missing"]))
        rows[-1]["position"] = "CB"
        result = build_snapshot(self.games, rows, [], [], self.now)
        player = next(p for p in result["players"] if p["id"] == "one")
        self.assertIsNone(player["latest"]["targetShare"])


class SchedulerTests(unittest.TestCase):
    def test_next_scheduled_run_is_local_chicago_wall_clock(self):
        future = next_run(datetime(2026, 10, 2, 20, tzinfo=timezone.utc))
        self.assertEqual(future["at"], "2026-10-02T21:15:00Z")
        self.assertEqual(future["local"], "2026-10-02T16:15:00-05:00")
        self.assertEqual(future["timeZone"], "America/Chicago")

    def test_chicago_schedule_observes_winter_and_summer_offsets(self):
        winter = due_runs(datetime(2026, 1, 6, 15, 15, tzinfo=timezone.utc), {"runs": {}})
        summer = due_runs(datetime(2026, 7, 7, 14, 15, tzinfo=timezone.utc), {"runs": {}})
        self.assertTrue(any(r["id"] == "weekly-2026-01-06" for r in winter))
        self.assertTrue(any(r["id"] == "weekly-2026-07-07" for r in summer))
        early = due_runs(datetime(2026, 7, 7, 14, 14, tzinfo=timezone.utc), {"runs": {}})
        self.assertFalse(any(r["id"] == "weekly-2026-07-07" for r in early))

    def test_duplicate_successful_tick_is_skipped_and_missed_tick_catches_up(self):
        now = datetime(2026, 10, 3, 1, tzinfo=timezone.utc)
        runs = due_runs(now, {"runs": {}})
        self.assertTrue(any(r["id"] == "revision-2026-10-02" for r in runs))
        state = {"runs": {r["id"]: {"status": "live"} for r in runs}}
        self.assertEqual(due_runs(now, state), [])

    def test_actual_dst_transition_weeks_preserve_local_run_time(self):
        for value, run_id in [("2026-03-03T15:15:00+00:00", "weekly-2026-03-03"),
                              ("2026-03-10T14:15:00+00:00", "weekly-2026-03-10"),
                              ("2026-10-27T14:15:00+00:00", "weekly-2026-10-27"),
                              ("2026-11-03T15:15:00+00:00", "weekly-2026-11-03")]:
            self.assertTrue(any(r["id"] == run_id for r in due_runs(datetime.fromisoformat(value), {"runs": {}})))

    def test_saturday_unchanged_sources_publish_no_report(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            now = datetime(2026, 10, 3, 16, tzinfo=timezone.utc)
            fixture = {"status": "live", "season": 2026, "week": 3, "players": [], "sourceUrl": "https://example.test/source", "watermark": "a" * 64}
            state = {"runs": {}}
            first = {"id": "revision-2026-10-02", "kind": "revision", "date": now.isoformat()}
            run_job(root, state, first, now, lambda: dict(fixture))
            saturday = {"id": "catchup-check-2026-10-03", "kind": "catchup-check", "date": now.isoformat()}
            self.assertFalse(run_job(root, state, saturday, now, lambda: dict(fixture)))
            result = json.loads((root / "public/data/nfl.json").read_text())
            self.assertEqual(len(result["reports"]), 1)
            self.assertEqual(state["runs"][saturday["id"]]["status"], "unchanged")

    def test_failure_retains_good_players_and_is_retryable(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = root / "public/data/nfl.json"
            path.parent.mkdir(parents=True)
            path.write_text(json.dumps({"status": "live", "players": [{"id": "retained"}],
                                        "updatedAt": "2026-09-29T14:15:00Z", "reports": [], "jobs": []}))
            now = datetime(2026, 10, 2, 22, tzinfo=timezone.utc)
            job = {"id": "revision-2026-10-02", "kind": "revision", "date": now.isoformat()}
            def fail():
                raise RuntimeError("Fixture provider unavailable")
            state = {"runs": {}}
            run_job(root, state, job, now, fail)
            result = json.loads(path.read_text())
            self.assertEqual(result["players"], [{"id": "retained"}])
            self.assertEqual(result["updatedAt"], "2026-09-29T14:15:00Z")
            self.assertEqual(result["status"], "degraded")
            self.assertEqual(result["reports"], [])
            self.assertEqual(state["runs"][job["id"]]["status"], "degraded")

    def test_degraded_candidate_is_staged_and_retains_last_good_stats(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = root / "public/data/nfl.json"
            path.parent.mkdir(parents=True)
            old = {"status": "live", "season": 2026, "week": 3, "completedWeek": 3,
                   "players": [{"id": "retained", "name": "Validated Player", "score": 50}],
                   "updatedAt": "2026-09-29T14:15:00Z", "reports": [{"id": "good-report"}], "jobs": [],
                   "coverage": {"players": 1, "games": 48, "positions": ["WR"], "missing": []}}
            path.write_text(json.dumps(old))
            now = datetime(2026, 10, 2, 22, tzinfo=timezone.utc)
            job = {"id": "revision-2026-10-02", "kind": "revision", "date": now.isoformat()}
            candidate = {"status": "degraded", "season": 2025, "week": 22,
                         "players": [{"id": "stale", "name": "Stale Player", "score": 50}],
                         "sourceUrl": "https://example.test/source", "updatedAt": now.isoformat(),
                         "providers": [{"id": "schedule", "status": "stale", "sourceUrl": "https://example.test/source"}],
                         "coverage": {"missing": ["Current season schedule unavailable"]}}
            state = {"runs": {}}
            run_job(root, state, job, now, lambda: candidate)
            result = json.loads(path.read_text())
            self.assertEqual(result["players"], old["players"])
            self.assertEqual(result["updatedAt"], old["updatedAt"])
            self.assertEqual(result["season"], 2026)
            self.assertEqual(result["week"], 3)
            self.assertEqual(result["reports"], old["reports"])
            self.assertEqual(result["status"], "degraded")
            self.assertEqual(result["providers"], candidate["providers"])
            staged = json.loads((root / "worker/state/staged.json").read_text())
            self.assertEqual(staged["players"], candidate["players"])
            self.assertEqual(state["runs"][job["id"]]["status"], "degraded")

    def test_rerun_keeps_immutable_report_id(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            state = {"runs": {}}
            now = datetime(2026, 10, 2, 22, tzinfo=timezone.utc)
            job = {"id": "manual-2026-10-02", "kind": "manual", "date": now.isoformat()}
            fixture = {"status": "live", "season": 2026, "week": 4, "players": [], "sourceUrl": "https://example.test/source"}
            run_job(root, state, job, now, lambda: dict(fixture))
            run_job(root, state, job, now, lambda: dict(fixture))
            result = json.loads((root / "public/data/nfl.json").read_text())
            self.assertEqual(len(result["reports"]), 1)
            self.assertEqual(len(list((root / "public/data/reports").glob("*.json"))), 1)


class ProviderHealthTests(unittest.TestCase):
    def test_injuries_behind_completed_week_are_stale_despite_rows(self):
        now = datetime(2026, 10, 2, 20, tzinfo=timezone.utc)
        self.assertEqual(provider_health("injuries", {"rows": 100, "latestWeek": 2}, now, 3), "stale")
        self.assertEqual(provider_health("injuries", {"rows": 100, "latestWeek": 4}, now, 3), "live")

    def test_depth_naive_or_missing_timestamps_are_unknown(self):
        now = datetime(2026, 10, 2, 20, tzinfo=timezone.utc)
        self.assertEqual(provider_health("depth_charts", {"rows": 100, "latestDate": "2026-10-02T06:02:14"}, now, 3), "unknown")
        self.assertEqual(provider_health("depth_charts", {"rows": 100, "latestDate": None}, now, 3), "unknown")
        self.assertEqual(provider_health("depth_charts", {"rows": 100, "latestDate": "2026-10-02T06:02:14Z"}, now, 3), "live")


if __name__ == "__main__":
    unittest.main()
