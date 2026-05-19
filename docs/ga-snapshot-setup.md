# GA daily snapshot setup

The `.github/workflows/ga-snapshot.yml` cron requires two repository secrets:

- `GA_SA_JSON` — full contents of the service-account JSON (paste as-is)
- `GA_PROPERTY_ID` — `527587379`

The SA must have **Viewer** access on the GA4 property.

Add at: GitHub repo → Settings → Secrets and variables → Actions → New repository secret.

## First-time bootstrap

The workflow writes to a dedicated `gh-data` orphan branch (decoupled from the tag-triggered deploy pipeline). The dashboard fetches from `https://raw.githubusercontent.com/andycom12000/ff14-craft-helper/gh-data/snapshot.json` at runtime.

To create the branch the first time, trigger the workflow manually:

1. Add both repository secrets above
2. Actions tab → "GA daily snapshot" → Run workflow
3. After it completes, verify `https://raw.githubusercontent.com/andycom12000/ff14-craft-helper/gh-data/snapshot.json` is accessible

The dashboard at `/admin/ga` will then load the snapshot. Cron fires daily at 04:00 UTC (12:00 Asia/Taipei).

## Branch policy

`gh-data` is a data-only orphan branch. It does NOT contain code, has no `package.json`, and is NEVER merged into `main`. Force-push is acceptable on this branch.

## Schema versioning

`snapshot.json.schemaVersion` starts at `1`. When changing the JSON shape:

- Pure additive (new optional fields) — no bump
- Renames or removed fields — bump version

The dashboard issues a warning when `schemaVersion` exceeds the client's known max.
