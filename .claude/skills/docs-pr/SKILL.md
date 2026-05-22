---
name: docs-pr
description: Ship a docs-only PR in this repo (changes only under docs/**, *.md, *.mdx — no src/ touched). Use whenever the user wants to PR documentation — ADRs, plans, specs, READMEs, agent docs, CONTEXT.md, PRODUCT.md, CLAUDE.md, changelogs — or says "ship the docs", "PR this ADR", "open a PR for the plan", "merge the spec". Trigger even when the user doesn't say "docs PR" out loud — if the diff is docs-only, this skill applies. The skill enforces the repo's conventional-commit `docs(scope):` title prefix, a body shape that doesn't leave empty test-plan checkboxes, and steers around the CI / branch-protection deadlock that previously locked docs-only PRs.
---

# Docs-only PR workflow

End-to-end conventions and mechanics for shipping a docs-only PR in this repo.

## Why these conventions exist

`ci.yml` runs CI on every PR including docs-only (PR #76 removed the `paths-ignore` block on the `pull_request` trigger). Branch protection requires the 4 checks (`type-check` / `lint` / `test` / `build`) to pass. The two together intentionally make docs PRs run a quick no-op CI (~30–40s wall-clock) and then merge normally.

**Do not** use `[skip ci]`, `[skip actions]`, or `--no-verify` to skip CI on docs PRs — that recreates the deadlock PR #76 fixed. Let CI run; it'll pass in seconds.

## Title

Conventional Commits `docs:` or `docs(scope):` prefix. Scope = an existing top-level docs directory or doc kind. Keep under 70 chars.

Examples:
- `docs: add ADR 0009 for cancellation contract`
- `docs(adr): record ADR-0008 stat-stacking ordering`
- `docs(superpowers): codebase architecture deepening plan`
- `docs(changelog): v2.17.0`
- `docs(agents): refresh issue-tracker conventions`
- `docs(skills): add docs-pr skill`

The scope is informative — pick the one that maps to where the change lives, not the topic.

## Body

```markdown
## Summary
- <what changed>
- <why>

Docs-only — no functional change, no tests needed.
```

If a `## Test plan` section makes sense (e.g. ADR has cross-references that need checking, plan has file paths that need to still resolve), fill it with concrete steps. Otherwise omit the section entirely or write `N/A (docs-only)` as the value.

**Never leave a bare `- [ ]` empty checkbox** in the body. Reviewers read it as an outstanding TODO and the PR looks unfinished.

## Labels

This repo does not currently use a `documentation` / `docs` label. Don't invent one.

## Anti-patterns

| Pattern | Why it's wrong |
|---|---|
| `Update docs` / `Fix typo` | Missing `docs:` prefix; breaks the conventional-commit log convention this repo relies on |
| `docs:` title with `src/` changes in diff | Mixed scope — pull the code change into a separate `feat:` / `fix:` / `refactor:` PR |
| `[skip ci]` in commit message | Re-creates the branch-protection deadlock; CI must run for required checks to register |
| Empty `- [ ]` in body | Reviewer mistakes them for outstanding TODOs; either fill in or remove the section |
| `--no-verify` on commit | Bypasses pre-commit hooks (changelog check, etc.) — never skip hooks unless explicitly authorized |

## Mechanics

Assume a feature branch exists with docs-only commits. Run these in order:

```bash
# 1. Push
git push -u origin <branch>

# 2. Open PR (title under 70 chars, conventional-commit prefix)
gh pr create --title "docs(scope): <short summary>" --body "$(cat <<'BODY'
## Summary
- <what changed>
- <why>

Docs-only — no functional change, no tests needed.
BODY
)"

# 3. Watch CI (expect ~30–40s for the no-op pass; if it takes much longer, something is wrong)
gh pr checks <pr-number> --watch

# 4. Squash merge + delete remote branch
gh pr merge <pr-number> --squash --delete-branch

# 5. Cleanup
git checkout main && git pull --ff-only && git branch -d <branch>
```

If the local feature branch was created in an isolated worktree (under `.claude/worktrees/`), remove the worktree first or `--delete-branch` will refuse:

```bash
git worktree remove -f -f <worktree-path>
gh pr merge <pr-number> --squash --delete-branch
```

If CI fails on a docs PR, treat it as a real failure — the workflows ARE supposed to pass on docs (it's a no-op success, not a skip). Common causes: a markdown lint hook added later, a docs path accidentally containing a `.ts`/`.vue` file, branch behind main needing `gh pr update-branch <n>`.

## When this skill does NOT apply

- **Mixed docs + code PR** — ship together as the feature PR using the relevant `feat:` / `fix:` workflow. The ADR / docs ride along; don't carve them out.
- **Release changelog bump tied to a tag** — that's part of the release workflow (see `src/views/ChangelogView.vue` + `.claude/scripts/check-changelog.sh`), not a standalone docs PR.
- **The change is documentation co-located with code** (e.g. a JSDoc / TSDoc block, an inline comment) — that's a code PR.
