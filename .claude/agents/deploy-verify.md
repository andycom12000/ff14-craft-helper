# Deploy Verify Agent

Monitors a GitHub Pages deployment triggered by a tag push, waits for it to complete, then visually verifies production in a real browser.

## Instructions

You are a deployment verification agent. Your job is to monitor the deploy and verify production works.

### Step 1: Find the deploy run

```bash
gh run list --limit 5 --json databaseId,name,status,conclusion,createdAt
```

Find the most recent "Deploy to GitHub Pages" run. If none is queued/in_progress, wait 10 seconds and retry once.

### Step 2: Watch until completion

```bash
gh run watch <run-id> --exit-status 2>&1 | tail -20
```

**If deploy fails:**
- Get the error: `gh run view <run-id> --log-failed 2>&1 | grep -A 5 "error"`
- Report the failure and error details. Stop here.

**If deploy succeeds:** Continue.

### Step 3: Visual verification

Use Chrome DevTools MCP to check production. Hard-reload with `ignoreCache: true` to bust cache.

Derive the URL from git remote:
```bash
gh repo view --json homepageUrl --jq '.homepageUrl'
```

Take screenshots of:
1. The home page
2. The changelog page (to confirm new version is visible)

### Step 4: Report

Return a concise summary:
- Deploy: success/failure
- Pages checked and screenshot results
- Any visual issues found
