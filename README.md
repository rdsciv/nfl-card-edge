# NFL Card Edge

NFL Card Edge is a personal research dashboard for finding changing NFL usage, checking exact rookie-card identities, inspecting imported sold comps and grading cohorts, and tracking a portfolio. GitHub Pages serves the public dashboard; GitHub Actions refreshes public football data and deploys the site while your computer is off.

Site address: [rdsciv.github.io/nfl-card-edge](https://rdsciv.github.io/nfl-card-edge/). Repository: [rdsciv/nfl-card-edge](https://github.com/rdsciv/nfl-card-edge). An address alone is not proof of deployment: check the latest successful Pages deployment in Actions.

## Cloud architecture

The frontend is Next.js, React, and TypeScript, exported to static files. A Python worker runs in GitHub Actions and publishes public NFL snapshots, report history, and refresh status. Target refresh times are Tuesday 09:15 and Friday 16:15 in `America/Chicago`; daylight saving time follows that timezone. An hourly dispatcher catches missed due jobs and retries degraded refreshes. On Saturday after 09:15, it checks for source revisions and publishes a correction only when source content changed. GitHub can delay scheduled jobs, so the dashboard's actual refresh timestamp is authoritative.

GitHub Pages serves the application over HTTPS. It provides no Python server, PostgreSQL instance, login backend, or private cloud database. This deployment intentionally uses browser storage for personal records. Closing the laptop does not stop the public site or the Actions schedule. Closing a browser does not transfer its personal data to another device.

## Use the dashboard

1. Open Opportunities to inspect NFL usage scores, coverage, comparison baselines, and reasons. Football signals prioritize research; they do not establish card-market returns.
2. Open a player to compare recent usage with the baseline. The catalog starts with Michael Wilson's **2023 Panini Prizm #303 Silver rookie**. His #336 Silver variation and #303 autographs are different cards.
3. Open Settings & data to select a CSV import type, choose a file, review the preview/errors, and commit accepted rows. Imports remain in this browser. Importing a file does not create a scheduled provider connection.
4. Use Card Lab to inspect slab photos, run local OCR, record paired crossover outcomes, and calculate explicit grading scenarios. Population gem rates never become raw-card PSA 10 probabilities automatically.
5. Use Watchlist for your saved research and portfolio. In Settings & data, export a validated JSON backup before clearing browser storage; restore that file on another browser/device to transfer personal data.

### Card prices and eBay shopping

Every player research page has **Card prices & eBay listings** at the top. Choose a grade, then open **Search Buy It Now** (price plus shipping) or **Search auctions** (ending soonest). Cataloged cards include the year, set, parallel, and card number in the search. Other players use a clearly labeled rookie-card search; verify the exact issue and photos on eBay before bidding or buying.

The initial checked snapshot contains two Buy It Now listings and one auction for Michael Wilson's 2023 Prizm Silver #303. Each quote shows its original currency, item price/current bid, quoted shipping, total before tax, seller, source link, and check time. Shipping depends on destination. These are manually checked public listing snapshots, not an automatic feed or a sold-price estimate. After 24 hours, quotes say **Quote needs refresh** and the action becomes **Check listing on eBay**. Known ended auctions are hidden. Confirm availability, end time, current prices, and taxes on eBay.

The separate **Sold prices · past 30 days** guide uses only your imported USD exact-card sales, with grade-specific medians, sample counts, and ranges. Empty records show **No recent sold comps**. **Check sold listings on eBay** opens a search for evidence to review; unknown accepted offers are not imported as known sale amounts.

`public/data/listings.json` is the public, dated snapshot. NFL cloud refreshes do not refresh these card quotes. Automatic Browse API updates require authorized production eBay credentials and an adapter; neither is configured. The public app never requests an API secret. Player links now preserve the selected player in the URL so a reload opens the same research page.

### Imports and provenance

GemRate-style population CSVs support the banner plus second header row, UTF-8 BOM, quoted commas, and comma-formatted counts. Preserve the exact year, set, player, parallel, and card number. A rounded supplied gem rate does not replace the calculation from counts. A historical export without a snapshot date remains an undated import; a filename or recent certificate is not its capture date.

Sold imports use these headers:

```text
source_id,source_url,sale_date,title,card_id,grader,grade,currency,item_price,shipping,quantity,verification,sale_format,status
```

Use the catalog ID `michael-wilson-2023-prizm-silver-303` for that exact card. Supply ISO calendar dates, currency, actual sold price, quantity, and source evidence. Confirmed individual transactions are distinguishable from asking prices, lots, duplicates, and unknown accepted offers. Missing shipping stays unknown. Grade and optional `autograph_grade` are separate fields.

Population exports and sold CSVs are **manual imports**. NFL data with a successful source fetch is **live public source data**. Provider data without credentials, a verified identity mapping, or authorized access is **unconfigured/unavailable**. Empty market records do not imply a zero price or zero population. Five suitable recent comps are required to pass the sample-size actionability check; low-count or stale samples retain their limitations.

## Refresh from GitHub

Open the [Cloud data and GitHub Pages workflow](https://github.com/rdsciv/nfl-card-edge/actions/workflows/cloud-pages.yml) and choose **Run workflow** on `main`. This requests a cloud refresh and deployment without running anything on your computer. The site's **Run now** control opens GitHub's workflow page; a public browser does not hold a GitHub write token. Review the run's result, then reload the site and check the refresh timestamp. From an authenticated GitHub CLI, the equivalent is:

```sh
gh workflow run cloud-pages.yml --repo rdsciv/nfl-card-edge --ref main
```

Public repository schedules may be disabled after 60 days without repository activity. Re-enable the workflow in Actions if needed. A provider failure retains the last usable snapshot and exposes refresh status; it must not be described as fresh data.

## Run and verify locally

Use Node.js 22 or newer and Python 3.11 or newer for the development checks:

```sh
npm ci
npm run dev
```

The production export uses the GitHub project path:

```sh
npm run typecheck
npm test
npm run test:worker
BASE_PATH=/nfl-card-edge npm run build
```

Browser checks are available through `npm run test:browser`; install Chromium with `npx playwright install chromium` before first use. CI runs worker tests, TypeScript checking, domain tests, and the production build. Generated build output is `out/`. To inspect the public ingestion pipeline locally:

```sh
python3 -m worker.pipeline --force
```

This writes public NFL data to `public/data/nfl.json`, immutable report snapshots to `public/data/reports/`, and durable dispatch records to `worker/state/runs.json`. It does not read personal browser imports.

## Initial public deployment

These commands are for creating a new repository from a reviewed copy of this source. Keep private attachments, exports, credentials, and personal backups outside it. The included workflow uses GitHub's Pages artifact deployment; setting Pages to workflow mode is required.

```sh
git init -b main
git add .
git commit -m "Build NFL Card Edge cloud dashboard"
gh repo create rdsciv/nfl-card-edge --public --source=. --remote=origin --push
gh api --method POST repos/rdsciv/nfl-card-edge/pages -f build_type=workflow
gh workflow list --repo rdsciv/nfl-card-edge
```

If the repository already exists, use its existing clone and push to `main`; do not recreate it. Enable GitHub Actions and allow the Pages deployment in repository settings. Wait for the first successful deploy and inspect the public URL before claiming it is live. Subsequent source pushes to `main` rebuild the site.

## Data and privacy limits

The public build includes football statistics, public reports, card metadata, and provider status. It contains no supplied private CSV, investor settings, owned-card records, or credentials. Browser imports, settings, and portfolio records have no account sync and are not encrypted by the app. Anyone with access to that browser profile may access its stored data. Exported backups contain personal data and should be kept private.

Card Lab uses Tesseract.js for browser OCR. Its engine and English language data download on demand; photos are processed locally and must be reviewed manually. Hidden defects and actual grader feedback cannot be established from OCR.

Automatic eBay sold-history ingestion and PSA population ingestion are not configured. eBay's sold-history API has restricted access; PSA supports a population endpoint but requires authorized access and a verified spec ID. Provider secrets belong in a server-side environment if those integrations are added later, never in a static client bundle or public file. This release does not implement those integrations.

[Evidence and provider capabilities](docs/evidence.md) records the checked sources, exact identity, grade distinctions, and access gaps. [Implementation notes](docs/implementation.md) record scope and verification.
