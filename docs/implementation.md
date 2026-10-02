# NFL Card Edge cloud implementation

The public site is a Next.js TypeScript static export hosted by GitHub Pages. GitHub Actions runs the Python ingestion worker while the laptop is off, stores versioned football reports in the repository, builds the dashboard, and deploys Pages. This replaces the brief's always-on server architecture because Pages serves static files.

Private CSV imports, portfolio records, and investor settings remain in browser local storage. They are never part of the public build. Sold-price updates require an authorized feed; manual imports are explicitly manual. Grading outcome cohorts and population exports must not become raw-card PSA probability estimates.

- [x] Implement and test CSV validation, comparable sales, population provenance, Wilson intervals, and economic constraints.
- [x] Implement and test schedule-based NFL discovery, Chicago due-run dispatch, failure recovery, immutable reports, and duplicate-run handling.
- [x] Build the responsive Opportunities, player research, Card Lab, Watchlist, Reports, and Settings views with accessible controls.
- [x] Verify primary card/grading/provider evidence and document known gaps.
- [ ] Run type checking, domain tests, worker tests, production build, and browser workflow checks.
- [ ] Create the public repository, enable Pages, run the cloud workflow, and verify the public URL.

Acceptance: the public dashboard loads over HTTPS; the repository contains source and a real schedule; imported data previews and validates; unsupported data is visible; private records are not published; the deployed build and cloud refresh complete successfully.
