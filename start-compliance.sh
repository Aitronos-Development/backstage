#!/bin/bash
# Copyright 2026 The Backstage Authors
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

set -euo pipefail

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Color System — disabled when output is not a terminal
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
if [ -t 1 ]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  BLUE='\033[0;34m'
  CYAN='\033[0;36m'
  GRAY='\033[0;90m'
  BOLD='\033[1m'
  NC='\033[0m'
else
  RED=''
  GREEN=''
  YELLOW=''
  BLUE=''
  CYAN=''
  GRAY=''
  BOLD=''
  NC=''
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Paths
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPLIANCE_DIR="$SCRIPT_DIR/scripts/compliance"
ENGINE="$COMPLIANCE_DIR/compliance-runner.js"
MENU="$COMPLIANCE_DIR/compliance-menu.js"
CONFIG="$COMPLIANCE_DIR/compliance-config.json"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Logging Helpers
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; }

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Infrastructure Checks (auto-install missing deps)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Prompt the user with a yes/no question. Returns 0 for yes, 1 for no.
ask_yes_no() {
  local prompt="$1"
  local answer
  echo -n -e "${YELLOW}$prompt [y/N]${NC} "
  read -r answer
  case "$answer" in
    [yY]|[yY][eE][sS]) return 0 ;;
    *) return 1 ;;
  esac
}

# Check if Homebrew is available (common on macOS)
has_brew() {
  command -v brew &> /dev/null
}

check_node() {
  if ! command -v node &> /dev/null; then
    error "Node.js is not installed."
    echo ""

    # Check for nvm first
    if [ -f "$HOME/.nvm/nvm.sh" ]; then
      if ask_yes_no "nvm found but not loaded. Load nvm and install Node.js 22?"; then
        # shellcheck source=/dev/null
        source "$HOME/.nvm/nvm.sh"
        nvm install 22
        nvm use 22
        success "Node.js $(node --version) installed via nvm"
        return 0
      fi
    fi

    if has_brew; then
      if ask_yes_no "Install Node.js 22 via Homebrew?"; then
        info "Installing Node.js 22..."
        brew install node@22
        brew link --overwrite node@22 2>/dev/null
        if command -v node &> /dev/null; then
          success "Node.js $(node --version) installed via Homebrew"
          return 0
        else
          error "Installation completed but node not found in PATH."
          error "Try: brew link --overwrite node@22"
          exit 1
        fi
      fi
    fi

    if ask_yes_no "Install nvm (Node Version Manager) and Node.js 22?"; then
      info "Installing nvm..."
      curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
      export NVM_DIR="$HOME/.nvm"
      # shellcheck source=/dev/null
      [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
      nvm install 22
      nvm use 22
      success "Node.js $(node --version) installed via nvm"
      return 0
    fi

    error "Node.js v22 or v24 is required. Install from: https://nodejs.org/"
    exit 1
  fi

  local node_version
  node_version=$(node --version 2>/dev/null)
  local major_version
  major_version=$(echo "$node_version" | sed 's/^v//' | cut -d. -f1)

  if [[ "$major_version" != "22" && "$major_version" != "24" ]]; then
    error "Node.js $node_version detected. Backstage requires v22 or v24."
    echo ""

    # Try nvm auto-fix
    if [ -f "$HOME/.nvm/nvm.sh" ]; then
      if ask_yes_no "Switch to Node.js 22 using nvm?"; then
        # shellcheck source=/dev/null
        source "$HOME/.nvm/nvm.sh"
        if nvm ls 22 &>/dev/null; then
          nvm use 22
        else
          nvm install 22
          nvm use 22
        fi
        success "Switched to Node.js $(node --version) via nvm"
        return 0
      fi
    elif command -v nvm &> /dev/null; then
      if ask_yes_no "Switch to Node.js 22 using nvm?"; then
        if nvm ls 22 &>/dev/null; then
          nvm use 22
        else
          nvm install 22
          nvm use 22
        fi
        success "Switched to Node.js $(node --version) via nvm"
        return 0
      fi
    elif has_brew; then
      if ask_yes_no "Install Node.js 22 via Homebrew?"; then
        brew install node@22
        brew link --overwrite node@22 2>/dev/null
        if command -v node &> /dev/null; then
          local new_version
          new_version=$(node --version 2>/dev/null | sed 's/^v//' | cut -d. -f1)
          if [[ "$new_version" == "22" ]]; then
            success "Node.js $(node --version) installed via Homebrew"
            return 0
          fi
        fi
        warn "Installed but current shell still sees $node_version."
        warn "Try opening a new terminal or run: brew link --overwrite node@22"
        exit 1
      fi
    fi

    error "Please install Node.js v22 or v24 and re-run this script."
    exit 1
  fi
  success "Node.js: $node_version"
}

check_yarn() {
  if ! command -v yarn &> /dev/null; then
    error "Yarn is not installed."
    echo ""

    if command -v corepack &> /dev/null; then
      if ask_yes_no "Enable Yarn via corepack?"; then
        info "Running: corepack enable"
        corepack enable
        if command -v yarn &> /dev/null; then
          success "Yarn $(yarn --version) enabled via corepack"
          return 0
        else
          error "corepack enable ran but yarn still not found. Try opening a new terminal."
          exit 1
        fi
      fi
    else
      if ask_yes_no "Install Yarn? (will run: npm install -g corepack && corepack enable)"; then
        npm install -g corepack 2>/dev/null
        corepack enable
        if command -v yarn &> /dev/null; then
          success "Yarn $(yarn --version) installed"
          return 0
        else
          error "Installation ran but yarn still not found. Try opening a new terminal."
          exit 1
        fi
      fi
    fi

    error "Yarn 4.x is required. Install via: corepack enable"
    exit 1
  fi

  local yarn_version
  yarn_version=$(yarn --version 2>/dev/null)
  local major_version
  major_version=$(echo "$yarn_version" | cut -d. -f1)

  if [[ "$major_version" != "4" ]]; then
    error "Yarn $yarn_version detected. Backstage requires Yarn 4.x."
    echo ""

    if ask_yes_no "Upgrade Yarn to 4.x via corepack?"; then
      corepack enable
      corepack prepare yarn@4.8.1 --activate 2>/dev/null
      local new_version
      new_version=$(yarn --version 2>/dev/null)
      if [[ "$(echo "$new_version" | cut -d. -f1)" == "4" ]]; then
        success "Yarn upgraded to $new_version"
        return 0
      else
        warn "Upgrade attempted but version is still $new_version."
        warn "Try: corepack prepare yarn@4.8.1 --activate"
        exit 1
      fi
    fi

    error "Please upgrade Yarn to 4.x: corepack enable && corepack prepare yarn@4.8.1 --activate"
    exit 1
  fi
  success "Yarn: $yarn_version"
}

check_deps() {
  if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    if ask_yes_no "node_modules not found. Run yarn install?"; then
      info "Running yarn install..."
      if ! (cd "$SCRIPT_DIR" && yarn install); then
        error "yarn install failed. Please fix dependency issues and try again."
        exit 1
      fi
      success "Dependencies installed"
    else
      error "Dependencies are required to run compliance checks. Please run: yarn install"
      exit 1
    fi
  else
    success "Dependencies: node_modules present"
  fi
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Setup (orchestrates all checks)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

setup_environment() {
  check_node
  check_yarn
  check_deps

  # Verify compliance scripts exist
  if [ ! -f "$ENGINE" ]; then
    error "Compliance engine not found at ${ENGINE}"
    echo "  Expected: scripts/compliance/compliance-runner.js"
    exit 1
  fi

  if [ ! -f "$CONFIG" ]; then
    error "Compliance config not found at ${CONFIG}"
    echo "  Expected: scripts/compliance/compliance-config.json"
    exit 1
  fi
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Core Functions
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

run_compliance() {
  cd "$SCRIPT_DIR"
  node "$ENGINE" "$@"
}

show_help() {
  echo ""
  echo -e "${BOLD}Backstage Compliance Check${NC}"
  echo ""
  echo -e "${CYAN}Usage:${NC}"
  echo "  ./start-compliance.sh                    Interactive menu (or fast mode fallback)"
  echo "  ./start-compliance.sh [command]           Run a specific command"
  echo "  ./start-compliance.sh [flags]             Pass flags to the compliance engine"
  echo ""
  echo -e "${CYAN}Commands:${NC}"
  echo "  help, h, --help, -h      Show this help message"
  echo "  status, st               Show status dashboard"
  echo "  interactive, menu        Launch interactive arrow-key menu"
  echo "  setup-hooks              Install pre-push git hook"
  echo ""
  echo -e "${CYAN}Flags (passed to compliance engine):${NC}"
  echo "  --mode <fast|full|ci>    Check mode (default: fast)"
  echo "    fast                     ESLint, Prettier, TypeScript, Lockfile, Cleanliness (~60-120s)"
  echo "    full                     All enabled checks (~3-5min)"
  echo "    ci                       CI-equivalent checks with structured output"
  echo "  --scope <scope>          Filter checks by scope"
  echo "    all                      All scopes (default)"
  echo "    packages                 Package checks only"
  echo "    plugins                  Plugin checks only"
  echo "    docs                     Documentation checks only"
  echo "  --auto-fix               Attempt to auto-fix issues"
  echo "  --non-interactive        Structured output for CI/LLMs (no colors)"
  echo "  --cleanup-only           Run only cleanup tasks"
  echo ""
  echo -e "${CYAN}Examples:${NC}"
  echo "  ./start-compliance.sh --mode fast --auto-fix    Fast check with auto-fix"
  echo "  ./start-compliance.sh --mode full               Run all checks"
  echo "  ./start-compliance.sh --mode ci --non-interactive   CI mode"
  echo "  ./start-compliance.sh setup-hooks               Install pre-push hook"
  echo ""
  echo -e "${CYAN}Pre-push hook:${NC}"
  echo "  When installed, runs fast mode checks before every git push."
  echo "  Bypass with: git push --no-verify"
  echo ""
}

show_status() {
  echo ""
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD} Backstage Compliance Status${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""

  # Engine presence
  if [ -f "$ENGINE" ]; then
    echo -e "  Compliance Engine:   ${GREEN}Found${NC}"
  else
    echo -e "  Compliance Engine:   ${RED}Missing${NC}"
  fi

  # Config presence
  if [ -f "$CONFIG" ]; then
    echo -e "  Compliance Config:   ${GREEN}Found${NC}"
  else
    echo -e "  Compliance Config:   ${RED}Missing${NC}"
  fi

  # Menu presence
  if [ -f "$MENU" ]; then
    echo -e "  Interactive Menu:    ${GREEN}Found${NC}"
  else
    echo -e "  Interactive Menu:    ${RED}Missing${NC}"
  fi

  # Pre-push hook
  if [ -f "$SCRIPT_DIR/.husky/pre-push" ]; then
    echo -e "  Pre-push Hook:       ${GREEN}Installed${NC}"
  else
    echo -e "  Pre-push Hook:       ${YELLOW}Not installed${NC} (run: ./start-compliance.sh setup-hooks)"
  fi

  echo ""

  # Tool availability
  echo -e "  ${BOLD}Tool Availability:${NC}"

  for tool in node yarn; do
    if command -v "$tool" &> /dev/null; then
      local version
      version=$("$tool" --version 2>/dev/null || echo "unknown")
      echo -e "    $tool:${GREEN} $version${NC}"
    else
      echo -e "    $tool:${RED} not found${NC}"
    fi
  done

  # node_modules
  if [ -d "$SCRIPT_DIR/node_modules" ]; then
    echo -e "    deps:${GREEN} node_modules present${NC}"
  else
    echo -e "    deps:${RED} node_modules missing${NC} (run: yarn install)"
  fi

  echo ""

  # Latest report
  local report_dir="$SCRIPT_DIR/compliance_reports"
  if [ -d "$report_dir" ]; then
    local latest_report
    latest_report=$(find "$report_dir" -name "compliance_*.json" -type f 2>/dev/null | sort -r | head -1)
    if [ -n "$latest_report" ]; then
      echo -e "  ${BOLD}Latest Report:${NC}"
      echo -e "    ${GRAY}$latest_report${NC}"

      # Extract summary from the JSON report
      if command -v node &> /dev/null; then
        local summary
        summary=$(node -e "
          const r = require('$latest_report');
          const s = r.summary;
          console.log('    Mode: ' + r.mode + ' | Duration: ' + r.durationSeconds.toFixed(1) + 's');
          console.log('    Passed: ' + s.passed + ' | Failed: ' + s.failed + ' | Skipped: ' + s.skipped);
        " 2>/dev/null || echo "    (could not parse report)")
        echo -e "  $summary"
      fi
    else
      echo -e "  ${BOLD}Latest Report:${NC} ${GRAY}None${NC}"
    fi
  else
    echo -e "  ${BOLD}Latest Report:${NC} ${GRAY}No reports yet${NC}"
  fi

  echo ""
}

setup_pre_push_hook() {
  local husky_dir="$SCRIPT_DIR/.husky"

  if [ ! -d "$husky_dir" ]; then
    error ".husky directory not found"
    echo "  Run 'yarn install' first to set up husky."
    exit 1
  fi

  local hook_file="$husky_dir/pre-push"

  if [ -f "$hook_file" ]; then
    echo -e "${YELLOW}Pre-push hook already exists at .husky/pre-push${NC}"
    echo -e "${GRAY}Current contents:${NC}"
    cat "$hook_file"
    echo ""
    read -r -p "Overwrite? [y/N] " response
    case "$response" in
      [yY][eE][sS]|[yY])
        ;;
      *)
        echo "Skipped."
        return
        ;;
    esac
  fi

  cat > "$hook_file" << 'HOOK'
./start-compliance.sh --mode fast --non-interactive
HOOK

  chmod +x "$hook_file"
  success "Pre-push hook installed at .husky/pre-push"
  echo -e "  ${GRAY}Fast compliance checks will run before every git push.${NC}"
  echo -e "  ${GRAY}Bypass with: git push --no-verify${NC}"

  # Verify pre-commit still exists
  if [ ! -f "$husky_dir/pre-commit" ]; then
    echo ""
    warn ".husky/pre-commit is missing."
    warn "The existing lint-staged pre-commit hook may have been removed."
  fi
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Main CLI Dispatch
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

main() {
  local command="${1:-}"

  case "$command" in
    help|h|--help|-h)
      show_help
      exit 0
      ;;
    status|st)
      show_status
      exit 0
      ;;
    interactive|menu)
      setup_environment
      if [ -f "$MENU" ]; then
        cd "$SCRIPT_DIR"
        node "$MENU"
      else
        warn "Interactive menu not found, falling back to fast mode..."
        run_compliance --mode fast
      fi
      exit $?
      ;;
    setup-hooks|install-hooks)
      setup_pre_push_hook
      exit 0
      ;;
    "")
      # No arguments — try menu, fallback to fast mode
      setup_environment
      if [ -f "$MENU" ] && [ -t 0 ]; then
        cd "$SCRIPT_DIR"
        node "$MENU"
      else
        run_compliance --mode fast
      fi
      exit $?
      ;;
    *)
      # Pass everything through to the engine
      setup_environment
      run_compliance "$@"
      exit $?
      ;;
  esac
}

main "$@"
