# Verification — October 2, 2026

The production Next.js export builds successfully for `/nfl-card-edge/`. TypeScript checking passes. `npm test` passes 23 domain and backup tests; `npm run test:worker` passes 19 ingestion, scheduling, provider-health, and failure-recovery tests. Six Playwright browser workflows pass against the static production export, including private backup transfer and local OCR on a clearly synthetic label. The loaded mobile page is 375 pixels wide at a 375-pixel viewport.

```text
Production build: successful static export
Domain / backup: tests 23 | pass 23 | fail 0
Python worker: Ran 19 tests | OK
Browser: 6 passed
Completed-job replay: changed=false | reports 3 → 3 | snapshot unchanged=true
```

Actual public ingestion resolved the 2026 schedule through completed Week 3. Week 4 is partial. The snapshot covers 942 rostered QB/RB/WR/TE players and 48 completed games. Players without a supported weekly sample show unknown metrics and a neutral score. The current source URLs, retrieval times, watermark, field coverage, next due time, and scoring weights are stored with the snapshot.

The synthetic cost fixture uses an acquisition/submission cost of $150, success proceeds of $219, failure proceeds of $84, success probability 0.60, and outcome-specific extras of $10/$2. It produces $8.20 expected profit, $160 worst committed cash, 53.54% break-even probability, and an $82.45 maximum entry subject to the fixture's return and loss limits. These are arithmetic test inputs, not market observations or grading forecasts.

## Operational boundaries

- NFL schedules, identities, rosters, statistics, and supported snaps: public source ingestion implemented and tested against actual provider assets.
- Injury/depth feeds: runtime health checks; no unsupported catalyst inference.
- Exact card catalog: one researched Michael Wilson 2023 Prizm Silver #303 issue; other players' card identities need review.
- Sold prices and population snapshots: validated manual CSV imports, private to the browser. No unattended sold feed or entitled PSA API connection.
- Grading outcomes and portfolio: manual evidence and records, private to the browser; no learned grade forecast or cloud account sync.
- Routes, play-by-play/red-zone measures, liquidity forecasts, automatic card matching, and certified physical authentication: unavailable and not silently substituted.
- GitHub Pages hosts static files; PostgreSQL, a login server, and an always-on Python service are not provisioned by this architecture. GitHub Actions supplies the scheduled cloud execution.

Cloud verification: the [GitHub Actions run](https://github.com/rdsciv/nfl-card-edge/actions/runs/36999249181) completed with successful refresh, build, and deploy jobs. The public [NFL Card Edge URL](https://rdsciv.github.io/nfl-card-edge/) returned HTTP 200 over HTTPS. GitHub generated and committed a new public snapshot and immutable report, proving that the deployed cloud runner can ingest and publish independently of the local preview.
