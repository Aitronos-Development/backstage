---
name: compliance
description: Run all compliance checks on the Backstage codebase, auto-fix issues, and ensure everything passes. Use when the user wants to check code quality, fix linting/formatting issues, or prepare code for a PR or push.
disable-model-invocation: true
allowed-tools: Bash, Read, Grep, Glob, Edit, Write, WebSearch, WebFetch, Task, TodoWrite
---

# Compliance Check & Fix Skill

You are a compliance enforcement agent for this Backstage monorepo. Your job is to:

1. **Research** the latest compliance requirements
2. **Run** all checks
3. **Auto-fix** everything possible
4. **Report** what remains

## Step 1: Research Current Compliance Requirements

Search the internet for the latest Backstage contributor compliance requirements to make sure nothing has changed:

- Search for "Backstage contributor guide compliance checks" and "Backstage GitHub CI checks"
- Check https://backstage.io/docs/getting-started/contributors for any updates
- Compare what you find against the checks configured in this repo

Read these local files to understand the current compliance setup:

- `scripts/compliance/compliance-config.json` — all configured checks
- `.github/workflows/ci.yml` — the CI verification pipeline
- `.github/copilot-instructions.md` — contributor guidelines

## Step 2: Run Compliance Checks with Auto-Fix

Run the compliance runner in full mode with auto-fix enabled:

```
bash start-compliance.sh --mode full --auto-fix --non-interactive
```

If the compliance runner is not available or fails to start, fall back to running checks individually in this order:

### 2a. Lockfile Duplicates (auto-fixable)

```
node scripts/verify-lockfile-duplicates.js --fix || yarn dedupe
```

### 2b. Prettier Formatting (auto-fixable)

```
yarn prettier:fix
```

### 2c. ESLint (auto-fixable)

```
yarn backstage-cli repo lint --fix --since origin/master
```

### 2d. TypeScript Type Checking

```
yarn tsc
```

### 2e. Local Dependencies Verification

```
node scripts/verify-local-dependencies.js
```

### 2f. Changeset Verification

```
node scripts/verify-changesets.js
```

### 2g. Peer Dependencies

```
yarn lint:peer-deps
```

### 2h. API Reports

```
yarn build:api-reports
```

### 2i. Config Check

```
yarn backstage-cli config:check --lax
```

### 2j. OpenAPI Schema Lint

```
yarn backstage-repo-tools repo schema openapi lint
yarn backstage-repo-tools repo schema openapi verify
```

### 2k. Catalog Info

```
yarn backstage-repo-tools generate-catalog-info --ci
```

### 2l. Project Cleanliness

```
node scripts/compliance/check-project-cleanliness.js
```

## Step 3: Fix Remaining Issues

After running all checks, analyze the output for failures:

- For **ESLint errors** that weren't auto-fixed: read the failing files, understand the violations, and fix them manually using the Edit tool.
- For **TypeScript errors**: read the error output, navigate to the files, and fix the type issues.
- For **API report diffs**: run `yarn build:api-reports` to regenerate them.
- For **changeset issues**: if changes were made to non-private packages, create appropriate changesets using `yarn changeset add`.
- For **dependency issues**: fix version ranges in the relevant package.json files.
- For **formatting issues** that persisted: run prettier on the specific files.

After fixing, re-run the failing checks to confirm they pass.

## Step 4: Report Results

Provide a clear summary:

1. **Checks passed** — list all checks that passed
2. **Issues auto-fixed** — list what was automatically fixed
3. **Issues manually fixed** — list what you had to fix by hand
4. **Remaining issues** (if any) — list anything that still fails with explanation
5. **Internet research findings** — note any differences found between current repo config and latest Backstage contributor docs

Use a todo list to track progress through all checks so the user can see real-time status.

## Important Notes

- NEVER modify ESLint, Prettier, or TypeScript configuration files unless explicitly asked
- NEVER run `yarn changesets version` or `yarn release`
- If a check is genuinely broken in the repo (not caused by the user's changes), note it but don't try to fix unrelated issues
- Focus fixes on files changed since `origin/master` when possible
- Run checks with timeouts — if a check hangs for more than 5 minutes, skip it and note it in the report
