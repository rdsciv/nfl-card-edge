# Evidence and data boundaries

Checked October 2, 2026. Provider availability and population counts can change; this file records verified capabilities and identity rules, not a promise of continued access.

## Hosting and scheduled execution

[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) serves static HTML, CSS, and JavaScript. This app exports Next.js to `out/`; Pages does not run Python, a PostgreSQL database, a login service, or request-time Next.js server code. [Next.js static export documentation](https://nextjs.org/docs/app/guides/static-exports) excludes features that require a server.

GitHub Actions supplies cloud execution for public NFL refreshes and deployment. [GitHub's schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) supports IANA timezones, including `America/Chicago`. Scheduled jobs run from the default branch, may be delayed or dropped under load, and are disabled in a public repository after 60 days without repository activity. The requested Tuesday 09:15 and Friday 16:15 times are target dispatch times; completed refresh timestamps are the evidence of actual execution.

Imported sold records, population exports, portfolio entries, and preferences are stored in the visitor's browser. The application does not upload them to the public repository. Browser storage is specific to a device/browser and can be cleared; an exported JSON backup is the transfer mechanism. Public hosting does not provide private account synchronization or authentication. Any data committed under `public/` is public.

## NFL discovery

The source pipeline is [nflverse's published releases](https://github.com/nflverse/nflverse-data/releases), with [nflreadr player statistics documentation](https://nflreadr.nflverse.com/reference/load_player_stats.html) defining the weekly data entry point. Data availability determines the supported season and completed week. Missing coverage, incomplete weeks, or unavailable snap data must remain visible; an empty value is not zero.

[nflverse player identity documentation](https://nflreadr.nflverse.com/reference/load_players.html) names `gsis_id` as the primary player key. Direct inspection of the [players CSV release](https://github.com/nflverse/nflverse-data/releases/download/players/players.csv) found Michael Wilson, WR, GSIS `00-0038559`, born 2000-02-23. This ID joins the card catalog to football data.

## Exact Michael Wilson card identity

The catalog entry is **2023 Panini Prizm, Michael Wilson, #303, Silver, rookie, non-autograph base parallel**. [Beckett's checklist](https://www.beckett.com/news/2023-panini-prizm-football-cards/) lists Michael Wilson's base rookie as #303 and the Rookie Variations Prizms Silver as #336. [Fanatics Collect's own product listing](https://www.fanaticscollect.com/buy-now/e52ac2a5-0b24-4335-9a1d-6ea14d49cd69/2023-panini-prizm-prizms-silver-303-michael-wilson) corroborates the #303 Prizms Silver identity. The [eBay product record](https://www.ebay.com/p/6065184483) separately identifies card 303, Silver Prizm, rookie, base set. Listing prices were not imported as sold comps.

Verification used indexed checklist content and marketplace corroboration. Direct Beckett pages currently redirect to its [maintenance notice](https://maintenance.beckett.com/); Panini's [official checklist page](https://www.paniniamerica.net/checklist.html) did not expose the selected checklist in the available page response. This is checklist verification from Beckett, not a claim that a manufacturer checklist was downloaded.

Do not pool #336 image variations, #303 autographs, colored parallels, lots, or other sets with this #303 Silver record. A verified identity does not establish a sale price, graded population, gem rate, or investment result.

## Sold prices and population access

[eBay's official API support matrix](https://developer.ebay.com/api-docs/buy/ref-marketplace-supported.html) states that Marketplace Insights is restricted and not open to new users. An ordinary eBay developer key therefore does not establish an automatic sold-history feed. This release accepts user-imported sold CSVs; it does not scrape sold pages or claim live sold-price access. Active asking prices and unverified Best Offer amounts are not confirmed transactions.

PSA's [public API page](https://www.psacard.com/publicapi) requires account access and warns against exposing credentials in public client code. Its [official Swagger schema](https://api.psacard.com/publicapi/swagger.json), retrieved directly, exposes `GET /publicapi/pop/GetPSASpecPopulation/{specID}` with a numeric `specID`, bearer authorization, and `PSASpecPopulationModel`. The older [text documentation](https://www.psacard.com/publicapi/documentation) describes only single-cert lookups; the schema establishes that a population method exists. No authorized token or independently verified spec ID for the catalog card is configured in this app, so PSA population is **unconfigured**, not live. Never guess spec IDs or embed provider tokens in browser code. Population imports need a source, snapshot date, exact identity, grader, counts, and grade definitions.

## Grade normalization

The following designations describe different outcomes. Keep their counts separate before computing any cohort statistic.

| Grader | Gem outcome | Higher distinct outcomes | Source |
| --- | --- | --- | --- |
| PSA | Gem Mint 10 | None above 10 on its card scale | [PSA standards](https://www.psacard.com/gradingstandards) |
| SGC | 10 GM | 10 PRI | [SGC scale](https://www.gosgc.com/card-grading/scale) |
| BGS | 9.5 Gem Mint | 10 Pristine; 10 Black Label | [Beckett scale](https://www.beckett.com/grading/scale), [Beckett grading](https://www.beckett.com/grading) |
| CGC | Gem Mint 10 | Pristine 10; retained legacy Perfect 10 | [CGC scale and legacy key](https://www.cgccards.com/card-grading/grading-scale/) |

SGC and Beckett scale details were available through indexed official content; direct Beckett access currently reports maintenance. CGC's current 9.5 means **Mint+**, while legacy CGC Trading Cards/CSG **Gem Mint 9.5** maps to current Gem Mint 10. Numeric `9.5` alone is insufficient to identify the legacy category. CGC retired Perfect 10 for new grading but retains existing Perfect 10 status.

[PSA's population search notes](https://www.psacard.com/Pop/Search) warn that later recognition of varieties can make counts inaccurate until previously graded cards are reholdered, and separate whole grades, half grades, and qualifiers. Preserve those distinctions when choosing a denominator.

Our interpretation: a population gem rate is the fraction of that reported grading cohort receiving a defined outcome. The cohort consists of submitted cards, rather than a random sample of available raw cards; repeated submissions can also prevent a cohort from representing distinct physical cards. It does not establish the probability that an arbitrary raw purchase will grade PSA 10. The raw grading calculator therefore uses explicit user-entered probabilities and costs. Wilson intervals describe uncertainty in the submitted cohort, not correction for selection bias or identification errors.
