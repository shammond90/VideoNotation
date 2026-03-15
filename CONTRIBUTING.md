# Contributing to VideoNotation

## Branching Strategy

VideoNotation uses a three-tier branching model:

### Branch Types

| Branch | Purpose | Protection | Merge Source |
|--------|---------|-----------|--------------|
| `main` | **Production** — Stable, release-ready code. Tagged with semver versions. | ✅ Protected | `staging` only (hotfix from `hotfix/*` for critical urgent fixes) |
| `staging` | **Staging/UAT** — Validated before production. Pre-release testing. | ✅ Protected | `feature/*`, `bugfix/*` branches |
| `feature/*` | **Feature Development** — New features, use `feature/description` | ❌ Unprotected | Merge to `staging` when ready |
| `bugfix/*` | **Bug Fixes** — Bug corrections, use `bugfix/issue-number-description` | ❌ Unprotected | Merge to `staging` when ready |
| `hotfix/*` | **Critical Hotfixes** — Urgent production fixes only | ❌ Unprotected | Directly to `main`, then back-merge to `staging` |

## Commit Message Convention

All commits must follow the **Conventional Commits** standard, enforced by `commitlint`:

### Format
```
<type>[scope]: <subject>

<body>

<footer>
```

### Types

| Type | Usage | Version Impact |
|------|-------|-----------------|
| **feat** or `[FEATURE]` | New feature | Minor (0.X.0) |
| **fix** or `[BUGFIX]` | Bug fix | Patch (0.0.X) |
| **hotfix** or `[HOTFIX]` | Critical production fix | Patch (0.0.X) |
| **docs** | Documentation only | None |
| **style** | Code style (no logic change) | None |
| **refactor** | Code refactor (no behavior change) | None |
| **perf** | Performance improvement | Patch (0.0.X) |
| **test** | Test additions/updates | None |
| **chore** `[CHORE]` | Build, deps, config | None |
| **ci** | CI/CD updates | None |

### Examples

**Feature:**
```
[FEATURE] Add Go To dialog for jumping to cues

Allows users to quickly jump to a specific timecode or cue reference
using the G hotkey. Supports HH:MM:SS:FF format and cue type/number.
```

**Bugfix:**
```
[BUGFIX] Fix fullscreen controls auto-hide timing

Controls were disappearing in <1s instead of 3s. Now uses React state
with inline styles to ensure visibility in Fullscreen API top layer.
```

**Hotfix (urgent production fix):**
```
[HOTFIX] Fix critical video sync issue in user dashboard
```

**Chore:**
```
[CHORE] Add commitlint and GitHub Actions automation
```

**Breaking Change:**
```
[FEATURE] Redesign annotation storage schema

BREAKING CHANGE: Old annotation format no longer supported.
Migration script available in docs/migration-v1.md.
```

---

## Workflow

### Starting a Feature

```bash
# Pull latest staging
git checkout staging
git pull origin staging

# Create feature branch
git checkout -b feature/your-feature-name

# Make commits with proper messages
git commit -m "[FEATURE] Add new feature description"
git commit -m "[BUGFIX] Fix related issue"

# Push and create pull request
git push origin feature/your-feature-name
```

### Merging to Staging

1. Push your branch to GitHub
2. Create a Pull Request targeting `staging`
3. Ensure all CI checks pass
4. Request review from team
5. Merge with "Squash and merge" (keeps history clean) or "Create a merge commit" (preserves branch history)
6. Delete the feature branch

### Releasing to Production

```bash
# Ensure main is up-to-date with staging
git checkout main
git pull origin main

# Merge staging into main
git merge --no-ff staging  # Preserves merge commit
git push origin main

# GitHub Actions automatically:
# 1. Parses commits since last tag
# 2. Determines next version (semver)
# 3. Creates git tag (e.g., v0.9.2)
# 4. Generates release notes
# 5. Creates GitHub Release
```

### Emergency Hotfix (Production Only)

```bash
# Create hotfix from main
git checkout main
git pull origin main
git checkout -b hotfix/critical-bug-description

# Fix and commit
git commit -m "[HOTFIX] Fix critical production issue"

# Push to GitHub and create PR targeting main
git push origin hotfix/critical-bug-description

# After merge to main, back-merge to staging
git checkout staging
git pull origin staging
git merge hotfix/critical-bug-description
git push origin staging
```

---

## Pull Request Guidelines

- **Title:** Use the commit message convention (e.g., `[FEATURE] Add Go To dialog`)
- **Description:** Explain what changed and why (link to related issues if applicable)
- **Tests:** Include tests for new features; update tests for bugfixes
- **Documentation:** Update README or docs if user-facing features change
- **Size:** Keep PRs reasonably sized (easier to review)

---

## Version Numbering (Semantic Versioning)

Current version: **v0.9.1**

Format: `v<MAJOR>.<MINOR>.<PATCH>`

- **MAJOR** (X.0.0): Breaking changes or major feature releases
- **MINOR** (0.X.0): New features (backwards compatible)
- **PATCH** (0.0.X): Bug fixes (backwards compatible)

Examples:
- `v0.9.1` → `v0.10.0` (feature → minor bump)
- `v0.10.0` → `v0.10.1` (bugfix → patch bump)
- `v0.10.1` → `v1.0.0` (major release)

Version bumping is **automated** by GitHub Actions on merge to `main`.

---

## Branch Protection Rules

The following rules are **enabled on `main` and `staging`** (verify in Settings → Branches):

- ✅ Require a pull request before merging
- ✅ Require code review approvals (1+ reviewer)
- ✅ Require status checks to pass (GitHub Actions CI)
- ✅ Require branches to be up to date before merging
- ✅ Require signed commits (optional, recommended for `main`)

---

## Commit Linting

Commits are validated automatically using `commitlint`. Invalid messages will fail the commit:

```bash
# This will fail
git commit -m "fix the thing"  # Missing type

# This will pass
git commit -m "[BUGFIX] Fix the video sync issue"  # Valid type
```

If you accidentally commit something invalid (before push), amend:

```bash
git commit --amend -m "[BUGFIX] Fix the video sync issue"
git push origin feature/your-branch --force-with-lease
```

---

## Questions?

- Create an issue in GitHub for questions or discussions
- Reference existing issues in commit messages: `Fixes #123`
- Use PRs for all code changes (no direct pushes to protected branches)

---

**Last Updated:** Current session  
**Enforced By:** husky + commitlint + GitHub Actions + Branch Protection Rules
