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

const { spawn } = require('node:child_process');
const { resolve: resolvePath, join: joinPath } = require('node:path');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');

const rootDir = resolvePath(__dirname, '../..');

// --- Color System ---
const isTTY = process.stdout.isTTY && !process.env.NO_COLOR;

const colors = {
  red: isTTY ? '\x1b[0;31m' : '',
  green: isTTY ? '\x1b[0;32m' : '',
  yellow: isTTY ? '\x1b[1;33m' : '',
  blue: isTTY ? '\x1b[0;34m' : '',
  cyan: isTTY ? '\x1b[0;36m' : '',
  gray: isTTY ? '\x1b[0;90m' : '',
  bold: isTTY ? '\x1b[1m' : '',
  nc: isTTY ? '\x1b[0m' : '',
};

function formatDuration(ms) {
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = (seconds % 60).toFixed(1);
  return `${minutes}m ${remainingSeconds}s`;
}

// --- ComplianceRunner ---

class ComplianceRunner {
  constructor(options = {}) {
    this.mode = options.mode || 'fast';
    this.scope = options.scope || 'all';
    this.autoFix = options.autoFix || false;
    this.nonInteractive = options.nonInteractive || false;
    this.cleanupOnly = options.cleanupOnly || false;

    this.configPath = joinPath(__dirname, 'compliance-config.json');
    this.config = null;

    this.totalChecks = 0;
    this.passedChecks = 0;
    this.failedChecks = 0;
    this.skippedChecks = 0;
    this.results = [];
    this.startTime = Date.now();
    this.timestamp = new Date().toISOString();
  }

  async loadConfig() {
    const raw = await fsPromises.readFile(this.configPath, 'utf8');
    this.config = JSON.parse(raw);
  }

  getTimeout() {
    if (!this.config) return 120;
    const timeouts = this.config.timeouts || {};
    return (timeouts[this.mode] || 120) * 1000;
  }

  runCommand(cmd, checkName) {
    const timeout = this.getTimeout();

    return new Promise(resolve => {
      const startTime = Date.now();
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const child = spawn(cmd, {
        shell: true,
        cwd: rootDir,
        env: { ...process.env, FORCE_COLOR: '0' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const maxOutput = 50 * 1024; // 50KB cap per stream

      child.stdout.on('data', data => {
        if (stdout.length < maxOutput) {
          stdout += data.toString();
        }
      });

      child.stderr.on('data', data => {
        if (stderr.length < maxOutput) {
          stderr += data.toString();
        }
      });

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeout);

      child.on('close', code => {
        clearTimeout(timer);
        const duration = Date.now() - startTime;

        if (timedOut) {
          resolve({
            success: false,
            stdout: stdout.trimEnd(),
            stderr: `Command timed out after ${timeout / 1000}s`,
            duration,
          });
        } else {
          resolve({
            success: code === 0,
            stdout: stdout.trimEnd(),
            stderr: stderr.trimEnd(),
            duration,
          });
        }
      });

      child.on('error', err => {
        clearTimeout(timer);
        const duration = Date.now() - startTime;
        resolve({
          success: false,
          stdout: '',
          stderr: err.message,
          duration,
        });
      });
    });
  }

  shouldRunCheck(checkName, checkConfig) {
    if (!checkConfig.enabled) return false;

    // Scope filter
    if (this.scope !== 'all' && checkConfig.scope !== 'all') {
      if (checkConfig.scope !== this.scope) return false;
    }

    // Mode filter
    switch (this.mode) {
      case 'fast':
        return checkConfig.enabledInFastMode === true;
      case 'ci':
        return checkConfig.enabledInCi === true;
      case 'full':
        return true;
      default:
        return true;
    }
  }

  async runCheck(checkName, checkConfig) {
    this.totalChecks++;

    const { name, description, command, scope, category } = checkConfig;
    const failOnError = checkConfig.thresholds?.failOnError ?? true;

    if (!this.nonInteractive) {
      process.stdout.write(`${colors.cyan}[RUN]${colors.nc} ${name}...`);
    }

    let result = await this.runCommand(command, checkName);
    let status;
    let wasFixed = false;

    if (result.success) {
      this.passedChecks++;
      status = 'passed';
      if (!this.nonInteractive) {
        process.stdout.write(
          `\r${colors.green}[PASS]${colors.nc} ${name} ${
            colors.gray
          }(${formatDuration(result.duration)})${colors.nc}\n`,
        );
      }
    } else if (this.autoFix && checkConfig.autoFixCommand && !result.success) {
      // Attempt auto-fix
      if (!this.nonInteractive) {
        process.stdout.write(
          `\r${colors.yellow}[FIX]${colors.nc} ${name} — running auto-fix...`,
        );
      }

      await this.runCommand(checkConfig.autoFixCommand, `${checkName}_fix`);

      // Re-run the original check
      const retryResult = await this.runCommand(command, checkName);

      if (retryResult.success) {
        this.passedChecks++;
        status = 'fixed';
        wasFixed = true;
        result = retryResult;
        if (!this.nonInteractive) {
          process.stdout.write(
            `\r${colors.green}[FIXED]${colors.nc} ${name} ${
              colors.gray
            }(${formatDuration(retryResult.duration)})${colors.nc}\n`,
          );
        }
      } else if (failOnError) {
        this.failedChecks++;
        status = 'failed';
        result = retryResult;
        if (!this.nonInteractive) {
          process.stdout.write(
            `\r${colors.red}[FAIL]${colors.nc} ${name} ${
              colors.gray
            }(${formatDuration(retryResult.duration)})${colors.nc}\n`,
          );
        }
      } else {
        this.skippedChecks++;
        status = 'warn';
        result = retryResult;
        if (!this.nonInteractive) {
          process.stdout.write(
            `\r${colors.yellow}[WARN]${colors.nc} ${name} ${
              colors.gray
            }(${formatDuration(retryResult.duration)})${colors.nc}\n`,
          );
        }
      }
    } else if (failOnError) {
      this.failedChecks++;
      status = 'failed';
      if (!this.nonInteractive) {
        process.stdout.write(
          `\r${colors.red}[FAIL]${colors.nc} ${name} ${
            colors.gray
          }(${formatDuration(result.duration)})${colors.nc}\n`,
        );
      }
    } else {
      this.skippedChecks++;
      status = 'warn';
      if (!this.nonInteractive) {
        process.stdout.write(
          `\r${colors.yellow}[WARN]${colors.nc} ${name} ${
            colors.gray
          }(${formatDuration(result.duration)})${colors.nc}\n`,
        );
      }
    }

    // Show error output for failures in CI mode
    if (this.mode === 'ci' && !result.success && !wasFixed && result.stderr) {
      const errorPreview = result.stderr.substring(0, 500);
      console.log(`${colors.gray}${errorPreview}${colors.nc}`);
    }

    const checkResult = {
      check: checkName,
      name,
      description,
      status,
      success: result.success || wasFixed,
      stdout: result.stdout,
      stderr: result.stderr,
      error:
        result.success || wasFixed ? null : result.stderr.substring(0, 200),
      scope,
      category,
      durationSeconds: result.duration / 1000,
    };

    this.results.push(checkResult);
    return checkResult;
  }

  async runCleanup() {
    if (!this.nonInteractive) {
      console.log(`\n${colors.cyan}━━━ Cleanup ━━━${colors.nc}`);
    }

    const cleanupCommands = [
      {
        name: 'Remove stale tsbuildinfo files',
        cmd: "find . -name '*.tsbuildinfo' -not -path '*/node_modules/*' -delete 2>/dev/null || true",
      },
    ];

    for (const cleanup of cleanupCommands) {
      if (!this.nonInteractive) {
        process.stdout.write(`  ${cleanup.name}...`);
      }
      await this.runCommand(cleanup.cmd, 'cleanup');
      if (!this.nonInteractive) {
        process.stdout.write(` ${colors.green}done${colors.nc}\n`);
      }
    }
  }

  async runChecks() {
    await this.loadConfig();

    if (this.cleanupOnly) {
      await this.runCleanup();
      return 0;
    }

    // Header
    if (this.nonInteractive) {
      console.log(`=== COMPLIANCE CHECK: Backstage ===`);
      console.log(
        `Mode: ${this.mode} | Scope: ${this.scope} | Timestamp: ${this.timestamp}`,
      );
      console.log('');
    } else {
      console.log('');
      console.log(
        `${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.nc}`,
      );
      console.log(`${colors.bold} Backstage Compliance Check${colors.nc}`);
      console.log(
        `${colors.gray} Mode: ${this.mode} | Scope: ${this.scope}${colors.nc}`,
      );
      console.log(
        `${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.nc}`,
      );
      console.log('');
    }

    if (this.autoFix) {
      await this.runCleanup();
      console.log('');
    }

    // Build check list
    const checks = this.config.checks || {};
    const checksToRun = [];

    for (const [checkName, checkConfig] of Object.entries(checks)) {
      if (this.shouldRunCheck(checkName, checkConfig)) {
        checksToRun.push([checkName, checkConfig]);
      }
    }

    if (checksToRun.length === 0) {
      console.log('No checks to run for the given mode and scope.');
      return 0;
    }

    if (!this.nonInteractive) {
      console.log(
        `${colors.gray}Running ${checksToRun.length} checks...${colors.nc}\n`,
      );
    }

    // Run checks sequentially
    for (const [checkName, checkConfig] of checksToRun) {
      await this.runCheck(checkName, checkConfig);
    }

    // Save report
    await this.saveReport();

    // Print summary and return exit code
    return this.printSummary();
  }

  printSummary() {
    const totalDuration = Date.now() - this.startTime;
    const success = this.failedChecks === 0;

    if (this.nonInteractive) {
      // Structured plain-text output for CI/LLMs
      console.log('');
      console.log('=== COMPLIANCE SUMMARY ===');
      console.log(`Duration: ${formatDuration(totalDuration)}`);
      console.log(`Total Checks: ${this.totalChecks}`);
      console.log(`Passed: ${this.passedChecks}`);
      console.log(`Failed: ${this.failedChecks}`);
      console.log(`Skipped: ${this.skippedChecks}`);
      console.log(`Success: ${success ? 'True' : 'False'}`);

      if (this.failedChecks > 0) {
        console.log('=== FAILED CHECKS ===');
        for (const r of this.results) {
          if (r.status === 'failed') {
            console.log(`- ${r.name}`);
            if (r.error) {
              console.log(`  Error: ${r.error}`);
            }
          }
        }
      }

      console.log('=== END SUMMARY ===');
    } else {
      // Interactive colored output
      console.log('');
      console.log(
        `${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.nc}`,
      );
      console.log(`${colors.bold} Summary${colors.nc}`);
      console.log(
        `${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.nc}`,
      );

      console.log(`  Duration:  ${formatDuration(totalDuration)}`);
      console.log(`  Total:     ${this.totalChecks}`);
      console.log(
        `  ${colors.green}Passed:${colors.nc}    ${this.passedChecks}`,
      );

      if (this.failedChecks > 0) {
        console.log(
          `  ${colors.red}Failed:${colors.nc}    ${this.failedChecks}`,
        );
      } else {
        console.log(`  Failed:    0`);
      }

      if (this.skippedChecks > 0) {
        console.log(
          `  ${colors.yellow}Warnings:${colors.nc}  ${this.skippedChecks}`,
        );
      }

      // Show 10 slowest checks
      const sorted = [...this.results].sort(
        (a, b) => b.durationSeconds - a.durationSeconds,
      );
      const slowest = sorted.slice(0, 10);

      if (slowest.length > 0) {
        console.log('');
        console.log(`${colors.gray}  Slowest checks:${colors.nc}`);
        for (const r of slowest) {
          const icon =
            r.status === 'passed' || r.status === 'fixed'
              ? colors.green
              : r.status === 'failed'
              ? colors.red
              : colors.yellow;
          console.log(
            `  ${icon}${r.durationSeconds.toFixed(1)}s${colors.nc}  ${r.name}`,
          );
        }
      }

      // Failed check details
      const failed = this.results.filter(r => r.status === 'failed');
      if (failed.length > 0) {
        console.log('');
        console.log(`${colors.red}  Failed checks:${colors.nc}`);
        for (const r of failed) {
          console.log(`  ${colors.red}- ${r.name}${colors.nc}`);
          if (r.error) {
            console.log(`    ${colors.gray}${r.error}${colors.nc}`);
          }
        }
      }

      // Recommendations
      console.log('');
      if (success) {
        console.log(`  ${colors.green}All checks passed!${colors.nc}`);
      } else {
        console.log(
          `  ${colors.yellow}Some checks failed. Run with --auto-fix to attempt automatic fixes.${colors.nc}`,
        );
        console.log(
          `  ${colors.gray}To bypass pre-push: git push --no-verify${colors.nc}`,
        );
      }

      console.log('');
    }

    return success ? 0 : 1;
  }

  async saveReport() {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now
      .toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .replace('Z', '');

    const reportDir = joinPath(rootDir, 'compliance_reports', dateStr, 'json');
    const reportPath = joinPath(
      reportDir,
      `compliance_${dateStr}_${timeStr}.json`,
    );

    const totalDuration = Date.now() - this.startTime;

    const report = {
      timestamp: this.timestamp,
      mode: this.mode,
      scope: this.scope,
      autoFix: this.autoFix,
      durationSeconds: totalDuration / 1000,
      summary: {
        total: this.totalChecks,
        passed: this.passedChecks,
        failed: this.failedChecks,
        skipped: this.skippedChecks,
      },
      results: this.results,
      config: this.config,
    };

    try {
      fs.mkdirSync(reportDir, { recursive: true });
      await fsPromises.writeFile(
        reportPath,
        JSON.stringify(report, null, 2),
        'utf8',
      );
      if (!this.nonInteractive) {
        console.log(`${colors.gray}  Report saved: ${reportPath}${colors.nc}`);
      }
    } catch (err) {
      // Non-fatal: report saving shouldn't block compliance results
      if (!this.nonInteractive) {
        console.log(
          `${colors.yellow}  Warning: Could not save report: ${err.message}${colors.nc}`,
        );
      }
    }
  }
}

// --- CLI Argument Parsing ---

function parseArgs(argv) {
  const options = {};
  let i = 0;

  while (i < argv.length) {
    const arg = argv[i];
    switch (arg) {
      case '--mode':
        i++;
        options.mode = argv[i];
        break;
      case '--scope':
        i++;
        options.scope = argv[i];
        break;
      case '--auto-fix':
        options.autoFix = true;
        break;
      case '--interactive':
        options.interactive = true;
        break;
      case '--non-interactive':
        options.nonInteractive = true;
        break;
      case '--cleanup-only':
        options.cleanupOnly = true;
        break;
      default:
        // Unknown arg, ignore
        break;
    }
    i++;
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  // If --non-interactive, disable colors
  if (options.nonInteractive) {
    for (const key of Object.keys(colors)) {
      colors[key] = '';
    }
  }

  const runner = new ComplianceRunner(options);
  const exitCode = await runner.runChecks();
  process.exit(exitCode);
}

main().catch(error => {
  console.error(error.stack);
  process.exit(1);
});
