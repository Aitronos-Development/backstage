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
const { resolve: resolvePath } = require('node:path');
const readline = require('node:readline');

const rootDir = resolvePath(__dirname, '../..');
const runnerPath = resolvePath(__dirname, 'compliance-runner.js');

// --- Colors ---
const c = {
  cyan: '\x1b[0;36m',
  green: '\x1b[0;32m',
  yellow: '\x1b[1;33m',
  gray: '\x1b[0;90m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  nc: '\x1b[0m',
  clearLine: '\x1b[2K',
  cursorUp: n => `\x1b[${n}A`,
  cursorDown: n => `\x1b[${n}B`,
  hideCursor: '\x1b[?25l',
  showCursor: '\x1b[?25h',
};

// --- Menu Definitions ---

const MAIN_MENU = {
  title: 'Backstage Compliance',
  items: [
    {
      label: 'Fast Check + Auto-Fix',
      hint: 'recommended',
      args: ['--mode', 'fast', '--auto-fix'],
    },
    {
      label: 'Auto-Fix All Issues',
      hint: 'full mode',
      args: ['--auto-fix'],
    },
    {
      label: 'Full Check',
      hint: 'all checks',
      args: ['--mode', 'full'],
    },
    {
      label: 'CI Mode',
      hint: 'exact CI output',
      args: ['--mode', 'ci', '--non-interactive'],
    },
    {
      label: 'Package Checks',
      hint: '>',
      submenu: 'packages',
    },
    {
      label: 'Plugin Checks',
      hint: '>',
      submenu: 'plugins',
    },
    {
      label: 'Documentation Checks',
      hint: '>',
      submenu: 'docs',
    },
    {
      label: 'Cleanup Only',
      hint: '',
      args: ['--cleanup-only'],
    },
    {
      label: 'Status & Reports',
      hint: '',
      action: 'status',
    },
    {
      label: 'Exit',
      hint: '',
      action: 'exit',
    },
  ],
};

const SUBMENUS = {
  packages: {
    title: 'Package Checks',
    items: [
      {
        label: 'Fast Check',
        hint: '',
        args: ['--mode', 'fast', '--scope', 'packages'],
      },
      {
        label: 'Full Check',
        hint: '',
        args: ['--mode', 'full', '--scope', 'packages'],
      },
      {
        label: 'Auto-Fix',
        hint: '',
        args: ['--auto-fix', '--scope', 'packages'],
      },
      { label: 'Back', hint: '', action: 'back' },
    ],
  },
  plugins: {
    title: 'Plugin Checks',
    items: [
      {
        label: 'Fast Check',
        hint: '',
        args: ['--mode', 'fast', '--scope', 'plugins'],
      },
      {
        label: 'Full Check',
        hint: '',
        args: ['--mode', 'full', '--scope', 'plugins'],
      },
      {
        label: 'Auto-Fix',
        hint: '',
        args: ['--auto-fix', '--scope', 'plugins'],
      },
      { label: 'Back', hint: '', action: 'back' },
    ],
  },
  docs: {
    title: 'Documentation Checks',
    items: [
      {
        label: 'Full Check',
        hint: '',
        args: ['--mode', 'full', '--scope', 'docs'],
      },
      {
        label: 'CI Mode',
        hint: '',
        args: ['--mode', 'ci', '--scope', 'docs'],
      },
      { label: 'Back', hint: '', action: 'back' },
    ],
  },
};

// --- Command Execution ---

function runComplianceCommand(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [runnerPath, ...args], {
      cwd: rootDir,
      stdio: 'inherit',
    });

    child.on('close', code => {
      resolve(code);
    });

    child.on('error', err => {
      reject(err);
    });
  });
}

function runStatusCommand() {
  return new Promise((resolve, reject) => {
    const child = spawn('./start-compliance.sh', ['status'], {
      cwd: rootDir,
      stdio: 'inherit',
    });

    child.on('close', code => {
      resolve(code);
    });

    child.on('error', err => {
      reject(err);
    });
  });
}

// --- Interactive Menu (Raw Terminal Mode) ---

class InteractiveMenu {
  constructor() {
    this.selectedIndex = 0;
    this.currentMenu = MAIN_MENU;
    this.menuStack = [];
    this.renderedLines = 0;
  }

  clearRendered() {
    if (this.renderedLines > 0) {
      // Move cursor up and clear each line
      for (let i = 0; i < this.renderedLines; i++) {
        process.stdout.write(c.cursorUp(1) + c.clearLine + '\r');
      }
      this.renderedLines = 0;
    }
  }

  render() {
    this.clearRendered();

    const lines = [];
    lines.push('');
    lines.push(`${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.nc}`);
    lines.push(`${c.bold} ${this.currentMenu.title}${c.nc}`);
    lines.push(`${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.nc}`);
    lines.push('');

    for (let i = 0; i < this.currentMenu.items.length; i++) {
      const item = this.currentMenu.items[i];
      const isSelected = i === this.selectedIndex;

      if (isSelected) {
        const hint = item.hint ? ` ${c.gray}(${item.hint})${c.nc}` : '';
        lines.push(`  ${c.green}> ${item.label}${c.nc}${hint}`);
      } else {
        const hint = item.hint ? ` ${c.gray}(${item.hint})${c.nc}` : '';
        lines.push(`    ${c.dim}${item.label}${c.nc}${hint}`);
      }
    }

    lines.push('');
    lines.push(
      `${c.gray}  ↑↓ navigate  Enter/→ select  Esc/← back  Ctrl+C exit${c.nc}`,
    );
    lines.push('');

    const output = lines.join('\n');
    process.stdout.write(output);
    this.renderedLines = lines.length;
  }

  async handleSelection() {
    const item = this.currentMenu.items[this.selectedIndex];

    if (item.action === 'exit') {
      return 'exit';
    }

    if (item.action === 'back') {
      return 'back';
    }

    if (item.action === 'status') {
      return 'status';
    }

    if (item.submenu) {
      return { submenu: item.submenu };
    }

    if (item.args) {
      return { run: item.args };
    }

    return null;
  }

  async run() {
    // Check if we have a TTY
    if (!process.stdin.isTTY) {
      return this.runFallback();
    }

    process.stdout.write(c.hideCursor);

    // Save original terminal state
    const wasRaw = process.stdin.isRaw;

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    this.render();

    const cleanup = () => {
      process.stdout.write(c.showCursor);
      process.stdin.setRawMode(wasRaw || false);
      process.stdin.pause();
    };

    return new Promise(resolve => {
      const onData = async data => {
        const key = data;

        // Ctrl+C
        if (key === '\x03') {
          this.clearRendered();
          cleanup();
          process.stdin.removeListener('data', onData);
          resolve(0);
          return;
        }

        // Escape or Left arrow
        if (key === '\x1b' || key === '\x1b[D') {
          if (this.menuStack.length > 0) {
            const prev = this.menuStack.pop();
            this.currentMenu = prev.menu;
            this.selectedIndex = prev.index;
            this.render();
          } else {
            this.clearRendered();
            cleanup();
            process.stdin.removeListener('data', onData);
            resolve(0);
          }
          return;
        }

        // Arrow Up
        if (key === '\x1b[A') {
          this.selectedIndex =
            (this.selectedIndex - 1 + this.currentMenu.items.length) %
            this.currentMenu.items.length;
          this.render();
          return;
        }

        // Arrow Down
        if (key === '\x1b[B') {
          this.selectedIndex =
            (this.selectedIndex + 1) % this.currentMenu.items.length;
          this.render();
          return;
        }

        // Enter or Right arrow
        if (key === '\r' || key === '\n' || key === '\x1b[C') {
          const result = await this.handleSelection();

          if (result === 'exit') {
            this.clearRendered();
            cleanup();
            process.stdin.removeListener('data', onData);
            resolve(0);
            return;
          }

          if (result === 'back') {
            if (this.menuStack.length > 0) {
              const prev = this.menuStack.pop();
              this.currentMenu = prev.menu;
              this.selectedIndex = prev.index;
              this.render();
            }
            return;
          }

          if (result === 'status') {
            this.clearRendered();
            cleanup();
            process.stdin.removeListener('data', onData);
            try {
              await runStatusCommand();
            } catch (err) {
              console.error(err.message);
            }
            // Re-enter menu after status
            this.renderedLines = 0;
            process.stdout.write(c.hideCursor);
            process.stdin.setRawMode(true);
            process.stdin.resume();
            process.stdin.on('data', onData);
            this.render();
            return;
          }

          if (result && result.submenu) {
            this.menuStack.push({
              menu: this.currentMenu,
              index: this.selectedIndex,
            });
            this.currentMenu = SUBMENUS[result.submenu];
            this.selectedIndex = 0;
            this.render();
            return;
          }

          if (result && result.run) {
            this.clearRendered();
            cleanup();
            process.stdin.removeListener('data', onData);

            try {
              const exitCode = await runComplianceCommand(result.run);
              console.log('');
              console.log(
                `${c.gray}Press Enter to return to menu, or Ctrl+C to exit...${c.nc}`,
              );

              // Wait for Enter or Ctrl+C
              process.stdin.setRawMode(true);
              process.stdin.resume();

              const waitForKey = new Promise(resolveKey => {
                const onKey = keyData => {
                  process.stdin.removeListener('data', onKey);
                  if (keyData === '\x03') {
                    process.stdout.write(c.showCursor);
                    process.stdin.setRawMode(false);
                    process.stdin.pause();
                    resolveKey('exit');
                  } else {
                    resolveKey('continue');
                  }
                };
                process.stdin.on('data', onKey);
              });

              const action = await waitForKey;
              if (action === 'exit') {
                resolve(exitCode);
                return;
              }

              // Re-enter menu
              this.renderedLines = 0;
              process.stdout.write(c.hideCursor);
              process.stdin.setRawMode(true);
              process.stdin.resume();
              process.stdin.on('data', onData);
              this.render();
            } catch (err) {
              console.error(err.message);
              resolve(1);
            }
            return;
          }
        }
      };

      process.stdin.on('data', onData);
    });
  }

  // Fallback for non-TTY environments
  async runFallback() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const askQuestion = prompt =>
      new Promise(resolve => {
        rl.question(prompt, answer => {
          resolve(answer.trim());
        });
      });

    let currentMenu = MAIN_MENU;
    const menuStack = [];

    while (true) {
      console.log('');
      console.log(`=== ${currentMenu.title} ===`);
      console.log('');

      for (let i = 0; i < currentMenu.items.length; i++) {
        const item = currentMenu.items[i];
        const hint = item.hint ? ` (${item.hint})` : '';
        console.log(`  ${i + 1}) ${item.label}${hint}`);
      }

      console.log('');
      const answer = await askQuestion(
        `Enter selection (1-${currentMenu.items.length}) or q to quit: `,
      );

      if (answer === 'q' || answer === 'Q') {
        rl.close();
        return 0;
      }

      const index = parseInt(answer, 10) - 1;
      if (isNaN(index) || index < 0 || index >= currentMenu.items.length) {
        console.log('Invalid selection.');
        continue;
      }

      const item = currentMenu.items[index];

      if (item.action === 'exit') {
        rl.close();
        return 0;
      }

      if (item.action === 'back') {
        if (menuStack.length > 0) {
          currentMenu = menuStack.pop();
        }
        continue;
      }

      if (item.action === 'status') {
        try {
          await runStatusCommand();
        } catch (err) {
          console.error(err.message);
        }
        continue;
      }

      if (item.submenu) {
        menuStack.push(currentMenu);
        currentMenu = SUBMENUS[item.submenu];
        continue;
      }

      if (item.args) {
        rl.close();
        try {
          const exitCode = await runComplianceCommand(item.args);
          return exitCode;
        } catch (err) {
          console.error(err.message);
          return 1;
        }
      }
    }
  }
}

// --- Main ---

async function main() {
  const menu = new InteractiveMenu();
  const exitCode = await menu.run();
  process.exit(exitCode);
}

main().catch(error => {
  process.stdout.write(c.showCursor);
  console.error(error.stack);
  process.exit(1);
});
