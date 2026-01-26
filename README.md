# Tempus WR History

Static site for browsing deterministic Tempus WR history by map and class.

## Data
The site reads static CSVs from `public/data/wr-history-all/` and an index at
`public/data/index.json`.

To refresh data:

1) Re-run the export from `tempus-demo-archive`:
```
TEMPUS_WR_INCLUDE_INFERRED=1 TEMPUS_WR_INCLUDE_SUBRECORDS=1 TEMPUS_WR_INCLUDE_ALL=1 \
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

## Development
```
npm install
npm run dev
```

## Deploy
GitHub Pages deploys on push to `main` via `.github/workflows/pages.yml`.
