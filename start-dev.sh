#!/bin/bash
# start-dev.sh — Dev Server Manager for Backstage
#
# Manages the full development lifecycle: Docker containers, environment switching,
# server processes, interactive runtime controls, and per-branch isolation.
#
# Usage: ./start-dev.sh [command] [flags]
#
# Commands:
#   all (default)    Start both frontend and backend
#   backend|be|b     Start backend only
#   frontend|fe|f    Start frontend only
#   env|e [l|d]      Switch environment (local/docker)
#   status|s         Show status dashboard
#   separate         Set up branch-isolated environment and start
#   help|h           Show this help
#
# Flags:
#   --port PORT          Override default server port
#   --backend-port PORT  Set backend port (for frontend proxy)
#   --force              Kill any process on target port before starting
#   --separate           Enable branch isolation before starting
#   --reset-ports        Delete saved port state for current branch
#   --env ENV            Set environment at startup (local/docker)
#
# No set -e — errors handled explicitly with custom recovery paths.

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Section 1: Project Root
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_ROOT" || exit 1

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Section 2: Color/Formatting System
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
BOLD='\033[1m'
NC='\033[0m'

banner() {
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; }

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Section 3: Constants & State File Paths
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DEFAULT_BACKEND_PORT=7007
DEFAULT_FRONTEND_PORT=3000

ENV_STATE_FILE="$PROJECT_ROOT/.dev-env-state"
RELOAD_FREEZE_FILE="$PROJECT_ROOT/.dev-reload-frozen"
DOCKER_COMPOSE_FILE="$PROJECT_ROOT/docker-compose.deps.yml"
HEALTH_ENDPOINT="/.backstage/health/v1/readiness"
LOG_DIR="$PROJECT_ROOT/logs"

# Process state (set during runtime)
BACKEND_PID=""
FRONTEND_PID=""
SERVER_MODE=""  # "backend", "frontend", "all"
SHUTDOWN_IN_PROGRESS=0
SAVED_TTY_SETTINGS=""
SEPARATE_MODE=0
SAFE_BRANCH=""
RESTART_REQUESTED=0

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Section 4: CLI Argument Parsing
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

COMMAND=""
PORT=""
BACKEND_PORT=""
FORCE=0
ENV_FLAG=""
RESET_PORTS=0

parse_args() {
    local positional_set=0

    while [[ $# -gt 0 ]]; do
        case "$1" in
            backend|be|b)
                if [[ $positional_set -eq 0 ]]; then
                    COMMAND="backend"
                    positional_set=1
                fi
                shift
                ;;
            frontend|fe|f)
                if [[ $positional_set -eq 0 ]]; then
                    COMMAND="frontend"
                    positional_set=1
                fi
                shift
                ;;
            all)
                if [[ $positional_set -eq 0 ]]; then
                    COMMAND="all"
                    positional_set=1
                fi
                shift
                ;;
            env|e)
                if [[ $positional_set -eq 0 ]]; then
                    COMMAND="env"
                    positional_set=1
                    # Next arg is the env name (optional)
                    if [[ -n "${2:-}" && "${2:0:1}" != "-" ]]; then
                        ENV_FLAG="$2"
                        shift
                    fi
                fi
                shift
                ;;
            status|s)
                if [[ $positional_set -eq 0 ]]; then
                    COMMAND="status"
                    positional_set=1
                fi
                shift
                ;;
            separate)
                if [[ $positional_set -eq 0 ]]; then
                    COMMAND="separate"
                    positional_set=1
                fi
                shift
                ;;
            help|h|--help|-h)
                if [[ $positional_set -eq 0 ]]; then
                    COMMAND="help"
                    positional_set=1
                fi
                shift
                ;;
            --port)
                PORT="$2"
                shift 2
                ;;
            --backend-port)
                BACKEND_PORT="$2"
                shift 2
                ;;
            --force)
                FORCE=1
                shift
                ;;
            --separate)
                SEPARATE_MODE=1
                shift
                ;;
            --reset-ports)
                RESET_PORTS=1
                shift
                ;;
            --env)
                ENV_FLAG="$2"
                shift 2
                ;;
            *)
                warn "Unknown argument: $1"
                shift
                ;;
        esac
    done

    # Default command
    if [[ -z "$COMMAND" ]]; then
        COMMAND="all"
    fi
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Section 5: Infrastructure Checks
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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

check_docker() {
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed."
        if [[ "$OSTYPE" == darwin* ]]; then
            if ask_yes_no "Install Docker Desktop via Homebrew?"; then
                if has_brew; then
                    info "Installing Docker Desktop..."
                    brew install --cask docker
                    echo ""
                    warn "Docker Desktop has been installed but needs to be launched."
                    warn "Please open Docker Desktop from Applications, then re-run this script."
                    exit 0
                else
                    error "Homebrew not found. Install Docker Desktop from: https://www.docker.com/products/docker-desktop/"
                    exit 1
                fi
            else
                error "Docker is required for the 'docker' environment."
                error "Install from: https://www.docker.com/products/docker-desktop/"
                exit 1
            fi
        else
            error "Install Docker from: https://docs.docker.com/engine/install/"
            exit 1
        fi
    fi

    if ! docker info > /dev/null 2>&1; then
        error "Docker is installed but not running."
        if [[ "$OSTYPE" == darwin* ]]; then
            if ask_yes_no "Try to start Docker Desktop?"; then
                open -a Docker
                info "Starting Docker Desktop... waiting up to 60s"
                local attempts=0
                while [[ $attempts -lt 60 ]]; do
                    if docker info > /dev/null 2>&1; then
                        success "Docker Desktop is running"
                        break
                    fi
                    sleep 1
                    attempts=$((attempts + 1))
                done
                if ! docker info > /dev/null 2>&1; then
                    error "Docker Desktop did not start in time. Please start it manually."
                    exit 1
                fi
            else
                error "Please start Docker Desktop and re-run this script."
                exit 1
            fi
        else
            error "Please start the Docker daemon: sudo systemctl start docker"
            exit 1
        fi
    fi

    local docker_version
    docker_version=$(docker --version 2>/dev/null | head -1)
    success "Docker: $docker_version"
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
            # shellcheck source=/dev/null
            source "$HOME/.nvm/nvm.sh"
            if nvm ls 22 &>/dev/null; then
                # Node 22 already installed, just switch without asking
                info "Switching to Node.js 22 (already installed)..."
                nvm use 22
                success "Switched to Node.js $(node --version) via nvm"
                return 0
            else
                # Need to install, ask for confirmation
                if ask_yes_no "Install and switch to Node.js 22 using nvm?"; then
                    nvm install 22
                    nvm use 22
                    success "Switched to Node.js $(node --version) via nvm"
                    return 0
                fi
            fi
        elif command -v nvm &> /dev/null; then
            if nvm ls 22 &>/dev/null; then
                # Node 22 already installed, just switch without asking
                info "Switching to Node.js 22 (already installed)..."
                nvm use 22
                success "Switched to Node.js $(node --version) via nvm"
                return 0
            else
                # Need to install, ask for confirmation
                if ask_yes_no "Install and switch to Node.js 22 using nvm?"; then
                    nvm install 22
                    nvm use 22
                    success "Switched to Node.js $(node --version) via nvm"
                    return 0
                fi
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
    if [ ! -d "$PROJECT_ROOT/node_modules" ]; then
        if ask_yes_no "node_modules not found. Run yarn install?"; then
            info "Running yarn install..."
            if ! yarn install; then
                error "yarn install failed. Please fix dependency issues and try again."
                exit 1
            fi
            success "Dependencies installed"
        else
            error "Dependencies are required to run Backstage. Please run: yarn install"
            exit 1
        fi
    else
        success "Dependencies: node_modules present"
    fi
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Section 6: Port Management
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# kill_port(port, force)
# Critical: uses -sTCP:LISTEN to only kill listeners, never clients
kill_port() {
    local port="$1"
    local force="${2:-0}"

    local pids
    pids=$(lsof -ti:"$port" -sTCP:LISTEN 2>/dev/null)

    if [[ -z "$pids" ]]; then
        return 0  # Port is free
    fi

    if [[ "$force" -eq 0 ]]; then
        error "Port $port is in use by:"
        lsof -i:"$port" -sTCP:LISTEN 2>/dev/null
        echo ""
        error "Use --force to kill the process, or choose a different port with --port"
        exit 1
    fi

    info "Killing processes on port $port..."
    echo "$pids" | xargs kill -9 2>/dev/null

    # Wait up to 10 seconds for port release
    local attempts=0
    while [[ $attempts -lt 20 ]]; do
        if ! lsof -ti:"$port" -sTCP:LISTEN &>/dev/null; then
            success "Port $port released"
            sleep 0.3  # Extra settle time
            return 0
        fi
        sleep 0.5
        attempts=$((attempts + 1))
    done

    error "Failed to release port $port after 10 seconds"
    exit 1
}

# find_available_port(start_port, max_attempts)
find_available_port() {
    local port="$1"
    local max="${2:-10}"
    local attempts=0

    while [[ $attempts -lt $max ]]; do
        if ! lsof -ti:"$port" -sTCP:LISTEN &>/dev/null; then
            echo "$port"
            return 0
        fi
        port=$((port + 1))
        attempts=$((attempts + 1))
    done

    error "Could not find available port starting from $1 (tried $max ports)"
    return 1
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Section 7: Environment Management
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

get_current_env() {
    if [[ -f "$ENV_STATE_FILE" ]]; then
        cat "$ENV_STATE_FILE" 2>/dev/null
    else
        echo "docker"
    fi
}

# set_environment(env_name, save_state)
# env_name: local|l|docker|d
# save_state: 1 to persist (default), 0 to skip
set_environment() {
    local env_name="$1"
    local save_state="${2:-1}"

    case "$env_name" in
        local|l)
            env_name="local"
            unset BACKSTAGE_ENV
            info "Environment: local (SQLite in-memory, no Docker required)"
            ;;
        docker|d)
            env_name="docker"
            export BACKSTAGE_ENV="docker"
            info "Environment: docker (PostgreSQL + Redis + OpenSearch)"
            ;;
        *)
            # If in separate mode, allow branch name as environment
            if [[ "$SEPARATE_MODE" -eq 1 && -n "$env_name" ]]; then
                export BACKSTAGE_ENV="$env_name"
                info "Environment: $env_name (branch-isolated)"
            else
                error "Unknown environment: $env_name"
                error "Valid environments: local (l), docker (d)"
                return 1
            fi
            ;;
    esac

    if [[ "$save_state" -eq 1 ]]; then
        echo "$env_name" > "$ENV_STATE_FILE"
    fi
}

# Interactive environment switch
switch_env_command() {
    local target="${1:-}"
    local current_env
    current_env=$(get_current_env)

    if [[ -n "$target" ]]; then
        set_environment "$target"
        return $?
    fi

    # Interactive menu
    banner "Switch Environment"
    echo -e "  Current environment: ${BOLD}$current_env${NC}"
    echo ""
    echo -e "  ${BOLD}l${NC} = local   (SQLite in-memory, no Docker)"
    echo -e "  ${BOLD}d${NC} = docker  (PostgreSQL + Redis + OpenSearch)"
    echo -e "  ${BOLD}c${NC} = cancel"
    echo ""
    echo -n "  Select environment: "

    local choice
    read -r -n 1 choice
    echo ""

    case "$choice" in
        l) set_environment "local" ;;
        d)
            set_environment "docker"
            setup_docker_deps
            ;;
        c|"") info "Cancelled" ;;
        *)  warn "Unknown choice: $choice" ;;
    esac
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Section 8: Docker Management
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

setup_docker_deps() {
    local compose_file="${1:-$DOCKER_COMPOSE_FILE}"

    if [[ ! -f "$compose_file" ]]; then
        error "Docker Compose file not found: $compose_file"
        exit 1
    fi

    check_docker

    info "Starting Docker dependencies..."
    if ! docker compose -f "$compose_file" up --wait -d 2>&1; then
        error "Failed to start Docker dependencies"
        error "Check: docker compose -f $compose_file logs"
        exit 1
    fi

    # Verify services are healthy
    info "Waiting for services to be healthy..."
    local attempts=0
    local max_attempts=60

    while [[ $attempts -lt $max_attempts ]]; do
        local all_healthy=1
        local status_output
        status_output=$(docker compose -f "$compose_file" ps --format json 2>/dev/null)

        if [[ -n "$status_output" ]]; then
            # Check if any service is not healthy/running
            local unhealthy
            unhealthy=$(docker compose -f "$compose_file" ps --status running 2>/dev/null | tail -n +2 | wc -l)
            local total
            total=$(docker compose -f "$compose_file" ps 2>/dev/null | tail -n +2 | wc -l)

            if [[ "$unhealthy" -ge "$total" && "$total" -gt 0 ]]; then
                all_healthy=1
            else
                all_healthy=0
            fi
        else
            all_healthy=0
        fi

        if [[ $all_healthy -eq 1 ]]; then
            success "All Docker services are running"
            return 0
        fi

        sleep 1
        attempts=$((attempts + 1))
    done

    warn "Timed out waiting for Docker services (${max_attempts}s). Continuing anyway..."
}

stop_docker_deps() {
    local compose_file="${1:-$DOCKER_COMPOSE_FILE}"

    if [[ ! -f "$compose_file" ]]; then
        return 0
    fi

    info "Stopping Docker dependencies..."
    docker compose -f "$compose_file" down 2>/dev/null
    success "Docker dependencies stopped"
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Section 9: Status/Display
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

show_runtime_help() {
    local current_env
    current_env=$(get_current_env)

    local freeze_status
    if [[ -f "$RELOAD_FREEZE_FILE" ]]; then
        freeze_status="${RED}FROZEN${NC}"
    else
        freeze_status="${GREEN}LIVE${NC}"
    fi

    echo ""
    echo -e "${CYAN}━━━ Backstage Dev Server ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "  Environment: ${BOLD}$current_env${NC}  │  Reload: $freeze_status"
    if [[ "$SEPARATE_MODE" -eq 1 ]]; then
        echo -e "  Branch: ${BOLD}$SAFE_BRANCH${NC} (isolated)"
    fi
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "  ${BOLD}e${NC}=env  ${BOLD}r${NC}=restart  ${BOLD}s${NC}=status  ${BOLD}f${NC}=freeze  ${BOLD}t${NC}=trigger  ${BOLD}q${NC}=quit  ${BOLD}h${NC}=help"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

show_status() {
    local be_port="${1:-$DEFAULT_BACKEND_PORT}"
    local fe_port="${2:-$DEFAULT_FRONTEND_PORT}"
    local current_env
    current_env=$(get_current_env)
    local config_file="$PROJECT_ROOT/app-config.yaml"
    local be_base="http://localhost:$be_port"
    local fe_base="http://localhost:$fe_port"
    local be_healthy=0

    banner "Backstage Dev Status"

    # ── General ──────────────────────────────────────────────────────────
    echo -e "  ${BOLD}Environment:${NC}  $current_env"
    echo -e "  ${BOLD}Git Branch:${NC}   $(git -C "$PROJECT_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')"
    if [[ "$SEPARATE_MODE" -eq 1 ]]; then
        echo -e "  ${BOLD}Isolation:${NC}    ${CYAN}$SAFE_BRANCH${NC} (branch-isolated)"
    fi
    if [[ -f "$RELOAD_FREEZE_FILE" ]]; then
        echo -e "  ${BOLD}Hot Reload:${NC}   ${RED}FROZEN${NC}"
    else
        echo -e "  ${BOLD}Hot Reload:${NC}   ${GREEN}Active${NC}"
    fi

    # ── Services ─────────────────────────────────────────────────────────
    echo ""
    echo -e "  ${BOLD}${CYAN}SERVICES${NC}"
    echo -e "  ${GRAY}────────────────────────────────────────────────────────────${NC}"

    # Backend health
    local health_body
    health_body=$(curl -sf "$be_base$HEALTH_ENDPOINT" 2>/dev/null)
    if [[ $? -eq 0 ]]; then
        be_healthy=1
        echo -e "  Backend:     ${GREEN}Healthy${NC}  (port $be_port)"
    else
        local be_listener
        be_listener=$(lsof -ti:"$be_port" -sTCP:LISTEN 2>/dev/null)
        if [[ -n "$be_listener" ]]; then
            echo -e "  Backend:     ${YELLOW}Starting${NC}  (port $be_port, not yet responding)"
        else
            echo -e "  Backend:     ${RED}Not running${NC}  (port $be_port)"
        fi
    fi

    # Frontend status
    local fe_status
    fe_status=$(curl -sf -o /dev/null -w "%{http_code}" "$fe_base" 2>/dev/null)
    if [[ "$fe_status" == "200" || "$fe_status" == "304" ]]; then
        echo -e "  Frontend:    ${GREEN}Running${NC}  (port $fe_port, HTTP $fe_status)"
    else
        local fe_listener
        fe_listener=$(lsof -ti:"$fe_port" -sTCP:LISTEN 2>/dev/null)
        if [[ -n "$fe_listener" ]]; then
            echo -e "  Frontend:    ${YELLOW}Starting${NC}  (port $fe_port, not yet responding)"
        else
            echo -e "  Frontend:    ${RED}Not running${NC}  (port $fe_port)"
        fi
    fi

    # ── URLs ─────────────────────────────────────────────────────────────
    echo ""
    echo -e "  ${BOLD}${CYAN}URLS${NC}"
    echo -e "  ${GRAY}────────────────────────────────────────────────────────────${NC}"
    echo -e "  Frontend:          ${BOLD}$fe_base${NC}"
    echo -e "  Backend:           ${BOLD}$be_base${NC}"
    echo -e "  Health (ready):    $be_base/.backstage/health/v1/readiness"
    echo -e "  Health (live):     $be_base/.backstage/health/v1/liveness"
    echo -e "  DevTools Health:   $be_base/api/devtools/health"
    echo -e "  DevTools Info:     $be_base/api/devtools/info"
    echo -e "  DevTools Config:   $be_base/api/devtools/config"
    echo -e "  Catalog API:       $be_base/api/catalog"
    echo -e "  Auth API:          $be_base/api/auth"
    echo -e "  Scaffolder API:    $be_base/api/scaffolder"
    echo -e "  Search API:        $be_base/api/search"
    echo -e "  TechDocs API:      $be_base/api/techdocs"
    echo -e "  Events API:        $be_base/api/events"
    echo -e "  Signals API:       $be_base/api/signals"
    echo -e "  Notifications API: $be_base/api/notifications"
    echo -e "  Permissions API:   $be_base/api/permission"
    echo -e "  Kubernetes API:    $be_base/api/kubernetes"
    echo -e "  API Testing API:   $be_base/api/api-testing"

    # ── Plugins ──────────────────────────────────────────────────────────
    echo ""
    echo -e "  ${BOLD}${CYAN}PLUGINS${NC}"
    echo -e "  ${GRAY}────────────────────────────────────────────────────────────${NC}"
    if [[ $be_healthy -eq 1 ]]; then
        # Try to extract plugin list from recent logs
        local plugins_line
        plugins_line=$(grep -m1 "Plugin initialization complete" "$LOG_DIR/backend/latest.log" 2>/dev/null \
            || grep -m1 "Plugin initialization in progress" "$LOG_DIR/backend/latest.log" 2>/dev/null)
        if [[ -n "$plugins_line" ]]; then
            # Extract the list of plugins from the log line
            local plugin_list
            plugin_list=$(echo "$plugins_line" | grep -oP "(?:newly initialized|still initializing): '[^']+(?:', '[^']+')*" \
                | sed "s/newly initialized: //;s/still initializing: //;s/'//g" | tr ',' '\n' | sort -u | tr '\n' ', ' | sed 's/, $//')
            if [[ -n "$plugin_list" ]]; then
                echo -e "  ${GREEN}Loaded:${NC} $plugin_list"
            else
                echo -e "  ${GRAY}Could not parse plugin list from logs${NC}"
            fi
        else
            echo -e "  api-testing, app, auth, catalog, devtools, events,"
            echo -e "  kubernetes, mcp-actions, notifications, permission,"
            echo -e "  proxy, scaffolder, search, signals, techdocs"
        fi
    else
        echo -e "  ${GRAY}Backend not running — cannot determine loaded plugins${NC}"
    fi

    # ── Proxy Endpoints ──────────────────────────────────────────────────
    echo ""
    echo -e "  ${BOLD}${CYAN}PROXY ENDPOINTS${NC}"
    echo -e "  ${GRAY}────────────────────────────────────────────────────────────${NC}"
    if [[ -f "$config_file" ]]; then
        local in_proxy=0
        local in_endpoints=0
        local current_name=""
        while IFS= read -r line; do
            # Detect proxy: section
            if [[ "$line" =~ ^proxy: ]]; then
                in_proxy=1; continue
            fi
            # Exit proxy section on next top-level key
            if [[ $in_proxy -eq 1 && "$line" =~ ^[a-zA-Z] && ! "$line" =~ ^proxy ]]; then
                in_proxy=0; in_endpoints=0; break
            fi
            if [[ $in_proxy -eq 1 && "$line" =~ ^[[:space:]]+endpoints: ]]; then
                in_endpoints=1; continue
            fi
            if [[ $in_endpoints -eq 1 ]]; then
                # Match proxy name like "    '/pagerduty':"
                if [[ "$line" =~ ^[[:space:]]+[\'\"]?(/[a-zA-Z0-9_-]+)[\'\"]?: ]]; then
                    current_name="${BASH_REMATCH[1]}"
                fi
                # Match target line
                if [[ "$line" =~ target:[[:space:]]+[\'\"]?([^\'\"[:space:]]+) && -n "$current_name" ]]; then
                    local target="${BASH_REMATCH[1]}"
                    printf "  %-18s → %s\n" "$current_name" "$target"
                    echo -e "  ${GRAY}  Access via: $be_base/api/proxy${current_name}${NC}"
                    current_name=""
                fi
            fi
        done < "$config_file"
    else
        echo -e "  ${GRAY}Config file not found${NC}"
    fi

    # ── Database ─────────────────────────────────────────────────────────
    echo ""
    echo -e "  ${BOLD}${CYAN}DATABASE${NC}"
    echo -e "  ${GRAY}────────────────────────────────────────────────────────────${NC}"
    if [[ -f "$config_file" ]]; then
        local db_client db_host db_port db_user
        db_client=$(grep -A1 'database:' "$config_file" | grep 'client:' | head -1 | awk '{print $2}')
        db_host=$(grep -A10 'database:' "$config_file" | grep 'host:' | head -1 | awk '{print $2}')
        db_port=$(grep -A10 'database:' "$config_file" | grep 'port:' | head -1 | awk '{print $2}')
        db_user=$(grep -A10 'database:' "$config_file" | grep 'user:' | head -1 | awk '{print $2}')
        echo -e "  Client:   ${BOLD}${db_client:-unknown}${NC}"
        echo -e "  Host:     ${db_host:-unknown}:${db_port:-?}"
        echo -e "  User:     ${db_user:-unknown}"

        # Check DB connectivity
        if command -v pg_isready &>/dev/null && [[ "$db_client" == "pg" ]]; then
            if pg_isready -h "${db_host:-localhost}" -p "${db_port:-5432}" -U "${db_user:-postgres}" -q 2>/dev/null; then
                echo -e "  Status:   ${GREEN}Reachable${NC}"
            else
                echo -e "  Status:   ${RED}Unreachable${NC}"
            fi
        fi
    else
        echo -e "  ${GRAY}Config file not found${NC}"
    fi

    # ── API Testing ──────────────────────────────────────────────────────
    echo ""
    echo -e "  ${BOLD}${CYAN}API TESTING${NC}"
    echo -e "  ${GRAY}────────────────────────────────────────────────────────────${NC}"
    if [[ -f "$config_file" ]]; then
        local api_env api_base
        api_env=$(grep -A1 'apiTesting:' "$config_file" | grep 'defaultEnvironment:' | awk '{print $2}')
        if [[ -n "$api_env" ]]; then
            echo -e "  Environment: ${BOLD}$api_env${NC}"
            # Extract baseUrl for the active environment
            api_base=$(awk "/apiTesting:/,/^[a-zA-Z]/" "$config_file" \
                | awk "/$api_env:/,/^[[:space:]]{4}[a-zA-Z]/" \
                | grep 'baseUrl:' | head -1 | awk '{print $2}')
            if [[ -n "$api_base" ]]; then
                echo -e "  Base URL:    $api_base"
                # Check if the service under test is reachable
                local sut_status
                sut_status=$(curl -sf -o /dev/null -w "%{http_code}" "$api_base" 2>/dev/null)
                if [[ "$sut_status" =~ ^[23] ]]; then
                    echo -e "  Status:      ${GREEN}Reachable${NC} (HTTP $sut_status)"
                else
                    echo -e "  Status:      ${RED}Unreachable${NC}"
                fi
            fi
        else
            echo -e "  ${GRAY}Not configured${NC}"
        fi
    fi

    # ── Auth Providers ───────────────────────────────────────────────────
    echo ""
    echo -e "  ${BOLD}${CYAN}AUTH PROVIDERS${NC}"
    echo -e "  ${GRAY}────────────────────────────────────────────────────────────${NC}"
    if [[ -f "$config_file" ]]; then
        local providers
        providers=$(awk '/^  providers:/,/^[a-zA-Z]/' "$config_file" \
            | grep -E '^    [a-zA-Z]' | awk -F: '{print $1}' | sed 's/^[[:space:]]*//' | sort)
        if [[ -n "$providers" ]]; then
            local provider_list
            provider_list=$(echo "$providers" | tr '\n' ', ' | sed 's/, $//')
            echo -e "  Configured: $provider_list"
        else
            echo -e "  ${GRAY}None configured${NC}"
        fi
    fi

    # ── Docker Services ──────────────────────────────────────────────────
    if [[ "$current_env" == "docker" || "$SEPARATE_MODE" -eq 1 ]]; then
        echo ""
        echo -e "  ${BOLD}${CYAN}DOCKER SERVICES${NC}"
        echo -e "  ${GRAY}────────────────────────────────────────────────────────────${NC}"
        local compose_file="$DOCKER_COMPOSE_FILE"
        if [[ "$SEPARATE_MODE" -eq 1 && -n "$SAFE_BRANCH" ]]; then
            compose_file="$PROJECT_ROOT/docker-compose.deps-${SAFE_BRANCH}.yml"
        fi
        if [[ -f "$compose_file" ]]; then
            docker compose -f "$compose_file" ps 2>/dev/null | while IFS= read -r line; do
                echo "    $line"
            done
        else
            echo -e "  ${GRAY}No compose file found${NC}"
        fi
    fi

    # ── Logs ─────────────────────────────────────────────────────────────
    echo ""
    echo -e "  ${BOLD}${CYAN}LOGS${NC}"
    echo -e "  ${GRAY}────────────────────────────────────────────────────────────${NC}"
    if [[ -L "$LOG_DIR/backend/latest.log" ]]; then
        echo -e "  Backend:   $LOG_DIR/backend/latest.log"
    else
        echo -e "  Backend:   ${GRAY}No logs yet${NC}"
    fi
    if [[ -L "$LOG_DIR/frontend/latest.log" ]]; then
        echo -e "  Frontend:  $LOG_DIR/frontend/latest.log"
    else
        echo -e "  Frontend:  ${GRAY}No logs yet${NC}"
    fi

    echo ""
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Section 10: Log Management
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# setup_log(component) -> sets LOG_FILE variable
# component: "backend" or "frontend"
setup_log() {
    local component="$1"
    local log_subdir="$LOG_DIR/$component"
    mkdir -p "$log_subdir"

    local timestamp
    timestamp=$(date +"%Y-%m-%d_%H-%M-%S")
    LOG_FILE="$log_subdir/${component}-${timestamp}.log"

    # Create/update latest.log symlink
    local latest_link="$log_subdir/latest.log"
    rm -f "$latest_link"
    ln -sf "$LOG_FILE" "$latest_link"

    info "Logging to: $LOG_FILE"
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Section 11: Process Management
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Kill a server process tree gracefully
kill_server() {
    local pid="$1"
    local port="$2"

    if [[ -z "$pid" || "$pid" == "0" ]]; then
        # No PID, try port-based kill
        if [[ -n "$port" ]]; then
            local pids
            pids=$(lsof -ti:"$port" -sTCP:LISTEN 2>/dev/null)
            if [[ -n "$pids" ]]; then
                echo "$pids" | xargs kill -TERM 2>/dev/null
                sleep 1
                pids=$(lsof -ti:"$port" -sTCP:LISTEN 2>/dev/null)
                if [[ -n "$pids" ]]; then
                    echo "$pids" | xargs kill -9 2>/dev/null
                fi
            fi
        fi
        return 0
    fi

    # Graceful: SIGTERM children first, then parent
    pkill -TERM -P "$pid" 2>/dev/null
    kill -TERM "$pid" 2>/dev/null

    # Wait up to 3 seconds
    local attempts=0
    while [[ $attempts -lt 30 ]]; do
        if ! kill -0 "$pid" 2>/dev/null; then
            break
        fi
        sleep 0.1
        attempts=$((attempts + 1))
    done

    # Forceful fallback
    if kill -0 "$pid" 2>/dev/null; then
        pkill -9 -P "$pid" 2>/dev/null
        kill -9 "$pid" 2>/dev/null
    fi

    # Clean up any stragglers on the port
    if [[ -n "$port" ]]; then
        local remaining
        remaining=$(lsof -ti:"$port" -sTCP:LISTEN 2>/dev/null)
        if [[ -n "$remaining" ]]; then
            echo "$remaining" | xargs kill -9 2>/dev/null
            sleep 0.3
        fi
    fi
}

# Wait for server health
# wait_for_health(url, timeout_seconds, label)
wait_for_health() {
    local url="$1"
    local timeout="${2:-60}"
    local label="${3:-Server}"

    info "Waiting for $label to be ready..."

    local attempts=0
    while [[ $attempts -lt $timeout ]]; do
        if curl -sf "$url" > /dev/null 2>&1; then
            success "$label is ready"
            return 0
        fi
        sleep 1
        attempts=$((attempts + 1))

        # Progress indicator every 10 seconds
        if [[ $((attempts % 10)) -eq 0 ]]; then
            info "Still waiting for $label... (${attempts}s / ${timeout}s)"
        fi
    done

    warn "$label did not become ready within ${timeout}s"
    return 1
}

# Wait for a port to have a listener
# wait_for_port(port, timeout_seconds, label)
wait_for_port() {
    local port="$1"
    local timeout="${2:-60}"
    local label="${3:-Server}"

    info "Waiting for $label on port $port..."

    local attempts=0
    while [[ $attempts -lt $timeout ]]; do
        if lsof -ti:"$port" -sTCP:LISTEN &>/dev/null; then
            success "$label is listening on port $port"
            return 0
        fi
        sleep 1
        attempts=$((attempts + 1))

        if [[ $((attempts % 10)) -eq 0 ]]; then
            info "Still waiting for $label... (${attempts}s / ${timeout}s)"
        fi
    done

    warn "$label did not start listening on port $port within ${timeout}s"
    return 1
}

# Track hot-reload PID changes
# When backstage-cli restarts its child process, the PID changes.
# This function re-attaches to the new PID.
reattach_pid() {
    local port="$1"
    local old_pid="$2"

    # Check if something is still listening
    local new_pid
    local attempts=0
    while [[ $attempts -lt 30 ]]; do
        new_pid=$(lsof -ti:"$port" -sTCP:LISTEN 2>/dev/null | head -1)
        if [[ -n "$new_pid" ]]; then
            if [[ "$new_pid" != "$old_pid" ]]; then
                info "Server PID changed: $old_pid -> $new_pid (hot reload)"
            fi
            echo "$new_pid"
            return 0
        fi
        sleep 1
        attempts=$((attempts + 1))
    done

    echo ""
    return 1
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Section 12: Cleanup & Signal Handling
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

cleanup() {
    # Double Ctrl+C support
    if [[ "$SHUTDOWN_IN_PROGRESS" -eq 1 ]]; then
        echo ""
        warn "Force shutdown (second signal)..."
        if [[ -n "$BACKEND_PID" ]]; then
            kill -9 "$BACKEND_PID" 2>/dev/null
            pkill -9 -P "$BACKEND_PID" 2>/dev/null
        fi
        if [[ -n "$FRONTEND_PID" ]]; then
            kill -9 "$FRONTEND_PID" 2>/dev/null
            pkill -9 -P "$FRONTEND_PID" 2>/dev/null
        fi
        # Restore TTY
        if [[ -n "$SAVED_TTY_SETTINGS" ]]; then
            stty "$SAVED_TTY_SETTINGS" 2>/dev/null
        fi
        exit 1
    fi

    SHUTDOWN_IN_PROGRESS=1
    echo ""
    info "Shutting down gracefully... (press Ctrl+C again to force)"

    # Remove freeze file
    rm -f "$RELOAD_FREEZE_FILE"

    # Kill servers
    if [[ -n "$BACKEND_PID" ]]; then
        info "Stopping backend..."
        kill_server "$BACKEND_PID" "$ACTIVE_BACKEND_PORT"
        BACKEND_PID=""
    fi
    if [[ -n "$FRONTEND_PID" ]]; then
        info "Stopping frontend..."
        kill_server "$FRONTEND_PID" "$ACTIVE_FRONTEND_PORT"
        FRONTEND_PID=""
    fi

    # Restore TTY settings
    if [[ -n "$SAVED_TTY_SETTINGS" ]]; then
        stty "$SAVED_TTY_SETTINGS" 2>/dev/null
        SAVED_TTY_SETTINGS=""
    fi

    success "Shutdown complete"
    exit 0
}

# Active ports (set when servers start)
ACTIVE_BACKEND_PORT=""
ACTIVE_FRONTEND_PORT=""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Section 13: Freeze/Reload Mechanism
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

is_frozen() {
    [[ -f "$RELOAD_FREEZE_FILE" ]]
}

toggle_freeze() {
    local be_port="$ACTIVE_BACKEND_PORT"
    local fe_port="$ACTIVE_FRONTEND_PORT"

    if is_frozen; then
        # Unfreeze: remove file, restart server WITH hot reload
        rm -f "$RELOAD_FREEZE_FILE"
        echo ""
        echo -e "${GREEN}━━━ UNFROZEN ━━━ Hot reload is now ACTIVE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo ""

        # Restart servers
        if [[ -n "$BACKEND_PID" ]]; then
            info "Restarting backend with hot reload..."
            kill_server "$BACKEND_PID" "$be_port"
            sleep 0.5
            start_server_process "backend" "$be_port"
        fi
        if [[ -n "$FRONTEND_PID" ]]; then
            info "Restarting frontend with hot reload..."
            kill_server "$FRONTEND_PID" "$fe_port"
            sleep 0.5
            start_server_process "frontend" "$fe_port"
        fi
    else
        # Freeze: create file, kill servers (stopped = no file watching)
        touch "$RELOAD_FREEZE_FILE"
        echo ""
        echo -e "${RED}━━━ FROZEN ━━━ Hot reload is PAUSED ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "  Press ${BOLD}t${NC} to trigger a one-shot reload, ${BOLD}f${NC} to unfreeze"
        echo ""

        # Kill servers
        if [[ -n "$BACKEND_PID" ]]; then
            info "Stopping backend (frozen)..."
            kill_server "$BACKEND_PID" "$be_port"
            BACKEND_PID=""
        fi
        if [[ -n "$FRONTEND_PID" ]]; then
            info "Stopping frontend (frozen)..."
            kill_server "$FRONTEND_PID" "$fe_port"
            FRONTEND_PID=""
        fi
    fi
}

trigger_reload() {
    if ! is_frozen; then
        warn "Not frozen. Hot reload is already active. Use 'f' to freeze first."
        return
    fi

    echo ""
    info "Triggering one-shot reload (staying frozen)..."

    local be_port="$ACTIVE_BACKEND_PORT"
    local fe_port="$ACTIVE_FRONTEND_PORT"

    # Restart servers briefly to pick up changes
    if [[ "$SERVER_MODE" == "backend" || "$SERVER_MODE" == "all" ]]; then
        if [[ -n "$BACKEND_PID" ]]; then
            kill_server "$BACKEND_PID" "$be_port"
        fi
        sleep 0.5
        start_server_process "backend" "$be_port"
        wait_for_health "http://localhost:$be_port$HEALTH_ENDPOINT" 60 "Backend"
    fi
    if [[ "$SERVER_MODE" == "frontend" || "$SERVER_MODE" == "all" ]]; then
        if [[ -n "$FRONTEND_PID" ]]; then
            kill_server "$FRONTEND_PID" "$fe_port"
        fi
        sleep 0.5
        start_server_process "frontend" "$fe_port"
        wait_for_port "$fe_port" 60 "Frontend"
    fi

    success "Reload complete (still frozen)"
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Section 14: Server Process Launchers
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Build the config flags for backstage-cli
# Always includes app-config.dev.yaml for consistent full-access across systems
build_config_flags() {
    # Use absolute paths — backstage-cli repo start resolves relative paths
    # from the package dir, not the project root
    local flags="--config $PROJECT_ROOT/app-config.yaml"

    # Include packages/app/app-config.yaml (frontend extension overrides)
    if [[ -f "$PROJECT_ROOT/packages/app/app-config.yaml" ]]; then
        flags="$flags --config $PROJECT_ROOT/packages/app/app-config.yaml"
    fi

    if [[ -f "$PROJECT_ROOT/app-config.dev.yaml" ]]; then
        flags="$flags --config $PROJECT_ROOT/app-config.dev.yaml"
    fi

    # Local overrides (secrets, credentials) — loaded last for highest precedence
    if [[ -f "$PROJECT_ROOT/app-config.local.yaml" ]]; then
        flags="$flags --config $PROJECT_ROOT/app-config.local.yaml"
    fi

    local current_env
    current_env=$(get_current_env)

    # Add environment-specific config overlay
    if [[ "$current_env" == "docker" ]]; then
        flags="$flags --config $PROJECT_ROOT/app-config.docker.yaml"
    elif [[ "$SEPARATE_MODE" -eq 1 && -n "$SAFE_BRANCH" ]]; then
        local branch_config="$PROJECT_ROOT/app-config.${SAFE_BRANCH}.yaml"
        if [[ -f "$branch_config" ]]; then
            flags="$flags --config $branch_config"
        fi
    fi

    echo "$flags"
}

# Start a server subprocess (backend or frontend)
# Runs backstage-cli repo start from project root with proper config flags
# Sets BACKEND_PID or FRONTEND_PID
start_server_process() {
    local component="$1"
    local port="$2"

    local current_env
    current_env=$(get_current_env)

    # Set BACKSTAGE_ENV for config loader's automatic file discovery
    if [[ "$current_env" == "docker" ]]; then
        export BACKSTAGE_ENV="docker"
    elif [[ "$SEPARATE_MODE" -eq 1 && -n "$SAFE_BRANCH" ]]; then
        export BACKSTAGE_ENV="$SAFE_BRANCH"
    else
        unset BACKSTAGE_ENV
    fi

    local config_flags
    config_flags=$(build_config_flags)

    setup_log "$component"

    local package_name=""
    if [[ "$component" == "backend" ]]; then
        package_name="example-backend"
    elif [[ "$component" == "frontend" ]]; then
        package_name="example-app"
    fi

    info "Starting $component on port $port..."
    info "Config: $config_flags"

    # Run from project root using backstage-cli repo start with explicit configs
    # This ensures app-config.dev.yaml (full admin access) is always loaded
    # Output goes to log file only — keeps terminal clean for interactive UI
    (cd "$PROJECT_ROOT" && BROWSER=none yarn backstage-cli repo start "$package_name" $config_flags) \
        >> "$LOG_FILE" 2>&1 &

    if [[ "$component" == "backend" ]]; then
        BACKEND_PID=$!
        ACTIVE_BACKEND_PORT="$port"
        info "Backend PID: $BACKEND_PID"
    elif [[ "$component" == "frontend" ]]; then
        FRONTEND_PID=$!
        ACTIVE_FRONTEND_PORT="$port"
        info "Frontend PID: $FRONTEND_PID"
    fi
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Section 15: Interactive Runtime Menu
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Environment sub-menu (non-blocking, called from main loop)
handle_env_submenu() {
    # Temporarily restore TTY for sub-menu
    if [[ -n "$SAVED_TTY_SETTINGS" ]]; then
        stty "$SAVED_TTY_SETTINGS" 2>/dev/null
    fi

    echo ""
    echo -e "  ${BOLD}Switch Environment:${NC}"
    echo -e "    ${BOLD}l${NC} = local   ${BOLD}d${NC} = docker   ${BOLD}c${NC} = cancel"
    echo -n "  > "

    local choice
    read -r -n 1 choice
    echo ""

    # Restore raw mode
    stty -echo -icanon time 0 min 0 2>/dev/null

    case "$choice" in
        l)
            set_environment "local"
            warn "Restart (r) to apply the new environment"
            ;;
        d)
            set_environment "docker"
            warn "Restart (r) to apply the new environment"
            ;;
        c|"")
            info "Cancelled"
            ;;
        *)
            warn "Unknown choice: $choice"
            ;;
    esac
}

# Restart: kill everything and re-exec
handle_restart() {
    info "Restarting..."

    # Restore TTY before exec
    if [[ -n "$SAVED_TTY_SETTINGS" ]]; then
        stty "$SAVED_TTY_SETTINGS" 2>/dev/null
    fi

    # Remove trap to avoid double cleanup
    trap - INT TERM EXIT

    # Kill servers
    if [[ -n "$BACKEND_PID" ]]; then
        kill_server "$BACKEND_PID" "$ACTIVE_BACKEND_PORT"
    fi
    if [[ -n "$FRONTEND_PID" ]]; then
        kill_server "$FRONTEND_PID" "$ACTIVE_FRONTEND_PORT"
    fi

    # Build exec args
    local exec_args=("$0" "$SERVER_MODE")
    if [[ -n "$ACTIVE_BACKEND_PORT" && "$SERVER_MODE" != "frontend" ]]; then
        exec_args+=("--port" "$ACTIVE_BACKEND_PORT")
    fi
    if [[ -n "$ACTIVE_FRONTEND_PORT" && "$SERVER_MODE" == "frontend" ]]; then
        exec_args+=("--port" "$ACTIVE_FRONTEND_PORT")
    fi
    exec_args+=("--force")
    if [[ "$SEPARATE_MODE" -eq 1 ]]; then
        exec_args+=("--separate")
    fi

    RESTART_REQUESTED=1
    exec "${exec_args[@]}"
}

# Main interactive loop
interactive_loop() {
    # Save TTY settings and set raw non-blocking mode
    SAVED_TTY_SETTINGS=$(stty -g 2>/dev/null)
    stty -echo -icanon time 0 min 0 2>/dev/null

    # Install signal handler
    trap cleanup INT TERM EXIT

    show_runtime_help

    while true; do
        # Non-blocking single-character read
        local cmd
        cmd=$(dd bs=1 count=1 2>/dev/null)

        if [[ -n "$cmd" ]]; then
            case "$cmd" in
                e)  handle_env_submenu ;;
                r)  handle_restart ;;
                s)  show_status "$ACTIVE_BACKEND_PORT" "$ACTIVE_FRONTEND_PORT" ;;
                f)  toggle_freeze ;;
                t)  trigger_reload ;;
                q)  cleanup ;;
                h|"?")  show_runtime_help ;;
                *)  ;; # Ignore unknown keys
            esac
        fi

        # Check if server processes are still alive
        if [[ -n "$BACKEND_PID" ]] && ! kill -0 "$BACKEND_PID" 2>/dev/null; then
            if ! is_frozen; then
                # Hot reload may have changed PID
                local new_pid
                new_pid=$(reattach_pid "$ACTIVE_BACKEND_PORT" "$BACKEND_PID")
                if [[ -n "$new_pid" ]]; then
                    BACKEND_PID="$new_pid"
                else
                    warn "Backend process died unexpectedly"
                    warn "Check logs: $LOG_DIR/backend/latest.log"
                    BACKEND_PID=""
                fi
            fi
        fi

        if [[ -n "$FRONTEND_PID" ]] && ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
            if ! is_frozen; then
                local new_pid
                new_pid=$(reattach_pid "$ACTIVE_FRONTEND_PORT" "$FRONTEND_PID")
                if [[ -n "$new_pid" ]]; then
                    FRONTEND_PID="$new_pid"
                else
                    warn "Frontend process died unexpectedly"
                    warn "Check logs: $LOG_DIR/frontend/latest.log"
                    FRONTEND_PID=""
                fi
            fi
        fi

        # Small sleep to prevent CPU spin
        sleep 0.1
    done
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Section 16: Separate Mode (Branch Isolation)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

get_branch_name() {
    git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown"
}

sanitize_branch() {
    local branch="$1"
    echo "$branch" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-zA-Z0-9_-]/-/g'
}

setup_separate_env() {
    local branch
    branch=$(get_branch_name)
    SAFE_BRANCH=$(sanitize_branch "$branch")

    if [[ "$SAFE_BRANCH" == "master" || "$SAFE_BRANCH" == "main" ]]; then
        warn "You are on the '$branch' branch. Separate mode is designed for feature branches."
        warn "Continuing anyway with branch-specific containers..."
    fi

    banner "Separate Mode: Branch Isolation"
    info "Branch: $branch"
    info "Safe name: $SAFE_BRANCH"

    SEPARATE_MODE=1

    # Port state file
    local ports_file="$PROJECT_ROOT/.dev-ports-${SAFE_BRANCH}"

    # Reset ports if requested
    if [[ "$RESET_PORTS" -eq 1 && -f "$ports_file" ]]; then
        rm -f "$ports_file"
        info "Port state reset for branch: $SAFE_BRANCH"
    fi

    # Load or assign ports
    local pg_port be_port fe_port redis_port os_port

    if [[ -f "$ports_file" ]]; then
        info "Loading saved port assignments..."
        # shellcheck source=/dev/null
        source "$ports_file"
        pg_port="$SAVED_PG_PORT"
        redis_port="$SAVED_REDIS_PORT"
        os_port="$SAVED_OS_PORT"
        be_port="$SAVED_BE_PORT"
        fe_port="$SAVED_FE_PORT"
    else
        info "Assigning ports for branch..."
        pg_port=$(find_available_port 5433)
        redis_port=$(find_available_port 6380)
        os_port=$(find_available_port 9201)
        be_port=$(find_available_port 7008)
        fe_port=$(find_available_port 3001)

        # Save port assignments
        cat > "$ports_file" <<PORTS_EOF
SAVED_PG_PORT=$pg_port
SAVED_REDIS_PORT=$redis_port
SAVED_OS_PORT=$os_port
SAVED_BE_PORT=$be_port
SAVED_FE_PORT=$fe_port
PORTS_EOF
    fi

    info "Ports: PostgreSQL=$pg_port  Redis=$redis_port  OpenSearch=$os_port  Backend=$be_port  Frontend=$fe_port"

    # Generate branch-specific Docker Compose file
    local branch_compose="$PROJECT_ROOT/docker-compose.deps-${SAFE_BRANCH}.yml"
    local db_name="backstage_$(echo "$SAFE_BRANCH" | sed 's/-/_/g')"

    cat > "$branch_compose" <<COMPOSE_EOF
name: backstage-${SAFE_BRANCH}
services:
  psql:
    image: postgres:17.7
    container_name: backstage-psql-${SAFE_BRANCH}
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: ${db_name}
    ports:
      - '${pg_port}:5432'
    volumes:
      - backstage-psql-data-${SAFE_BRANCH}:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready']
      interval: 10s
      retries: 5
      start_period: 30s
      timeout: 10s
  redis:
    image: redis:8.2.1-alpine
    container_name: backstage-redis-${SAFE_BRANCH}
    ports:
      - '${redis_port}:6379'
    volumes:
      - backstage-redis-data-${SAFE_BRANCH}:/data
    healthcheck:
      test: ['CMD-SHELL', 'redis-cli ping | grep PONG']
      interval: 1s
      timeout: 3s
      retries: 5
  opensearch:
    image: opensearchproject/opensearch:2.19.4
    container_name: backstage-opensearch-${SAFE_BRANCH}
    environment:
      plugins.security.disabled: true
      discovery.type: single-node
      OPENSEARCH_INITIAL_ADMIN_PASSWORD: Opensearch1!
    ports:
      - '${os_port}:9200'
      - '$((os_port + 400)):9600'
    healthcheck:
      test: 'curl --fail localhost:9200/_cat/health >/dev/null || exit 1'
      interval: 5s
      timeout: 5s
      retries: 30

volumes:
  backstage-psql-data-${SAFE_BRANCH}:
  backstage-redis-data-${SAFE_BRANCH}:
COMPOSE_EOF

    info "Generated: $branch_compose"

    # Generate branch-specific app-config
    local branch_config="$PROJECT_ROOT/app-config.${SAFE_BRANCH}.yaml"

    cat > "$branch_config" <<CONFIG_EOF
# Auto-generated config for branch: ${branch}
# DO NOT commit this file (gitignored via app-config.*.yaml pattern)
app:
  baseUrl: http://localhost:${fe_port}

backend:
  baseUrl: http://localhost:${be_port}
  listen:
    port: ${be_port}
  database:
    client: pg
    connection:
      host: localhost
      port: ${pg_port}
      user: postgres
      password: postgres
  cache:
    store: redis
    connection: redis://localhost:${redis_port}
  cors:
    origin: http://localhost:${fe_port}

search:
  elasticsearch:
    provider: opensearch
    node: 'http://localhost:${os_port}'
    auth:
      username: admin
      password: admin
CONFIG_EOF

    info "Generated: $branch_config"

    # Update state files to branch-specific paths
    ENV_STATE_FILE="$PROJECT_ROOT/.dev-env-state-${SAFE_BRANCH}"
    DOCKER_COMPOSE_FILE="$branch_compose"

    # Set environment to branch name
    export BACKSTAGE_ENV="$SAFE_BRANCH"
    echo "$SAFE_BRANCH" > "$ENV_STATE_FILE"

    # Override ports
    ACTIVE_BACKEND_PORT="$be_port"
    ACTIVE_FRONTEND_PORT="$fe_port"

    # Start Docker deps with branch compose file
    setup_docker_deps "$branch_compose"

    success "Branch isolation configured for: $SAFE_BRANCH"
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Section 17: Server Startup Orchestration
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

register_mcp_server() {
    local mcp_json="$PROJECT_ROOT/.mcp.json"

    if [[ -f "$mcp_json" ]]; then
        # Check if api-testing entry already exists
        if node -e "const c=JSON.parse(require('fs').readFileSync('$mcp_json','utf-8'));process.exit(c.mcpServers?.['api-testing']?0:1)" 2>/dev/null; then
            return 0
        fi
    fi

    info "Registering api-testing MCP server in .mcp.json..."
    node -e "
const fs = require('fs');
const path = '$mcp_json';
let config = {};
try { config = JSON.parse(fs.readFileSync(path, 'utf-8')); } catch {}
if (!config.mcpServers) config.mcpServers = {};
config.mcpServers['api-testing'] = {
  command: 'npx',
  args: ['tsx', 'plugins/api-testing-mcp-server/src/index.ts'],
  cwd: '$PROJECT_ROOT'
};
fs.writeFileSync(path, JSON.stringify(config, null, 2) + '\n');
" 2>/dev/null && success "MCP server registered in .mcp.json" || warn "Failed to register MCP server"
}

setup_backend() {
    banner "Backend Setup"
    check_node
    check_yarn
    check_deps
    register_mcp_server

    local current_env
    current_env=$(get_current_env)

    if [[ "$current_env" == "docker" ]]; then
        setup_docker_deps
    fi
}

start_backend() {
    local port="${1:-$DEFAULT_BACKEND_PORT}"
    local force="${2:-$FORCE}"

    SERVER_MODE="backend"
    ACTIVE_BACKEND_PORT="$port"

    setup_backend

    if [[ "$force" -eq 1 ]]; then
        kill_port "$port" 1
    else
        # Check if port is in use
        if lsof -ti:"$port" -sTCP:LISTEN &>/dev/null; then
            kill_port "$port" 0  # Will exit with error message
        fi
    fi

    banner "Starting Backend"

    # Load saved environment
    local current_env
    current_env=$(get_current_env)
    set_environment "$current_env" 0  # Load without saving

    # Start server
    start_server_process "backend" "$port"

    # Wait for health
    wait_for_health "http://localhost:$port$HEALTH_ENDPOINT" 120 "Backend"

    # Show status dashboard
    show_status "$port" "$DEFAULT_FRONTEND_PORT"

    # Enter interactive loop
    interactive_loop
}

start_frontend() {
    local port="${1:-$DEFAULT_FRONTEND_PORT}"
    local force="${2:-$FORCE}"

    SERVER_MODE="frontend"
    ACTIVE_FRONTEND_PORT="$port"

    banner "Frontend Setup"
    check_node
    check_yarn
    check_deps

    if [[ "$force" -eq 1 ]]; then
        kill_port "$port" 1
    else
        if lsof -ti:"$port" -sTCP:LISTEN &>/dev/null; then
            kill_port "$port" 0
        fi
    fi

    banner "Starting Frontend"

    # Load saved environment
    local current_env
    current_env=$(get_current_env)
    set_environment "$current_env" 0

    # Start server
    start_server_process "frontend" "$port"

    # Wait for frontend to be ready (check port, not HTTP health)
    # 300s timeout for cold starts (no bundler cache)
    wait_for_port "$port" 300 "Frontend"

    # Show status dashboard
    show_status "$DEFAULT_BACKEND_PORT" "$port"

    # Enter interactive loop
    interactive_loop
}

start_all() {
    local be_port="${ACTIVE_BACKEND_PORT:-$DEFAULT_BACKEND_PORT}"
    local fe_port="${ACTIVE_FRONTEND_PORT:-$DEFAULT_FRONTEND_PORT}"

    SERVER_MODE="all"
    ACTIVE_BACKEND_PORT="$be_port"
    ACTIVE_FRONTEND_PORT="$fe_port"

    setup_backend

    # Handle port conflicts
    if [[ "$FORCE" -eq 1 ]]; then
        kill_port "$be_port" 1
        kill_port "$fe_port" 1
    else
        if lsof -ti:"$be_port" -sTCP:LISTEN &>/dev/null; then
            kill_port "$be_port" 0
        fi
        if lsof -ti:"$fe_port" -sTCP:LISTEN &>/dev/null; then
            kill_port "$fe_port" 0
        fi
    fi

    banner "Starting Backstage (Frontend + Backend)"

    # Load saved environment
    local current_env
    current_env=$(get_current_env)
    set_environment "$current_env" 0

    # Start both servers
    start_server_process "backend" "$be_port"
    start_server_process "frontend" "$fe_port"

    # Wait for both
    wait_for_health "http://localhost:$be_port$HEALTH_ENDPOINT" 120 "Backend" &
    local be_wait_pid=$!
    wait_for_port "$fe_port" 300 "Frontend" &
    local fe_wait_pid=$!

    wait $be_wait_pid 2>/dev/null
    wait $fe_wait_pid 2>/dev/null

    # Show status dashboard
    show_status "$be_port" "$fe_port"

    # Enter interactive loop
    interactive_loop
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Section 18: Help
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

show_help() {
    cat <<'HELP_EOF'

  Backstage Dev Server Manager
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  USAGE
    ./start-dev.sh [command] [flags]

  COMMANDS
    all (default)      Start both frontend (:3000) and backend (:7007)
    backend  be  b     Start backend only
    frontend fe  f     Start frontend only
    env      e         Switch environment (local / docker)
    status   s         Show current status dashboard
    separate           Set up branch-isolated environment and start
    help     h         Show this help

  FLAGS
    --port PORT          Override default server port
    --backend-port PORT  Set backend port (used by frontend proxy)
    --force              Kill any process on target port before starting
    --separate           Enable branch isolation before starting
    --reset-ports        Delete saved port state for current branch
    --env ENV            Set environment at startup (local / docker)

  ENVIRONMENTS
    local   (default)  SQLite in-memory database, no Docker required
    docker             PostgreSQL + Redis + OpenSearch via Docker

  INTERACTIVE KEYS (while server is running)
    e = switch environment     r = full restart
    s = show status            f = freeze/unfreeze hot reload
    t = trigger reload (frozen only)
    q = quit                   h = help

  EXAMPLES
    ./start-dev.sh                    # Start everything (local env)
    ./start-dev.sh backend            # Backend only
    ./start-dev.sh --env docker       # Start with Docker services
    ./start-dev.sh --force            # Kill existing processes first
    ./start-dev.sh separate           # Branch-isolated environment
    ./start-dev.sh env docker         # Switch env without starting
    ./start-dev.sh status             # Show status dashboard

  LOGS
    logs/backend/latest.log           # Current backend log
    logs/frontend/latest.log          # Current frontend log

  STATE FILES (auto-generated, gitignored)
    .dev-env-state                    # Persisted environment choice
    .dev-reload-frozen                # Freeze sentinel (presence = frozen)
    .dev-ports-{branch}               # Branch port assignments
    docker-compose.deps-{branch}.yml  # Branch Docker Compose
    app-config.{branch}.yaml          # Branch app config

HELP_EOF
}

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Section 19: Main Entry Point
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

main() {
    parse_args "$@"

    # Apply --env flag if provided
    if [[ -n "$ENV_FLAG" && "$COMMAND" != "env" ]]; then
        set_environment "$ENV_FLAG" 1
    fi

    # Apply --separate flag if provided (and not already the "separate" command)
    if [[ "$SEPARATE_MODE" -eq 1 && "$COMMAND" != "separate" ]]; then
        setup_separate_env
    fi

    # Resolve ports from args or defaults
    if [[ -z "$ACTIVE_BACKEND_PORT" ]]; then
        ACTIVE_BACKEND_PORT="${BACKEND_PORT:-$DEFAULT_BACKEND_PORT}"
    fi
    if [[ -z "$ACTIVE_FRONTEND_PORT" ]]; then
        ACTIVE_FRONTEND_PORT="${PORT:-$DEFAULT_FRONTEND_PORT}"
    fi

    case "$COMMAND" in
        all)
            # PORT flag applies to backend for "all" mode
            if [[ -n "$PORT" && -z "$BACKEND_PORT" ]]; then
                ACTIVE_BACKEND_PORT="$PORT"
            fi
            if [[ -n "$BACKEND_PORT" ]]; then
                ACTIVE_BACKEND_PORT="$BACKEND_PORT"
            fi
            start_all
            ;;
        backend)
            if [[ -n "$PORT" ]]; then
                ACTIVE_BACKEND_PORT="$PORT"
            fi
            start_backend "$ACTIVE_BACKEND_PORT" "$FORCE"
            ;;
        frontend)
            if [[ -n "$PORT" ]]; then
                ACTIVE_FRONTEND_PORT="$PORT"
            fi
            start_frontend "$ACTIVE_FRONTEND_PORT" "$FORCE"
            ;;
        env)
            switch_env_command "$ENV_FLAG"
            ;;
        status)
            show_status "$ACTIVE_BACKEND_PORT" "$ACTIVE_FRONTEND_PORT"
            ;;
        separate)
            setup_separate_env
            start_all
            ;;
        help)
            show_help
            ;;
        *)
            error "Unknown command: $COMMAND"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
