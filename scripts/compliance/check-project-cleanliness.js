#!/usr/bin/env node
/*
 * Copyright 2026 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* eslint-disable @backstage/no-undeclared-imports */

const { resolve: resolvePath } = require('node:path');
const fs = require('node:fs/promises');

const rootDir = resolvePath(__dirname, '../..');

// Backstage-specific allowlist of expected root-level items
const ALLOWLIST = new Set([
  // Directories
  '.changeset',
  '.claude',
  '.cursor',
  '.devcontainer',
  '.git',
  '.github',
  '.husky',
  '.lighthouseci',
  '.patches',
  '.storybook',
  '.yarn',
  'beps',
  'contrib',
  'docs',
  'docs-ui',
  'microsite',
  'node_modules',
  'packages',
  'plugins',
  'scripts',

  // API testing
  'api-tests',
  'test-repositories',

  // Config files (dotfiles)
  '.clomonitor.yml',
  '.dockerignore',
  '.gitmodules',
  '.mcp.json',
  '.editorconfig',
  '.eslintignore',
  '.eslintrc.js',
  '.gitignore',
  '.imgbotconfig',
  '.npmrc',
  '.prettierignore',
  '.vale.ini',
  '.yarnrc.yml',

  // Config files (root)
  'app-config.dev.yaml',
  'app-config.docker.yaml',
  'app-config.yaml',
  'catalog-info.yaml',
  'docker-compose.deps.yml',
  'knexfile.js',
  'lighthouserc.js',
  'mkdocs.yml',
  'package.json',
  'playwright.config.ts',
  'tsconfig.json',
  'typedoc.json',
  'yarn.lock',

  // Documentation
  'ADOPTERS.md',
  'CODE_OF_CONDUCT.md',
  'CONTRIBUTING.md',
  'DCO',
  'LABELS.md',
  'LICENSE',
  'NOTICE',
  'OWNERS.md',
  'README.md',
  'README-fr_FR.md',
  'README-ko_kr.md',
  'README-zh_Hans.md',
  'REVIEWING.md',
  'SECURITY.md',
  'STYLE.md',

  // Dev infrastructure
  'DEV_INFRASTRUCTURE_SPEC.md',
  'start-compliance.sh',
  'start-dev.sh',
  'compliance_reports',

  // Build artifacts and runtime dirs (gitignored but may exist on disk)
  'dist-types',
  'logs',
  'site',
]);

// Patterns for known gitignored items that may exist on disk (always OK)
const KNOWN_GITIGNORED_PATTERNS = [
  /^\.dev-/, // Dev infrastructure state files (.dev-env-state, .dev-ports-*, etc.)
  /^docker-compose\.deps-.*\.yml$/, // Branch-specific docker compose files
  /^app-config\..*\.yaml$/, // Branch-specific app configs (caught by gitignore glob)
];

// Patterns that indicate cleanup is needed
const CLEANUP_PATTERNS = [
  /\.DS_Store$/,
  /\.swp$/,
  /\.swo$/,
  /\.tmp$/,
  /\.bak$/,
  /\.orig$/,
  /~$/,
  /^npm-debug\.log/,
  /^yarn-debug\.log/,
  /^yarn-error\.log/,
  /\.pyc$/,
  /^__pycache__$/,
  /\.tgz$/,
];

async function main() {
  const items = await fs.readdir(rootDir);
  const issues = [];

  for (const item of items) {
    if (ALLOWLIST.has(item)) continue;

    // Skip items matching known gitignored patterns (dev state files, etc.)
    const isKnownGitignored = KNOWN_GITIGNORED_PATTERNS.some(p => p.test(item));
    if (isKnownGitignored) continue;

    const isCleanupTarget = CLEANUP_PATTERNS.some(p => p.test(item));
    if (isCleanupTarget) {
      issues.push({
        item,
        severity: 'cleanup',
        suggestion: `rm -rf "${item}"`,
      });
    } else {
      issues.push({
        item,
        severity: 'unknown',
        suggestion: `Review whether '${item}' should be in .gitignore or added to the allowlist`,
      });
    }
  }

  if (issues.length > 0) {
    console.error('Project cleanliness issues found:\n');

    const cleanupIssues = issues.filter(i => i.severity === 'cleanup');
    const unknownIssues = issues.filter(i => i.severity === 'unknown');

    if (cleanupIssues.length > 0) {
      console.error('  Cleanup needed:');
      for (const { item, suggestion } of cleanupIssues) {
        console.error(`    - ${item}  (${suggestion})`);
      }
    }

    if (unknownIssues.length > 0) {
      console.error('  Unknown items in project root:');
      for (const { item, suggestion } of unknownIssues) {
        console.error(`    - ${item}  (${suggestion})`);
      }
    }

    console.error(
      `\n  Total issues: ${issues.length} (${cleanupIssues.length} cleanup, ${unknownIssues.length} unknown)`,
    );
    process.exit(1);
  } else {
    console.log('Project root is clean.');
  }
}

main().catch(error => {
  console.error(error.stack);
  process.exit(1);
});
