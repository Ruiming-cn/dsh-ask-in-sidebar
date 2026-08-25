# Releasing

## Prerequisites

- `gh` CLI authenticated with repository write access.
- Local DSH plugin sources with `npm`/`node` available.

## Steps

```bash
# 1. Build and verify
npm run check

# 2. Create the npm tarball
npm pack

# 3. Tag and create the GitHub release with the tarball asset
gh release create v0.1.0 \
  --repo Ruiming-cn/dsh-ask-in-sidebar \
  --title "dsh-ask-in-sidebar v0.1.0" \
  --notes "See CHANGELOG.md" \
  ./dsh-ask-in-sidebar-0.1.0.tgz

# 4. Verify repository metadata
gh repo view Ruiming-cn/dsh-ask-in-sidebar --json description,repositoryTopics
gh release view v0.1.0 --repo Ruiming-cn/dsh-ask-in-sidebar
```

## Repository metadata

Keep the following in sync before each release:

- `package.json` description, keywords, repository/homepage/bugs fields.
- `README.md` (Chinese) and `README.en.md` (English).
- `CHANGELOG.md`.
