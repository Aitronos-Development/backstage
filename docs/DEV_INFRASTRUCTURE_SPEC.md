# Dev Infrastructure Specification

> Complete spec for `start-dev.sh` and `start-compliance.sh` — everything needed to reproduce this dev tooling in another project.

---

## Table of Contents

1. [start-dev.sh — Dev Server Manager](#1-start-devsh--dev-server-manager)
   - [1.1 Shell Configuration](#11-shell-configuration)
   - [1.2 Global State Files](#12-global-state-files)
   - [1.3 CLI Arguments & Flags](#13-cli-arguments--flags)
   - [1.4 Color/Formatting System](#14-colorformatting-system)
   - [1.5 Functions — Infrastructure/Setup](#15-functions--infrastructuresetup)
   - [1.6 Functions — Port Management](#16-functions--port-management)
   - [1.7 Functions — Environment Management](#17-functions--environment-management)
   - [1.8 Functions — Status/Display](#18-functions--statusdisplay)
   - [1.9 Functions — Database](#19-functions--database)
   - [1.10 Functions — Server Lifecycle](#110-functions--server-lifecycle)
   - [1.11 Interactive Runtime Menu](#111-interactive-runtime-menu)
   - [1.12 Freeze/Reload Mechanism](#112-freezereload-mechanism)
   - [1.13 Separate Mode (Branch Isolation)](#113-separate-mode-branch-isolation)
   - [1.14 Process Management (Kill/Restart)](#114-process-management-killrestart)
   - [1.15 Hot Reload PID Tracking](#115-hot-reload-pid-tracking)
   - [1.16 Helper Scripts Called](#116-helper-scripts-called)
   - [1.17 External Tools Required](#117-external-tools-required)
2. [start-compliance.sh — Code Quality Gate](#2-start-compliancesh--code-quality-gate)
   - [2.1 Shell Configuration](#21-shell-configuration)
   - [2.2 CLI Arguments](#22-cli-arguments)
   - [2.3 Shell Functions](#23-shell-functions)
   - [2.4 The Python Engine (enhanced_runner.py)](#24-the-python-engine-enhanced_runnerpy)
   - [2.5 Check Definitions](#25-check-definitions)
   - [2.6 Auto-Fix Commands](#26-auto-fix-commands)
   - [2.7 Auto-Cleanup Commands](#27-auto-cleanup-commands)
   - [2.8 Interactive Menu System](#28-interactive-menu-system)
   - [2.9 Reports & Logging](#29-reports--logging)
   - [2.10 Non-Interactive Mode](#210-non-interactive-mode)
   - [2.11 Project Cleanliness Checker](#211-project-cleanliness-checker)
3. [Git Hook Integration](#3-git-hook-integration)
4. [Docker Compose (Dev)](#4-docker-compose-dev)
5. [Workspace Dockerfile](#5-workspace-dockerfile)
6. [Makefile Targets](#6-makefile-targets)
7. [pyproject.toml — Tool Configs](#7-pyprojecttoml--tool-configs)
8. [Supporting Scripts](#8-supporting-scripts)
9. [File/Directory Map](#9-filedirectory-map)
10. [Design Principles](#10-design-principles)
11. [Frontend Configuration Details](#11-frontend-configuration-details)
    - [11.1 npm Scripts](#111-npm-scripts-srcfrontendpackagejson)
    - [11.2 Biome Configuration](#112-biome-configuration-srcfrontendbiomejson)
    - [11.3 Makefile.frontend — All Targets](#113-makefilefrontend--all-targets)
12. [Pre-Commit Hooks Configuration](#12-pre-commit-hooks-configuration)
13. [Gitignore — State Files](#13-gitignore--state-files)
14. [Workspace Container Entrypoint](#14-workspace-container-entrypoint)
15. [Environment File Structure](#15-environment-file-structure)
16. [Adaptation Checklist](#16-adaptation-checklist)

---

## 1. start-dev.sh — Dev Server Manager

A ~2800-line Bash script that manages the full development lifecycle: Docker containers, database migrations, server processes, interactive runtime controls, and per-branch isolation.

### 1.1 Shell Configuration

```bash
#!/bin/bash
# set -e intentionally DISABLED for graceful error handling
```

No strict mode — every error is handled explicitly with custom recovery paths. This is a deliberate design choice to allow auto-fix attempts (e.g., switching Python versions, retrying deps).

### 1.2 Global State Files

All state files are dot-files in the project root:

| File                           | Purpose                                       | Default Value |
| ------------------------------ | --------------------------------------------- | ------------- |
| `.dev-env-state`               | Persists which API environment is selected    | `"staging"`   |
| `.dev-env-state-{branch}`      | Branch-specific env state (separate mode)     | `"staging"`   |
| `.dev-component-mode`          | Persists component loading mode (dev/prod)    | `"dev"`       |
| `.dev-component-mode-{branch}` | Branch-specific component mode                | `"dev"`       |
| `.dev-reload-frozen`           | Sentinel file — presence = freeze mode active | (absent)      |
| `.dev-ports-{branch}`          | Saved port assignments per branch             | (absent)      |
| `.dev-credentials`             | Auto-generated API key + curl examples        | (generated)   |
| `.dev-mcp-server.pid`          | PID file for MCP dev server (informational)   | (generated)   |
| `.dev-postgres-mcp-server.pid` | PID file for Postgres MCP server              | (generated)   |
| `.dev-seed-marker`             | MD5 hash of seed data (idempotency check)     | (generated)   |

**Separate mode** overrides `ENV_STATE_FILE` and `COMPONENT_MODE_FILE` to branch-specific paths early in startup (before arg parsing completes).

### 1.3 CLI Arguments & Flags

#### Positional Commands (First Argument)

| Command    | Aliases             | Action                                |
| ---------- | ------------------- | ------------------------------------- |
| `backend`  | `be`, `b`           | Start FastAPI backend server          |
| `frontend` | `fe`, `f`           | Start Vite frontend dev server        |
| `desktop`  | `de`                | Start Electron desktop app            |
| `env`      | `e`                 | Switch API environment                |
| `mode`     | `m`                 | Switch component loading mode         |
| `status`   | `s`                 | Show current config and health status |
| `separate` | —                   | Set up isolated branch environment    |
| `help`     | `h`, `--help`, `-h` | Show help text                        |

#### Option Flags

| Flag                  | Argument  | Default               | Purpose                                         |
| --------------------- | --------- | --------------------- | ----------------------------------------------- |
| `--port PORT`         | number    | 7860 (be) / 7800 (fe) | Override default server port                    |
| `--backend-port PORT` | number    | 7860                  | Set backend port that frontend proxies to       |
| `--force`             | —         | `0`                   | Kill any process on target port before starting |
| `--rebuild-image`     | —         | unset                 | Force rebuild of workspace Docker image         |
| `--env ENV`           | env name  | (from state file)     | Set API environment at startup                  |
| `--mode MODE`         | mode name | (from state file)     | Set component loading mode at startup           |
| `--separate`          | —         | `0`                   | Enable branch isolation before starting         |
| `--reset-ports`       | —         | `0`                   | Delete saved port state for current branch      |

#### Sub-arguments for `env` and `mode` Commands

```bash
./start-dev.sh env l       # local
./start-dev.sh env l2      # local2
./start-dev.sh env s       # staging
./start-dev.sh env p       # production
./start-dev.sh mode d      # dev (LFX_DEV=1)
./start-dev.sh mode p      # prod (LFX_DEV unset)
```

### 1.4 Color/Formatting System

ANSI escape codes used throughout:

| Variable | Code         | Use Case                |
| -------- | ------------ | ----------------------- |
| `RED`    | `\033[0;31m` | Errors, freeze banners  |
| `GREEN`  | `\033[0;32m` | Success, healthy status |
| `YELLOW` | `\033[1;33m` | Warnings, prompts       |
| `BLUE`   | `\033[0;34m` | Info                    |
| `CYAN`   | `\033[0;36m` | Headers, sections       |
| `GRAY`   | `\033[0;90m` | Secondary text          |
| `NC`     | `\033[0m`    | Reset                   |

Output uses `echo -e` with embedded codes and `━` banner characters for section dividers.

### 1.5 Functions — Infrastructure/Setup

#### `get_branch_state_files()`

- Gets current git branch: `git rev-parse --abbrev-ref HEAD`
- Sanitizes: replaces non-`[a-zA-Z0-9_-]` with `-`, lowercases
- Updates state file paths to branch-specific versions (e.g., `.dev-env-state-feature-my-branch`)

#### `check_docker()`

- Runs `docker info > /dev/null 2>&1`
- Exits with error if Docker is not running

#### `check_uv()`

- Verifies `uv` is in PATH, prints version

#### `check_npm()`

- Verifies `npm` and `node` are in PATH, prints versions

#### `check_python()`

Auto-fix philosophy — tries to fix problems before failing:

1. Detects if running in a venv (`$VIRTUAL_ENV`), handles stale venvs
2. Checks Python version is 3.10–3.13
3. **Auto-fix on wrong version**: If a compatible Python exists on the system, deactivates current venv, deletes `.venv`, creates a new one with the correct Python, activates it
4. Only exits if no compatible Python found

#### `validate_env_file(path)`

Validates the `.env` file has four required boolean fields:

- `FLOWPLATE_REMOVE_API_KEYS` — must be `true|false|True|False|TRUE|FALSE|1|0`
- `FLOWPLATE_STORE_ENVIRONMENT_VARIABLES` — same
- `FLOWPLATE_OPEN_BROWSER` — same
- `FLOWPLATE_MCP_COMPOSER_ENABLED` — same

Exits on invalid values.

#### `check_env_file()`

Thin wrapper: `validate_env_file ".env_directory/local/.env"`

### 1.6 Functions — Port Management

#### `kill_port(port, force)`

**Critical: process isolation design.** All `lsof` calls use `-sTCP:LISTEN` filter.

- `force=1`: `kill -9` on all processes LISTENING on the port (not clients). Waits up to 10 seconds for port release. Extra sleep before returning.
- `force=0`: Prints list of processes using the port and exits with error.

```bash
lsof -ti:$port -sTCP:LISTEN | xargs kill -9
```

This ensures restarting the backend never kills the frontend, even if the frontend has connections to the backend port.

#### `find_available_port(start_port, max_attempts=10)`

Iterates from `start_port` upward, returns first port not in use per `lsof`.

### 1.7 Functions — Environment Management

#### `set_aitronos_env(env_name, save_state=1)`

- Maps short names to full env names: `l`→`local`, `l2`→`local2`, `s`→`staging`, `p`→`production`
- Reads the environment-specific URL from the `.env` file (key: `FLOWPLATE_AITRONOS_API_URL_*`)
- Derives `FREDDY_API_URL` by appending `/v1` to the Aitronos URL
- Reads the matching master key variable
- Exports: `FLOWPLATE_AITRONOS_API_URL`, `FREDDY_API_URL`, `FLOWPLATE_FLOWPLATE_FREDDY_MASTER_KEY`
- If `save_state=1`: writes env name to state file AND patches the `.env` file with `sed` (macOS-compatible `sed -i ''`)

#### `get_current_env()` / `get_current_component_mode()`

Reads from state file, defaults to `"staging"` / `"dev"`.

#### `set_component_mode(mode_name, save_state=1)`

- `dev`/`d`: exports `LFX_DEV=1`
- `prod`/`p`: unsets `LFX_DEV`
- Saves to state file if `save_state=1`

#### `switch_env_command(target_env)` / `switch_component_mode_command(target_mode)`

Interactive menus if no argument provided, otherwise directly sets the value.

### 1.8 Functions — Status/Display

#### `show_runtime_help()`

Displays at startup after server is running:

- Current Freddy environment + API URL
- Component mode (dev/prod)
- Freeze status
- Auto-reload status
- One-key command reference bar: `e=env m=mode f=freeze t=trigger s=status r=restart h=help q=quit`

#### `show_status()`

Full health dashboard:

- Backend health: `curl /health`
- PostgreSQL container status: `docker compose ps`
- Docker workspace image existence
- Active terminal sessions: `curl /api/v1/terminal/sessions`
- API key: `curl /api/v1/api_key`
- Calls `show_dev_credentials`

#### `show_dev_credentials(be_port)`

- Only runs if backend is reachable
- Runs `uv run python scripts/development/get_dev_credentials.py`
- Displays API key, key name, example curl commands
- Writes credentials to `.dev-credentials`

### 1.9 Functions — Database

#### `setup_postgres()`

1. Selects between standard `docker-compose.dev.yml` and separate-mode compose file
2. Starts `postgres` service if not running: `docker compose up -d postgres`
3. Polls `pg_isready -U flowplate` up to 30 times (1s sleep between)

#### `run_migrations()`

1. Constructs DB URL: `postgresql+asyncpg://flowplate:flowplate@localhost:5433/flowplate`
2. In separate mode, uses branch-specific port and DB name
3. Runs `alembic upgrade head` in `src/backend/base/flowplate/`
4. **Auto-fix on failure**: runs `alembic check`; if "New upgrade operations detected", auto-generates a migration with `alembic revision --autogenerate` and applies it
5. Never hard-fails — always continues

#### `seed_database()`

- Runs `uv run python scripts/seed_database.py`
- Non-fatal on failure (warns but continues)
- Uses MD5-hash-based idempotency (`.dev-seed-marker` file)

### 1.10 Functions — Server Lifecycle

#### `setup_backend()`

Full backend preparation sequence:

1. `check_uv` + `check_env_file` + `setup_postgres`
2. Build `flowplate-workspace:latest` Docker image if missing or `--rebuild-image`
3. Create `.venv` with `uv venv` if needed
4. `uv sync --frozen --extra "postgresql"` (fallback to non-frozen on failure)
5. **Auto-fix on dep failure**: If Python 3.13 + 3.12 available, switches venv to 3.12 and retries
6. Install workspace packages: `uv pip install -e src/backend/base`, `uv pip install -e src/lfx`, `uv pip install -e .`
7. Verify `import flowplate.main` works
8. `run_migrations`, `seed_database`

#### `setup_frontend()`

1. `check_npm`
2. `npm install` in `src/frontend/` (verbose first time, silent after)

#### `start_backend(port, force)`

1. `check_python`, `check_uv`, `setup_backend`, `kill_port` (if force)
2. Sync steering rules: `./scripts/sync-steering-rules.sh bidirectional`
3. Sync Verdant rules: `rsync -a --delete .windsurf/rules/ .verdant/rules/`
4. Load saved env and component mode (without re-saving)
5. Create timestamped log: `logs/backend/backend-YYYY-MM-DD_HH-MM-SS.log` + symlink `latest.log`
6. Save terminal settings, set raw non-blocking TTY: `stty -echo -icanon time 0 min 0`
7. Start uvicorn:

```bash
PYTHONUNBUFFERED=1 LFX_DEV="$lfx_dev_value" uv run uvicorn \
    --factory flowplate.main:create_app \
    --host 0.0.0.0 \
    --port $port \
    [--reload]           # omitted if freeze mode
    --env-file "$env_file" \
    --loop asyncio \
    --workers 1 \
    2>&1 | tee "$log_file" &
```

8. Start background health-check loop (up to 60s timeout)
9. Enter interactive command loop

#### `start_frontend(port, force, backend_port)`

1. `setup_frontend`, `kill_port` (if force)
2. Create timestamped log: `logs/frontend/frontend-YYYY-MM-DD_HH-MM-SS.log` + symlink `latest.log`
3. Start frontend:

```bash
(cd src/frontend; VITE_PROXY_TARGET="http://localhost:$backend_port" npm start -- --port $port) \
    2>&1 | tee "$log_file" &
```

4. Enter interactive command loop

#### `start_desktop()`

1. Checks for `desktop/` directory
2. `npm install` if needed
3. Generates icons if missing
4. **macOS branding**: Renames `Electron.app` → `Flow-Plate.app`, creates hardlink binary, registers with LaunchServices
5. Detects running frontend port (scans 7800, 3000, 2222)
6. Launches branded Electron binary with `NODE_ENV=development DEV_FRONTEND_URL=...`
7. Simpler interactive loop: `r` (restart), `q` (quit), `h` (help)

### 1.11 Interactive Runtime Menu

Both backend and frontend use the same pattern for non-blocking single-character input:

```bash
# Save TTY, set raw non-blocking mode
stty -echo -icanon time 0 min 0

# In loop: read one char without blocking
cmd=$(dd bs=1 count=1 2>/dev/null)
```

#### Backend Commands

| Key     | Action                                                                                                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `e`     | Enter env sub-menu → waits for: `l` (local), `s` (staging), `p` (production), `c`/Enter (cancel)                                                                                            |
| `m`     | Enter mode sub-menu → waits for: `d` (dev), `p` (prod), `c`/Enter (cancel)                                                                                                                  |
| `f`     | **Toggle freeze**: Creates/removes `.dev-reload-frozen`. On freeze: kills + restarts uvicorn WITHOUT `--reload`. On unfreeze: kills + restarts WITH `--reload`. Waits up to 60s for health. |
| `t`     | **Manual reload** (only when frozen): Kills server, restarts WITHOUT `--reload` (stays frozen).                                                                                             |
| `s`     | Show inline status: env, mode, freeze, backend health, DB, terminal sessions, API key.                                                                                                      |
| `r`     | **Full restart**: Restores TTY, removes trap, kills server, `exec "$0" backend --port $port --force [--separate]` to replace process entirely.                                              |
| `h`/`?` | Show runtime help                                                                                                                                                                           |
| `q`     | Graceful shutdown: clean up freeze file, kill server, exit                                                                                                                                  |

#### Frontend Commands

Same as backend but:

- `e` sub-menu also supports `l2` (local2)
- `f` toggles freeze file but tells user to press `r` to apply (frontend HMR state requires restart)
- `r` restarts with: `exec "$0" frontend --port $port --force --backend-port $backend_port [--separate]`

### 1.12 Freeze/Reload Mechanism

Cross-process communication via a sentinel file.

**File**: `.dev-reload-frozen` in project root

| State        | Uvicorn Flag    | Behavior                                                                          |
| ------------ | --------------- | --------------------------------------------------------------------------------- |
| File absent  | `--reload`      | Hot reload active — file changes auto-restart uvicorn                             |
| File present | (no `--reload`) | Frozen — code changes have no effect until `t` (manual trigger) or `f` (unfreeze) |

**Backend behavior on `f` key**:

- **Freezing**: Creates file → immediately kills uvicorn → restarts WITHOUT `--reload`
- **Unfreezing**: Deletes file → immediately kills uvicorn → restarts WITH `--reload`

**Backend behavior on `t` key** (only when frozen):

- Kills uvicorn → restarts WITHOUT `--reload` (picks up latest code, stays frozen)

**Cleanup**: `rm -f "$RELOAD_FREEZE_FILE"` in backend's EXIT trap, so freeze state is always cleared on exit.

### 1.13 Separate Mode (Branch Isolation)

Invoked via `./start-dev.sh separate` or `--separate` flag.

#### `setup_separate_env()` Flow

1. Get current git branch, sanitize: `feature/my-api` → `feature-my-api`
2. Port state file: `.dev-ports-{safe_branch}` — persists port assignments across runs
3. Port selection via `find_available_port()`:
   - PostgreSQL: starting from 5433
   - Backend: starting from 7860
   - Frontend: starting from 7800
4. Generate `docker-compose.dev-{safe_branch}.yml`:
   - Container: `flowplate-postgres-{safe_branch}`
   - Volume: `flowplate-postgres-data-{safe_branch}`
   - Database: `flowplate_{safe_branch}` (underscores, not hyphens)
   - Port: selected PostgreSQL port
5. Generate `.env.{safe_branch}` (copy of `.env` with patched DB URL, port, backend URL)
6. Generate branch-specific state files if they don't exist
7. Start branch-specific PostgreSQL container
8. Export variables: `SEPARATE_MODE=1`, `BRANCH_NAME`, `SAFE_BRANCH`, `POSTGRES_PORT`, `BACKEND_PORT`, `FRONTEND_PORT`, `COMPOSE_FILE`, `ENV_FILE`, `DB_NAME`

**Result**: Each branch gets its own PostgreSQL container, volume, database, env file, and state files — fully isolated.

### 1.14 Process Management (Kill/Restart)

#### Startup (`kill_port`)

```bash
lsof -ti:$port -sTCP:LISTEN | xargs kill -9
# Wait up to 10 seconds for port release
```

Only kills listeners, never clients connected to the port.

#### Runtime Restart (`r` key)

1. `pkill -TERM -P $server_pid` (children first)
2. `kill -TERM $server_pid` (parent)
3. Wait up to 5 seconds (50 polls × 100ms)
4. Fallback: `kill -9` / `pkill -9 -P`
5. Set `RESTART_REQUESTED=1`
6. `exec "$0" ...` to replace current shell process (clean restart)

#### In-Place Restart (freeze/unfreeze/trigger)

1. `disown $server_pid` (suppress job death messages)
2. `pkill -9 -P $server_pid` (kill children)
3. `kill -9 $server_pid` (kill parent)
4. `lsof -ti:$port -sTCP:LISTEN | xargs kill -9` (cleanup stragglers)
5. `sleep 0.3` (let OS release port)
6. Start new process `&`, capture PID
7. Wait up to 60s for health check

#### Graceful Shutdown (`q` or Ctrl+C)

- `trap ... INT TERM EXIT` registered for cleanup
- **Double Ctrl+C support**: First press sets `shutdown_in_progress=1` for graceful shutdown; second press escalates to `kill -9`
- Backend cleanup: kills port listeners via `lsof`, removes freeze file, restores TTY settings
- 3-second graceful window before SIGKILL

### 1.15 Hot Reload PID Tracking

When uvicorn's worker process gets replaced during hot reload:

1. The script detects `$server_pid` is dead
2. Does NOT immediately declare server dead
3. Waits up to 30 seconds, polling:
   - `lsof -ti:$port -sTCP:LISTEN` — is something still listening?
   - `curl /health` — is the server responding?
4. If port is still alive, re-attaches to the new PID
5. This handles uvicorn's `--reload` behavior where the worker PID changes

### 1.16 Helper Scripts Called

| Script                                                     | Called From              | Purpose                                                  |
| ---------------------------------------------------------- | ------------------------ | -------------------------------------------------------- |
| `scripts/sync-steering-rules.sh bidirectional`             | `start_backend()`        | Syncs AI editor rules across 6 systems                   |
| `uv run python scripts/seed_database.py`                   | `seed_database()`        | Seeds DB with starter data                               |
| `uv run python scripts/development/get_dev_credentials.py` | `show_dev_credentials()` | Fetches API key from running backend                     |
| `scripts/development/mcp_dev_server.py`                    | Referenced in output     | MCP dev server (started by AI tools, not by this script) |
| `scripts/development/postgres_mcp_server.py`               | Referenced in output     | Postgres MCP server (started by AI tools)                |

### 1.17 External Tools Required

| Tool                        | Purpose                                               | Check Function             |
| --------------------------- | ----------------------------------------------------- | -------------------------- |
| `docker` / `docker compose` | PostgreSQL containers, workspace images               | `check_docker()`           |
| `uv`                        | Python package management, running scripts            | `check_uv()`               |
| `npm` / `node`              | Frontend dependency management and dev server         | `check_npm()`              |
| `lsof`                      | Port occupancy detection (always with `-sTCP:LISTEN`) | inline                     |
| `curl`                      | Health checks against backend and frontend            | inline                     |
| `stty`                      | Terminal settings save/restore for non-blocking input | inline                     |
| `dd`                        | Single-character non-blocking terminal read           | inline                     |
| `rsync`                     | Rules directory sync                                  | inline                     |
| `alembic`                   | Database migrations (via `uv run`)                    | inline                     |
| `git`                       | Branch name detection                                 | `get_branch_state_files()` |

---

## 2. start-compliance.sh — Code Quality Gate

A Bash wrapper (~400 lines) around a Python engine (~620 lines) that runs code quality checks, auto-fixes, and generates reports.

### 2.1 Shell Configuration

```bash
#!/bin/bash
set -euo pipefail
```

Strict mode enabled (unlike `start-dev.sh`). Exits on any error.

**TTY detection**: If stdout is a terminal, ANSI colors are enabled. If piped/redirected, all color variables are empty (clean output for CI).

### 2.2 CLI Arguments

#### With No Arguments

1. `setup_environment()`
2. If `simple_term_menu` Python module is importable → launch `menu.py` (arrow-navigation menu)
3. Otherwise → `run_enhanced_compliance` with no arguments (fast mode)

#### Named Commands

| Command       | Aliases             | Action                                        |
| ------------- | ------------------- | --------------------------------------------- |
| `help`        | `h`, `--help`, `-h` | Show help, exit 0                             |
| `status`      | `st`                | Show status dashboard, exit 0                 |
| `interactive` | `menu`              | Launch arrow-nav menu (or fallback menu)      |
| `setup-hooks` | `install-hooks`     | Install pre-commit + pre-push hooks           |
| Anything else | —                   | Pass all args through to `enhanced_runner.py` |

#### Flags (passed to Python engine)

| Flag                | Values                               | Description                              |
| ------------------- | ------------------------------------ | ---------------------------------------- |
| `--mode`            | `fast`, `full`, `ci`                 | Which set of checks to run               |
| `--scope`           | `all`, `backend`, `frontend`, `docs` | Filter checks by scope                   |
| `--auto-fix`        | (flag)                               | Run auto-fix commands                    |
| `--interactive`     | (flag)                               | Use interactive menu within runner       |
| `--non-interactive` | (flag)                               | Structured plain-text output for LLMs/CI |
| `--cleanup-only`    | (flag)                               | Run only cleanup commands                |

### 2.3 Shell Functions

#### `setup_environment()`

1. Check `python3` exists (exit if not)
2. Check `uv` exists (warn if not)
3. Try `import simple_term_menu`; if fails, install via `uv pip install --break-system-packages simple-term-menu`

#### `run_enhanced_compliance(...)`

1. `cd` to project root
2. Verify `scripts/compliance/enhanced_runner.py` exists
3. If `$VIRTUAL_ENV` is set: `python3 enhanced_runner.py "$@"`
4. Otherwise: `uv run python3 enhanced_runner.py "$@"`

#### `setup_pre_push_hook()`

Writes `.git/hooks/pre-push`:

```bash
#!/bin/bash
./start-compliance.sh --mode fast --non-interactive
# On success: print green checkmark
# On failure: print fix instructions
```

#### `setup_pre_commit_hook()`

Writes `.git/hooks/pre-commit`:

```bash
#!/bin/bash
if command -v pre-commit &> /dev/null; then
    pre-commit run --hook-stage commit "$@"
else
    exit 0  # no-op if pre-commit not installed
fi
```

#### `show_status()`

Dashboard showing:

- `enhanced_runner.py` presence
- `enhanced_config.json` presence
- Latest JSON report (from `compliance_reports/`)
- Tool availability: `uv`, `uvx`, `ruff`, `node`, `npm`, `yarn`

### 2.4 The Python Engine (enhanced_runner.py)

`EnhancedComplianceRunner` class (~620 lines).

#### Constructor

- `config_path`: defaults to `scripts/compliance/enhanced_config.json`
- `mode`: `"fast"` (default), `"full"`, `"ci"`
- `auto_fix`: bool
- `interactive`: bool
- `non_interactive`: bool
- `scope`: `"all"` (default), `"backend"`, `"frontend"`, `"docs"`

#### State

- Counters: `total_checks`, `passed_checks`, `failed_checks`, `skipped_checks`
- `results`: list of per-check result dicts
- `start_time`, `timestamp`
- `threading.Lock()` for counter thread safety

#### `_run_command(cmd, check_name)` → `(success, stdout, stderr)`

- `subprocess.run(cmd, shell=True, capture_output=True, cwd=root_dir)`
- Timeout: **60 seconds** in fast mode, **300 seconds** in full/ci mode
- Returns `(False, "", "Command timed out...")` on timeout

#### `_should_run_check(check_name, check_config)` → `bool`

1. `enabled` must be `True`
2. Scope filter: check's `scope` must match `self.scope` or be `"all"`
3. Mode filter:
   - `fast`: requires `enabled_in_fast_mode: true`
   - `ci`: requires `enabled_in_ci: true`
   - `full`: all enabled checks run

#### `run_check(check_name, check_config)` → result dict

1. Increment `total_checks`
2. Run command via `_run_command`
3. Evaluate against `thresholds.fail_on_error`:
   - `true` + failed → `failed_checks++`, log `[FAIL]`
   - `false` + failed → `skipped_checks++`, log `[WARN]` (non-blocking)
4. In CI mode: also prints raw stderr in gray

Result dict keys: `check`, `name`, `description`, `status`, `success`, `stdout`, `stderr`, `error`, `scope`, `category`, `duration_seconds`

#### `run_checks()`

1. Log mode header
2. If `auto_fix`: run `_run_cleanup()` first
3. Build check list via `_should_run_check()`
4. Run checks **sequentially** (parallelism removed — caused subprocess hangs)

#### `print_summary()` → exit code

- Interactive mode: colorful output with color-coded counts, **10 slowest checks** timing breakdown, recommendations
- Non-interactive mode: structured plain-text (see §2.10)
- Returns `0` if `failed_checks == 0`, `1` otherwise

#### `_save_report()`

Writes JSON to: `compliance_reports/YYYY-MM-DD/json/enhanced_compliance_YYYY-MM-DD_HH-MM-SS.json`

Contents: timestamp, mode, scope, auto_fix, duration, summary, all per-check results, full config snapshot.

### 2.5 Check Definitions

| Check Key             | Scope    | Category          | Fast | CI  | Blocks Push | Command                                                                                 |
| --------------------- | -------- | ----------------- | ---- | --- | ----------- | --------------------------------------------------------------------------------------- |
| `backend_ruff_syntax` | backend  | code_quality      | YES  | YES | YES         | `uv run ruff check src/backend src/lfx --select=E9,F63,F7,F82 --quiet`                  |
| `backend_ruff_format` | backend  | code_quality      | YES  | YES | YES         | `uv run ruff format --check . --quiet`                                                  |
| `backend_ruff_lint`   | backend  | code_quality      | NO   | YES | NO          | `uv run ruff check --output-format=github .`                                            |
| `backend_mypy`        | backend  | code_quality      | NO   | YES | NO          | `uv run mypy --namespace-packages -p flowplate`                                         |
| `backend_codespell`   | backend  | documentation     | NO   | NO  | NO          | `uvx codespell --toml pyproject.toml` (DISABLED)                                        |
| `backend_bandit`      | backend  | security          | NO   | YES | NO          | `uvx bandit -r src/backend/base/flowplate -c pyproject.toml --severity-level medium -q` |
| `backend_vulture`     | backend  | code_quality      | NO   | YES | NO          | `uv run vulture src/backend/base/flowplate --min-confidence 80`                         |
| `frontend_biome`      | frontend | code_quality      | YES  | YES | YES         | `cd src/frontend && npx @biomejs/biome check .`                                         |
| `frontend_typescript` | frontend | code_quality      | NO   | YES | YES         | `cd src/frontend && npx tsc --noEmit`                                                   |
| `docs_build`          | docs     | documentation     | NO   | YES | NO          | `cd docs && yarn build`                                                                 |
| `project_cleanliness` | all      | project_structure | YES  | YES | YES         | `uv run python3 scripts/compliance/check_project_cleanliness.py`                        |

**Mode summary**:

- **Fast** (pre-push default): 4 checks — ruff syntax, ruff format, biome, project cleanliness
- **Full**: All 10 enabled checks (codespell disabled)
- **CI**: Same as full but with GitHub Actions output format for ruff

### 2.6 Auto-Fix Commands

| Check                 | Auto-Fix Command                                        |
| --------------------- | ------------------------------------------------------- |
| `backend_ruff_syntax` | `uv run ruff check --fix src/backend src/lfx`           |
| `backend_ruff_format` | `uv run ruff format .`                                  |
| `backend_ruff_lint`   | `uv run ruff check --fix .`                             |
| `backend_codespell`   | `uvx codespell --toml pyproject.toml --write`           |
| `frontend_biome`      | `cd src/frontend && npx @biomejs/biome check --write .` |
| `backend_mypy`        | None                                                    |
| `backend_bandit`      | None                                                    |
| `backend_vulture`     | None                                                    |
| `frontend_typescript` | None                                                    |
| `docs_build`          | None                                                    |
| `project_cleanliness` | None (manual cleanup required)                          |

### 2.7 Auto-Cleanup Commands

Run when `auto_fix` is enabled or mode is not `fast`:

```bash
find . -name '*.pyc' -delete
find . -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null || true
find . -name '.pytest_cache' -type d -exec rm -rf {} + 2>/dev/null || true
find . -name '.coverage' -delete 2>/dev/null || true
find . -name 'htmlcov' -type d -exec rm -rf {} + 2>/dev/null || true
```

### 2.8 Interactive Menu System

#### Primary: `menu.py` (Arrow-Key Navigation)

Uses raw terminal mode (`tty.setraw`, `termios`) for POSIX systems.

**Key bindings**:

- Arrow Up/Down: Navigate menu items
- Arrow Right / Enter: Select item
- Arrow Left / Esc: Back to parent menu (or exit at top level)
- Ctrl+C: Exit

**Main menu options**:

1. Fast Check + Auto-Fix (recommended) → `--mode fast --auto-fix`
2. Auto-Fix All Issues → `--auto-fix`
3. Full Check (CI-equivalent) → `--mode full`
4. CI Mode (exact CI output) → `--mode ci`
5. Backend Checks → submenu (Fast, Full, CI, Auto-Fix)
6. Frontend Checks → submenu (Fast, Full, CI, Auto-Fix)
7. Documentation Checks → submenu (Build, CI)
8. Cleanup Only → `--cleanup-only`
9. Status & Reports → `status`
10. Exit

#### Fallback: `simple_interactive_menu.py`

Numbered text input via `input()`. Accepts `q` to quit.

### 2.9 Reports & Logging

**Report location**: `compliance_reports/YYYY-MM-DD/json/enhanced_compliance_YYYY-MM-DD_HH-MM-SS.json`

**Report contents**:

```json
{
  "timestamp": "...",
  "mode": "fast|full|ci",
  "scope": "all|backend|frontend|docs",
  "auto_fix": true|false,
  "duration_seconds": 12.5,
  "summary": { "total": 4, "passed": 4, "failed": 0, "skipped": 0 },
  "results": [
    {
      "check": "backend_ruff_syntax",
      "name": "Backend Ruff Syntax",
      "description": "...",
      "status": "passed",
      "success": true,
      "stdout": "...",
      "stderr": "...",
      "scope": "backend",
      "category": "code_quality",
      "duration_seconds": 2.1
    }
  ],
  "config": { ... }
}
```

### 2.10 Non-Interactive Mode

`--non-interactive` flag produces structured output for CI/LLMs:

```
=== COMPLIANCE SUMMARY ===
Duration: 12.5s
Total Checks: 4
Passed: 4
Failed: 0
Skipped: 0
Success: True
=== FAILED CHECKS ===
- Check description
  Error: first 200 chars of error output...
=== END SUMMARY ===
```

### 2.11 Project Cleanliness Checker

`scripts/compliance/check_project_cleanliness.py`

- Scans every item in the project root directory
- Checks against a hardcoded allowlist (~100+ entries including directories, config files, docs, scripts)
- Items not in the allowlist are checked against cleanup patterns (`*.pyc`, `*.log`, `*.tmp`, `*.bak`, `*.swp`, `.DS_Store`, etc.)
- Special case: `server.log` is whitelisted despite matching `*.log`
- **Does NOT auto-delete anything** — only reports issues with `rm` suggestions
- `--fix` flag is accepted for CLI compatibility but does nothing
- Exit code: 0 (clean) or 1 (issues found)

---

## 3. Git Hook Integration

### Pre-Push Hook (`.git/hooks/pre-push`)

```bash
#!/bin/bash
./start-compliance.sh --mode fast --non-interactive
```

- Runs 4 fast checks (ruff syntax, ruff format, biome, project cleanliness)
- **Exit 0**: Push allowed. Shows Graphite workflow tip (`gt submit`)
- **Exit 1**: Push blocked. Shows fix instructions or `git push --no-verify` bypass

### Pre-Commit Hook (`.git/hooks/pre-commit`)

```bash
#!/bin/bash
if command -v pre-commit &> /dev/null; then
    pre-commit run --hook-stage commit "$@"
else
    exit 0  # no-op
fi
```

Lightweight — defers real checks to pre-push.

### Install/Update Hooks

```bash
./start-compliance.sh setup-hooks
```

---

## 4. Docker Compose (Dev)

`docker-compose.dev.yml`:

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    container_name: flowplate-postgres-dev
    environment:
      POSTGRES_USER: flowplate
      POSTGRES_PASSWORD: flowplate
      POSTGRES_DB: flowplate
    ports:
      - '5433:5432'
    volumes:
      - flowplate-postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U flowplate']
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    container_name: flowplate-redis-dev
    command: redis-server --appendonly yes
    ports:
      - '6385:6379'
    volumes:
      - flowplate-redis-data:/data
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  flowplate-postgres-data:
  flowplate-redis-data:
```

**Key**: PostgreSQL uses `pgvector/pgvector:pg16` (not plain `postgres`) for vector search support. Host port 5433 avoids conflicts with system PostgreSQL on 5432.

### Separate Mode Compose Files

Generated dynamically as `docker-compose.dev-{branch}.yml` with branch-specific container names, volumes, database names, and ports.

---

## 5. Workspace Dockerfile

`docker/workspace.Dockerfile` — Rich development container for integrated terminal feature.

**Base**: `python:3.12-slim`

**System packages** (apt): bash, curl, wget, git, git-lfs, vim, nano, build-essential, inotify-tools, sudo, locales, tree, file, unzip, zip, tar, gzip, bzip2, xz-utils, p7zip-full, htop, procps, lsof, net-tools, strace, jq, yq, ripgrep, fd-find, bat, fzf, tmux, screen, shellcheck, zsh, openssh-client, rsync, socat, netcat-openbsd, dnsutils, iputils-ping, postgresql-client, sqlite3, redis-tools, make, cmake, autoconf, automake, libtool, pkg-config, libssl-dev, libffi-dev, imagemagick, graphviz, and many more dev libs.

**Language runtimes installed**:

- **Node.js** 20.x (nodesource) + npm globals: yarn, pnpm, typescript, ts-node, nodemon, pm2, eslint, prettier, nx, turbo, serve, http-server, json-server, concurrently, npm-check-updates
- **Go** 1.21.5 + gopls, delve, golint
- **Rust** (stable via rustup) + exa, du-dust, tokei, hyperfine, gitui, bottom
- **Java** (OpenJDK default-jdk)
- **Ruby** (apt) + bundler, rake, solargraph
- **PHP** + composer
- **Perl** + cpanminus
- **Lua** 5.4 + LuaRocks
- **R** (r-base)
- **.NET** SDK 8
- **Kotlin** 2.0.0
- **Scala** (via coursier)
- **Elixir** + Erlang
- **Clojure**
- **Haskell** (GHCup minimal)
- **Swift** 5.10 (amd64 only)
- **Zig** 0.13.0 (amd64 only)
- **Nim** (choosenim)
- **Deno**
- **Bun**
- **Homebrew** (Linuxbrew)

**Python packages** (system pip): uv, pipx, poetry, requests, httpx, aiohttp, numpy, pandas, matplotlib, scipy, ipython, jupyter, pytest, pytest-asyncio, pytest-cov, black, ruff, flake8, mypy, autopep8, isort, fastapi, uvicorn, flask, django, sqlalchemy, alembic, pydantic, python-dotenv, click, rich, typer, tqdm, pyyaml, toml, boto3, pyjwt, cryptography.

**User**: `workspace` (non-root) with `NOPASSWD:ALL` sudo

**npm global prefix**: `/home/workspace/.local/npm-global` (persisted via per-user volume)

**Entrypoint**: `workspace-init` script (handles volume ownership on first mount)

---

## 6. Makefile Targets

### Core Targets

| Target          | Command                                                                                    | Description               |
| --------------- | ------------------------------------------------------------------------------------------ | ------------------------- |
| `make init`     | `install_backend` + `install_frontend` + `uvx pre-commit install`                          | Full initial setup        |
| `make backend`  | `setup_env` + `install_backend` + kill port 7860 + `uv run uvicorn --factory ... --reload` | Start backend dev server  |
| `make frontend` | `install_frontend` + `sync_bidirectional` + `npm start`                                    | Start frontend dev server |
| `make run_cli`  | `install_frontend` + `install_backend` + `build_frontend` + `uv run flowplate run ...`     | Run full app              |

### Quality Targets

| Target                 | Command                                                                                       | Description                  |
| ---------------------- | --------------------------------------------------------------------------------------------- | ---------------------------- |
| `make format_backend`  | `uv run ruff check . --fix && uv run ruff format .`                                           | Format backend code          |
| `make format_frontend` | `cd src/frontend && npm run format`                                                           | Format frontend code (Biome) |
| `make lint`            | `uv run mypy --namespace-packages -p "flowplate"`                                             | Type check backend           |
| `make unit_tests`      | `uv run pytest src/backend/tests/unit --instafail -ra -m 'not api_key_required' --ff -n auto` | Run backend unit tests       |
| `make tests`           | `unit_tests` + `integration_tests` + `coverage`                                               | Run all tests                |

### Database Targets

| Target                                | Command                                                                            | Description         |
| ------------------------------------- | ---------------------------------------------------------------------------------- | ------------------- |
| `make alembic-revision message="..."` | `cd src/backend/base/flowplate && uv run alembic revision --autogenerate -m "..."` | Generate migration  |
| `make alembic-upgrade`                | `cd src/backend/base/flowplate && uv run alembic upgrade head`                     | Apply migrations    |
| `make alembic-check`                  | `cd src/backend/base/flowplate && uv run alembic check`                            | Validate migrations |

### Install/Build Targets

| Target             | Command                                                                    | Description                   |
| ------------------ | -------------------------------------------------------------------------- | ----------------------------- |
| `install_backend`  | `uv sync --frozen --extra "postgresql"` + `uv pip install -e` (3 packages) | Install Python deps           |
| `install_frontend` | `cd src/frontend && npm install`                                           | Install npm deps              |
| `build_frontend`   | `cd src/frontend && CI='' npm run build` + copy to backend                 | Build frontend for production |

### Key Variables

```makefile
log_level = debug
host = 0.0.0.0
port = 7860
workers = 1
async = true     # -n auto for parallel tests
lf = false       # --lf (rerun last failed)
ff = true        # --ff (fail fast)
```

---

## 7. pyproject.toml — Tool Configs

### Ruff

```toml
[tool.ruff]
target-version = "py310"
line-length = 120
exclude = ["src/backend/base/flowplate/alembic/*", ...]

[tool.ruff.lint]
select = ["ALL"]      # ALL rules enabled
ignore = [
    "C90",            # McCabe complexity
    "CPY",            # Copyright
    "COM812", "ISC001", # Formatter conflicts
    "ERA",            # Commented-out code
    "FIX002",         # TODOs
    "PLR09",          # Too-many args/statements
    "D10",            # Missing docstrings
    "ANN",            # All annotation rules
    # ... and more
]
```

**Per-file ignores**: Scripts get relaxed rules (print, security, docs). Tests get no-assert, no-docstring. FastAPI endpoints and SQLModel models allow `TCH` (runtime type evaluation).

**Pydocstyle convention**: Google

### Mypy

```toml
[tool.mypy]
plugins = ["pydantic.mypy"]
follow_imports = "skip"
disable_error_code = ["type-var"]
namespace_packages = true
ignore_missing_imports = true
```

### Bandit

```toml
[tool.bandit]
exclude_dirs = ["tests", "src/backend/tests", "src/lfx/tests", ".venv", "node_modules"]
skips = ["B101", "B104", "B311"]  # assert, bind-all, random-for-non-crypto
```

### Vulture

```toml
[tool.vulture]
exclude = ["tests/", ".venv/", "node_modules/", "alembic/"]
min_confidence = 80
```

### Pytest

```toml
[tool.pytest.ini_options]
timeout = 150
timeout_method = "signal"
minversion = "6.0"
testpaths = ["src/backend/tests", "src/lfx/tests"]
asyncio_mode = "auto"
asyncio_fixture_loop_scope = "function"
addopts = "-p no:benchmark"
markers = ["async_test", "api_key_required", "no_blockbuster", "benchmark", "unit", "integration", "slow"]
```

### Coverage

```toml
[tool.coverage.run]
source = ["src/backend/base/flowplate/"]
omit = ["*/alembic/*", "tests/*", "*/__init__.py"]
```

---

## 8. Supporting Scripts

### `scripts/sync-steering-rules.sh`

- Wraps `scripts/sync-steering-rules.py`
- Syncs AI editor rules across 6 systems: Cursor, Kiro, Antigravity, Claude Code, Cline, Windsurf
- Bidirectional sync based on file modification times
- Also syncs to Verdant via `rsync`

### `scripts/seed_database.py`

- Seeds database with starter projects and default superuser
- MD5-hash-based idempotency (hashes all `*.json` in `initial_setup/starter_projects/`)
- Marker file: `.dev-seed-marker`
- `--force` flag bypasses idempotency check

### `scripts/development/get_dev_credentials.py`

- Queries `SELECT * FROM api_key LIMIT 1` via SQLAlchemy async
- Outputs `API_KEY=...`, `KEY_NAME=...`, `CREATED_AT=...` to stdout
- Loads `.env_directory/local/.env` for DB connection config

### `scripts/compliance/check_project_cleanliness.py`

- Scans project root against ~100+ item allowlist
- Flags files matching cleanup patterns (`*.pyc`, `*.log`, `*.tmp`, etc.)
- Never auto-deletes — only reports with `rm` suggestions
- Exit 0 (clean) or 1 (issues found)

### `scripts/compliance/menu.py`

- Arrow-key navigation menu using raw terminal mode (`tty.setraw`, `termios`)
- Main menu with submenus for Backend, Frontend, Docs
- Launches compliance commands as subprocesses

### `scripts/compliance/enhanced_runner.py`

- Core Python compliance engine
- Sequential check execution with timeout (60s fast / 300s full)
- JSON report generation
- Non-interactive structured output mode

---

## 9. File/Directory Map

```
project-root/
├── start-dev.sh                              # Main dev server manager (~2800 lines)
├── start-compliance.sh                       # Compliance wrapper (~400 lines)
├── Makefile                                  # Core make targets
├── Makefile.frontend                         # Frontend-specific targets
├── pyproject.toml                            # Python project config + tool configs
├── docker-compose.dev.yml                    # PostgreSQL + Redis for dev
├── docker/
│   ├── workspace.Dockerfile                  # Rich dev container
│   ├── workspace-init.sh                     # Container entrypoint
│   └── workspace-welcome.sh                  # First-login welcome message
├── scripts/
│   ├── compliance/
│   │   ├── enhanced_runner.py                # Python compliance engine
│   │   ├── enhanced_config.json              # Check definitions + config
│   │   ├── menu.py                           # Arrow-key interactive menu
│   │   ├── simple_interactive_menu.py        # Fallback numbered menu
│   │   ├── interactive_menu.py               # Alternative menu (simple_term_menu)
│   │   └── check_project_cleanliness.py      # Root directory validator
│   ├── development/
│   │   ├── get_dev_credentials.py            # Fetch API key from DB
│   │   ├── mcp_dev_server.py                 # MCP dev server for AI tools
│   │   └── postgres_mcp_server.py            # Postgres MCP server for AI tools
│   ├── sync-steering-rules.sh                # Rule sync wrapper
│   ├── sync-steering-rules.py                # Rule sync engine
│   ├── seed_database.py                      # DB seeder
│   └── setup/
│       └── setup_env.sh                      # Environment setup
├── .env_directory/local/.env                 # Main environment variables
├── .git/hooks/
│   ├── pre-push                              # Compliance gate (fast mode)
│   └── pre-commit                            # Lightweight commit checks
├── logs/
│   ├── backend/                              # Backend logs (timestamped + latest.log symlink)
│   └── frontend/                             # Frontend logs (timestamped + latest.log symlink)
├── compliance_reports/                       # JSON compliance reports
│   └── YYYY-MM-DD/json/
│       └── enhanced_compliance_*.json
│
# State files (auto-generated, gitignored):
├── .dev-env-state                            # Current API environment
├── .dev-component-mode                       # Current component mode
├── .dev-reload-frozen                        # Freeze sentinel
├── .dev-credentials                          # API key cache
├── .dev-seed-marker                          # Seed idempotency hash
├── .dev-ports-{branch}                       # Branch port assignments
├── .dev-env-state-{branch}                   # Branch env state
├── .dev-component-mode-{branch}              # Branch component mode
├── .env.{branch}                             # Branch env file
└── docker-compose.dev-{branch}.yml           # Branch compose file
```

---

## 10. Design Principles

These are the core design decisions that make this system work well. Replicate these in your new project:

### 1. No `set -e` in dev server script

Errors are handled explicitly with custom recovery paths. This enables auto-fix behaviors (wrong Python version, failed deps, schema drift) that would be impossible with `set -e`.

### 2. `set -euo pipefail` in compliance script

The compliance script should fail fast and clearly — no silent errors.

### 3. Process isolation via `-sTCP:LISTEN`

**All** `lsof` port-kill operations filter by listen state. This prevents restarting the backend from killing frontend connections to the backend port. This is critical.

### 4. Single-character non-blocking input

The `stty -icanon` + `dd bs=1 count=1` pattern allows simultaneous server output and key input without threads or separate processes. The TTY settings must be saved and restored on exit.

### 5. Double Ctrl+C safety

First Ctrl+C triggers graceful shutdown. Second Ctrl+C (while `shutdown_in_progress=1`) escalates to `kill -9`.

### 6. Hot reload PID tracking

When uvicorn replaces its worker during hot reload, the old PID dies. The script polls `lsof` on the port (up to 30s) to re-attach to the new PID rather than declaring the server dead.

### 7. Persistent state via dot files

Environment and mode choices survive restarts via simple dot files. No env variables need to be re-specified on restart.

### 8. Auto-fix philosophy

Python version mismatches, dependency failures, and schema drift all have automatic remediation paths before hard-failing. The script tries to fix the problem, not just report it.

### 9. Separate mode isolation

Each git branch gets its own PostgreSQL container, volume, database, env file, and state files. Complete isolation with zero cross-contamination.

### 10. Layered quality gates

- **Pre-commit**: Lightweight (pre-commit hooks only)
- **Pre-push**: Fast mode (4 checks, ~30-60s)
- **Manual/CI**: Full mode (10 checks, ~3-5min)

### 11. Non-interactive output for automation

The `--non-interactive` flag produces structured plain-text with clear section markers, parseable by CI systems and LLMs.

### 12. JSON compliance reports

Every run generates a JSON report with full metadata, enabling trend analysis and debugging.

### 13. Self-bootstrapping config

The compliance config creates itself if missing. The system works with zero manual setup beyond the scripts themselves.

### 14. macOS-compatible sed

All `sed -i` operations detect `$OSTYPE == darwin*` and use `sed -i ''` (macOS) vs `sed -i` (Linux).

---

## 11. Frontend Configuration Details

### 11.1 npm Scripts (`src/frontend/package.json`)

| Script              | Command                                                     | Used By                         |
| ------------------- | ----------------------------------------------------------- | ------------------------------- |
| `start`             | `vite`                                                      | `start-dev.sh`, `make frontend` |
| `dev:docker`        | `vite --host 0.0.0.0`                                       | Docker environments             |
| `build`             | `vite build`                                                | `make build_frontend`           |
| `serve`             | `vite preview`                                              | Production preview              |
| `format`            | `npx @biomejs/biome format --write`                         | `make format_frontend`          |
| `lint`              | `npx @biomejs/biome lint`                                   | Manual lint                     |
| `lint:changed`      | `bash scripts/lint-changed.sh`                              | Lint only changed files         |
| `lint:types`        | `npx @biomejs/biome lint --diagnostic-level=error`          | Error-only lint                 |
| `lint:types:staged` | `npx @biomejs/biome lint --staged --diagnostic-level=error` | Pre-commit staged lint          |
| `check-format`      | `npx @biomejs/biome check`                                  | Compliance checks               |
| `type-check`        | `tsc --noEmit --pretty --project tsconfig.json && vite`     | TypeScript verification         |
| `test`              | `jest`                                                      | `make test_frontend`            |
| `test:coverage`     | `jest --coverage`                                           | Coverage report                 |
| `test:watch`        | `jest --watch`                                              | Dev test mode                   |
| `storybook`         | `storybook dev -p 6006`                                     | Component development           |
| `build-storybook`   | `storybook build`                                           | Storybook static build          |

The `proxy` field points to `http://localhost:7860` (the backend). The `VITE_PROXY_TARGET` env var overrides this when started via `start-dev.sh`.

**Biome version pinned**: `@biomejs/biome: 2.1.1` (devDependency).

### 11.2 Biome Configuration (`src/frontend/biome.json`)

```json
{
  "$schema": "https://biomejs.dev/schemas/2.1.1/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true,
    "defaultBranch": "main"
  },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2 },
  "javascript": { "formatter": { "quoteStyle": "double" } },
  "assist": {
    "enabled": true,
    "actions": { "source": { "organizeImports": "on" } }
  }
}
```

**Key rule decisions**:

- `noExplicitAny`: **OFF** — explicitly disabled. Never add `biome-ignore` comments for `any` types
- `noConsole`: **warn** — only `console.error` and `console.warn` are allowed (not `console.log`)
- `noUnusedVariables`: **warn** — prefix unused vars with `_` (e.g., `_refetch`)
- `useExhaustiveDependencies`: **OFF** — React hook dependency warnings disabled
- `noStaticElementInteractions`: **OFF** — a11y static element warnings disabled
- `recommended` rules: **OFF** — uses a custom ruleset instead
- Most `correctness` and `suspicious` rules are at **error** level

### 11.3 Makefile.frontend — All Targets

| Target                    | Command                                                                     | Description           |
| ------------------------- | --------------------------------------------------------------------------- | --------------------- |
| `install_frontend`        | `cd src/frontend && npm install`                                            | Standard install      |
| `install_frontendci`      | `cd src/frontend && npm ci`                                                 | CI clean install      |
| `install_frontendc`       | Delete `node_modules` + `package-lock.json`, then `npm install`             | Clean reinstall       |
| `frontend_deps_check`     | Checks if `node_modules` exists; installs if missing                        | Dependency gate       |
| `build_frontend`          | `CI='' npm run build` + copy to `src/backend/base/flowplate/frontend`       | Production build      |
| `run_frontend`            | `npm start` (with optional `FRONTEND_START_FLAGS`)                          | Start Vite            |
| `frontend`                | `install_frontend` + `sync_bidirectional` + `run_frontend`                  | Full frontend start   |
| `frontendc`               | `install_frontendc` + `run_frontend`                                        | Clean start           |
| `format_frontend`         | `npm run format`                                                            | Biome format          |
| `tests_frontend`          | `npx playwright test --project=chromium` (optionally `--ui` when `UI=true`) | Playwright e2e        |
| `test_frontend`           | `npm test` (Jest)                                                           | Unit tests            |
| `test_frontend_watch`     | `npm run test:watch`                                                        | Watch mode            |
| `test_frontend_coverage`  | `npx jest --coverage`                                                       | Coverage report       |
| `test_frontend_verbose`   | `npx jest --verbose`                                                        | Verbose output        |
| `test_frontend_ci`        | `CI=true npx jest --ci --coverage --watchAll=false`                         | CI mode               |
| `test_frontend_clean`     | `npx jest --clearCache && npx jest`                                         | Clear cache + run     |
| `test_frontend_file`      | `npx jest <path>`                                                           | Single file test      |
| `test_frontend_pattern`   | `npx jest --testNamePattern=<pattern>`                                      | Pattern match         |
| `test_frontend_snapshots` | `npx jest --updateSnapshot`                                                 | Update snapshots      |
| `test_frontend_bail`      | `npx jest --bail`                                                           | Stop on first failure |
| `storybook`               | `npm run storybook` (port 6006)                                             | Storybook dev         |
| `storybook_build`         | `npm run build-storybook`                                                   | Storybook build       |
| `storybook_network`       | `npm run storybook:network` (0.0.0.0:6006)                                  | Network storybook     |

**Note**: `build_frontend` uses `CI=''` to suppress treat-warnings-as-errors behavior from npm. Built output goes to `src/backend/base/flowplate/frontend` (backend serves it statically).

---

## 12. Pre-Commit Hooks Configuration

### `.pre-commit-config.yaml`

This defines the **commit-time** hooks (lightweight, fast). The heavy checks are in the pre-push hook via `start-compliance.sh`.

#### Standard Hooks (from `pre-commit/pre-commit-hooks` v5.0.0)

| Hook                  | Scope                  | Description                                                     |
| --------------------- | ---------------------- | --------------------------------------------------------------- |
| `check-case-conflict` | All files              | Catch files that would conflict on case-insensitive filesystems |
| `end-of-file-fixer`   | `*.py`, `*.js`, `*.ts` | Ensure files end with a newline                                 |
| `mixed-line-ending`   | `*.py`, `*.js`, `*.ts` | Enforce LF line endings (`--fix=lf`)                            |
| `trailing-whitespace` | All files              | Remove trailing whitespace                                      |

#### Local Custom Hooks

| Hook                        | Command                                                                                 | Files                                 | Description                       |
| --------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------- |
| `ruff`                      | `uv run ruff check --fix`                                                               | `*.py`, `*.pyi`                       | Auto-fix Python lint issues       |
| `ruff-format`               | `uv run ruff format --config pyproject.toml`                                            | `*.py`, `*.pyi`                       | Format Python code                |
| `validate-migrations`       | `python alembic/migration_validator.py`                                                 | Alembic version files                 | Validate migration files          |
| `check-migration-phase`     | Checks for `Phase: EXPAND\|MIGRATE\|CONTRACT`                                           | Alembic version files                 | Ensure migration phase annotation |
| `detect-secrets`            | `detect-secrets-hook --baseline .secrets.baseline`                                      | All (excludes `docs/`, `SECURITY.md`) | Yelp detect-secrets v1.5.0        |
| `local-biome-check`         | `npx @biomejs/biome check --write --files-ignore-unknown=true --diagnostic-level=error` | Frontend files                        | Auto-fix frontend on commit       |
| `biome-lint-no-any-staged`  | `npx @biomejs/biome lint --staged --diagnostic-level=error --no-errors-on-unmatched`    | `*.ts`, `*.tsx`                       | Lint staged TS files              |
| `validate-starter-projects` | `uv run python test_starter_projects.py --security-check`                               | Starter project JSON                  | Security check on starter data    |
| `check-deprecated-imports`  | `uv run python scripts/check_deprecated_imports.py`                                     | `src/lfx/src/lfx/components/**/*.py`  | Flag deprecated imports           |

**Install**: `uvx pre-commit install` (run by `make init`)

---

## 13. Gitignore — State Files

All dev infrastructure state files are gitignored. These entries must be added to `.gitignore` in the new project:

```gitignore
# Dev environment state (runtime env switching)
.dev-env-state
.dev-env-state-*
.dev-component-mode-*
.dev-ports-*
.dev-seed-marker
.dev-credentials
.dev-reload-frozen

# Compliance reports
compliance_reports/

# Logs
logs
*.log

# Environment files (secrets)
.env
.env.backup
.env.test

# Branch-specific files (separate mode)
docker-compose.dev-*.yml
.env.*

# Built frontend (served by backend)
src/backend/base/flowplate/frontend/
```

---

## 14. Workspace Container Entrypoint

### `docker/workspace-init.sh`

This script runs as the container entrypoint. It's critical for per-user volume persistence:

```bash
#!/bin/bash
# 1. Fix ownership if volume was just created (Docker creates as root)
if [ -d /home/workspace ]; then
  if [ "$(stat -c '%u' /home/workspace 2>/dev/null)" != "$(id -u)" ]; then
    sudo chown -R workspace:workspace /home/workspace 2>/dev/null || true
  fi
fi

# 2. Ensure essential directories exist (idempotent)
mkdir -p /home/workspace/.local/bin \
         /home/workspace/.local/npm-global \
         /home/workspace/.cargo \
         /home/workspace/go/bin \
         /home/workspace/.config

# 3. Ensure npm prefix is set (may be missing on first volume mount)
if [ ! -f /home/workspace/.npmrc ] || ! grep -q 'prefix' /home/workspace/.npmrc 2>/dev/null; then
  npm config set prefix /home/workspace/.local/npm-global 2>/dev/null || true
fi

# 4. Source cargo env if available
if [ -f /home/workspace/.cargo/env ]; then
  . /home/workspace/.cargo/env
fi

# 5. Ensure .bashrc exists with one-time welcome message
if [ ! -f /home/workspace/.bashrc ]; then
  echo '# Show welcome message on first login' >> /home/workspace/.bashrc
  echo 'if [ ! -f ~/.welcome_shown ]; then' >> /home/workspace/.bashrc
  echo '  workspace-welcome' >> /home/workspace/.bashrc
  echo '  touch ~/.welcome_shown' >> /home/workspace/.bashrc
  echo 'fi' >> /home/workspace/.bashrc
fi

# 6. Replace shell with actual command
exec "$@"
```

**Key behaviors**:

- Fixes volume ownership on first mount (Docker creates volumes as root)
- Creates language-specific directories that must persist across container restarts
- Sets npm global prefix to volume-backed directory
- One-time welcome message via `.welcome_shown` sentinel file
- `exec "$@"` replaces the entrypoint process with the container command

---

## 15. Environment File Structure

### `scripts/setup/setup_env.sh`

Minimal — only creates an empty `.env` if it doesn't exist:

```bash
#!/bin/bash
if [ ! -f .env ]; then
  echo "Creating .env file"
  touch .env
fi
```

### `.env_directory/local/.env` — Required Variables

The actual env file lives at `.env_directory/local/.env`. The `validate_env_file()` function in `start-dev.sh` enforces these required boolean fields:

```env
# Required (validated by start-dev.sh)
FLOWPLATE_REMOVE_API_KEYS=false
FLOWPLATE_STORE_ENVIRONMENT_VARIABLES=true
FLOWPLATE_OPEN_BROWSER=false
FLOWPLATE_MCP_COMPOSER_ENABLED=true

# Database
FLOWPLATE_DATABASE_URL=postgresql+asyncpg://flowplate:flowplate@localhost:5433/flowplate

# Server
FLOWPLATE_PORT=7860
FLOWPLATE_HOST=0.0.0.0

# API environments (one per environment)
FLOWPLATE_AITRONOS_API_URL_LOCAL=http://localhost:8000
FLOWPLATE_AITRONOS_API_URL_STAGING=https://staging.example.com
FLOWPLATE_AITRONOS_API_URL_PRODUCTION=https://api.example.com

# Derived (set by start-dev.sh at runtime)
FLOWPLATE_AITRONOS_API_URL=...
FREDDY_API_URL=...
FLOWPLATE_FLOWPLATE_FREDDY_MASTER_KEY=...
```

---

## 16. Adaptation Checklist

When reproducing this system in another project, here's what to adapt:

### Must Change (Project-Specific)

- [ ] All `flowplate` references in commands → your project name
- [ ] Database name, user, password in Docker Compose
- [ ] Backend source paths (`src/backend/base/flowplate/` → your paths)
- [ ] Frontend source path (`src/frontend/` → your path)
- [ ] Environment variable prefixes (`FLOWPLATE_*` → your prefix)
- [ ] Health check endpoint (`/health` → your endpoint)
- [ ] The `uvicorn --factory` app path (`flowplate.main:create_app` → your app)
- [ ] The `import flowplate.main` verification → your module
- [ ] Project cleanliness allowlist (entire list is project-specific)
- [ ] Seed database script (or remove if not needed)
- [ ] API credentials script (or remove if not needed)
- [ ] Steering rules sync (remove if you don't use multiple AI editors)

### Can Reuse As-Is (Generic Patterns)

- [ ] Process management (kill_port, PID tracking, double Ctrl+C)
- [ ] Interactive runtime menu (stty + dd pattern)
- [ ] Freeze/reload mechanism (sentinel file pattern)
- [ ] Separate mode (branch isolation via dynamic Docker Compose)
- [ ] Compliance engine (enhanced_runner.py — just change the checks)
- [ ] Arrow-key menu system (menu.py)
- [ ] Git hook installation (setup-hooks command)
- [ ] JSON report generation
- [ ] Non-interactive structured output
- [ ] Color/formatting system
- [ ] Timestamped log files with latest.log symlink
- [ ] Auto-cleanup commands
- [ ] macOS/Linux sed detection

### Don't Forget

- [ ] Add all `.dev-*` state files to `.gitignore`
- [ ] Add `compliance_reports/` to `.gitignore`
- [ ] Add `logs/` to `.gitignore`
- [ ] Make scripts executable: `chmod +x start-dev.sh start-compliance.sh`
- [ ] Install pre-commit: `uvx pre-commit install` or `./start-compliance.sh setup-hooks`
- [ ] Create `logs/backend/` and `logs/frontend/` directories
- [ ] Create `scripts/compliance/` directory structure
- [ ] Ensure `docker` and `uv` are installed on dev machines
