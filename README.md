# Tempus WR History

Static site for browsing deterministic Tempus WR history by map and class.

## Data
The site reads static CSVs from `public/data/wr-history-all/` and an index at
`public/data/index.json`.

To refresh data:

1) Re-run the export from `tempus-demo-archive`:
```
TEMPUS_SKIP_MIGRATIONS=1 \
dotnet run -c Release --project TempusDemoArchive.Jobs -- --job wr-history-all
```

2) Copy data into this repo:
```
cp /root/.config/TempusDemoArchive/temp/wr-history-all/* public/data/wr-history-all/
```

3) Regenerate the index:
```
npm run data:index
```

4) Commit + push. GitHub Pages will redeploy automatically.

CSV semantics:
- One file per `(map, class)`.
- Timeline is monotonic per `(map, class, segment)`.
- `demo_id` is only present for `evidence=record` (record-setting demo). Play links are hidden otherwise.
- `segment`: `Map`, `Bonus N`, `Course N`, `C# - Name`.
- `evidence`: `record` | `announcement` | `command` | `observed`.

## Development
```
npm install
npm run dev
```

## Deploy
GitHub Pages deploys on push to `main` via `.github/workflows/pages.yml`.
