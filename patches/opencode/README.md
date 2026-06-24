# OpenCode Patches

This directory contains source patches for OpenCode when a plugin extension
point is missing. These are NOT Bun `patchedDependencies` (those live in the
root `patches/` directory for npm packages).

## What belongs here

- Git cherry-pick commits from upstream PRs that haven't been merged yet.
- Diff files (`.patch`) for changes that need to be applied manually.
- Each patch must have a corresponding entry in `specs/opencode-extension-points.md`.

## What does NOT belong here

- Bun package patches (those use `patchedDependencies` in root `package.json`).
- BetterCode-specific logic (that goes in `packages/bettercode-plugin`).
- Renames, refactors, or global rebrands.
- Storage changes without proven need.

## Applying a patch

```bash
# Cherry-pick approach
git cherry-pick <commit-hash>

# Diff approach
git apply patches/opencode/my-change.patch
```

## Removing a patch

When a patch is no longer needed (e.g., upstream merged the change):

1. Remove the `.patch` file from this directory.
2. Remove the entry from `specs/opencode-extension-points.md`.
3. Commit both changes.
