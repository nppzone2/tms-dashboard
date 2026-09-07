# TMS Dashboard

GitHub Pages dashboard for TMS operational performance.

## Files
- `index.html` — dashboard UI
- `data.json` — processed dashboard data
- `input/Fill Rate.xlsx` — daily Fill Rate source
- `input/TMS OrderDetail.xlsx` — daily TMS source
- `scripts/process_data.py` — merge + KPI calculation
- `.github/workflows/update.yml` — automatic rebuild

## Daily update
1. Replace the two files in `input/` with the latest daily exports using the exact filenames:
   - `Fill Rate.xlsx`
   - `TMS OrderDetail.xlsx`
2. Commit/push them to GitHub.
3. GitHub Actions runs `process_data.py`, regenerates `data.json`, and commits the result.
4. GitHub Pages then serves the updated dashboard.

For fully automatic daily ingestion without manual upload, the source files need to be placed in a cloud location such as OneDrive/SharePoint and an automation can upload the two files to GitHub.
