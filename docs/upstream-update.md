# OpenCode Upstream Update Procedure

> When to run: when a new OpenCode release is available and BetterCode needs the updates.

## Prerequisites

- Working tree clean on `plugin-wrapper` or `dev` branch.
- `upstream` remote configured (`git remote -v` shows `upstream → anomalyco/opencode`).
- All BetterCode tests pass locally.

## Steps

### 1. Create an update branch

```bash
git checkout dev
git pull origin dev
git checkout -b upstream-update
```

### 2. Fetch upstream

```bash
git fetch upstream
```

### 3. Merge or rebase

```bash
# Preferred: rebase (cleaner history)
git rebase upstream/dev

# Or merge (preserves branch topology)
git merge upstream/dev
```

### 4. Resolve conflicts

Rules for conflict resolution:

- **Never** modify BetterCode autonomous packages (`packages/project-brain`, `packages/quality-gate`, `packages/context-budget`, `packages/diff-risk`, `packages/benchmark`, `packages/shared`) to satisfy upstream.
- If `packages/cli` conflicts, prefer the upstream version. The BetterCode wrapper is now separate in `packages/bettercode-cli`.
- If `packages/plugin` (the SDK) conflicts, it's purely upstream — accept upstream.
- If the `Hooks` interface changes in `packages/plugin/src/index.ts`, adapt `packages/bettercode-plugin` to the new hook signatures. This is the ONLY BetterCode package that may need changes after an upstream update.
- Document any hook changes in `specs/opencode-extension-points.md`.

### 5. Run all BetterCode tests

```bash
cd packages/bettercode-cli && bun typecheck && bun test
cd packages/bettercode-plugin && bun typecheck && bun test
cd packages/project-brain && bun typecheck && bun test
cd packages/quality-gate && bun typecheck && bun test
cd packages/context-budget && bun typecheck && bun test
cd packages/diff-risk && bun typecheck && bun test
cd packages/shared && bun typecheck
```

### 6. Run integration checks

```bash
bun run --cwd packages/bettercode-cli doctor
bun run --cwd packages/bettercode-cli sync
```

### 7. Verify no forbidden imports

```bash
# PowerShell (Windows)
Get-ChildItem packages/project-brain,packages/quality-gate,packages/context-budget,packages/diff-risk,packages/benchmark,packages/shared -Recurse -Filter "*.ts" | Select-String -Pattern "packages/opencode/src|@opencode-ai/opencode"
# Should return no results
```

### 8. Review diff

Check that:
- No rebrand (no global rename of OpenCode).
- No BetterCode logic inside OpenCode packages.
- Patch queue is still valid.
- `specs/opencode-extension-points.md` is current.

### 9. Merge to plugin-wrapper

```bash
git checkout plugin-wrapper
git merge upstream-update
git branch -D upstream-update
```

### 10. Push

```bash
git push --no-verify
```

## Post-merge checklist

- [ ] All BetterCode tests pass.
- [ ] No forbidden imports in autonomous packages.
- [ ] `bettercode doctor` reports healthy.
- [ ] `specs/opencode-extension-points.md` updated if hooks changed.
- [ ] Patch queue still empty or valid.

## If a patch is needed

1. Document the gap in `specs/opencode-extension-points.md`.
2. Create the patch in `patches/opencode/`.
3. Submit an upstream PR to make the patch temporary.
4. Remove the patch when upstream merges the change.
