# Releasing

## Prerequisites

- `gh` CLI authenticated with repository write access.
- Local DSH plugin sources with `npm`/`node` available.

## Steps

```bash
# 1. Build and verify
npm run check

# 2. Create the npm tarball (writes dsh-ask-in-sidebar-0.2.1.tgz)
npm pack

# 3. Tag and create the GitHub release, attaching the prebuilt tarball
gh release create v0.2.1 \
  --repo Ruiming-cn/dsh-ask-in-sidebar \
  --title "dsh-ask-in-sidebar v0.2.1" \
  --notes "See CHANGELOG.md" \
  ./dsh-ask-in-sidebar-0.2.1.tgz

# 4. Verify repository metadata
gh repo view Ruiming-cn/dsh-ask-in-sidebar --json description,repositoryTopics
gh release view v0.2.1 --repo Ruiming-cn/dsh-ask-in-sidebar
```

The GitHub release must carry the `npm pack` output
(`dsh-ask-in-sidebar-0.2.1.tgz`) as a release asset; the release command above
uploads it and users can install it directly.

## Repository metadata

Keep the following in sync before each release:

- `package.json` description, keywords, repository/homepage/bugs fields.
- `README.md` (Chinese) and `README.en.md` (English).
- `CHANGELOG.md`.
