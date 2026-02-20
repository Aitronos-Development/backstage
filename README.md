# Development Guide

Quick reference for running the Backstage project locally.

## Prerequisites

- **Node.js** v22 or v24
- **Yarn** 4.x (`corepack enable`)
- **Docker** (optional, for PostgreSQL/Redis/OpenSearch)

---

## Quick Start

```bash
# Start everything (frontend :3000 + backend :7007) with SQLite in-memory
./start-dev.sh

# Start with Docker services (PostgreSQL + Redis + OpenSearch)
./start-dev.sh --env docker
```

---

## start-dev.sh Commands

| Command                     | Alias     | Description                         |
| --------------------------- | --------- | ----------------------------------- |
| `./start-dev.sh`            |           | Start frontend + backend (default)  |
| `./start-dev.sh backend`    | `be`, `b` | Start backend only                  |
| `./start-dev.sh frontend`   | `fe`, `f` | Start frontend only                 |
| `./start-dev.sh env [l\|d]` | `e`       | Switch environment (local / docker) |
| `./start-dev.sh status`     | `s`       | Show status dashboard               |
| `./start-dev.sh separate`   |           | Branch-isolated environment         |
| `./start-dev.sh help`       | `h`       | Show help                           |

### Flags

| Flag                  | Description                                   |
| --------------------- | --------------------------------------------- |
| `--env local\|docker` | Set environment at startup                    |
| `--port PORT`         | Override default server port                  |
| `--backend-port PORT` | Set backend port                              |
| `--force`             | Kill existing process on port before starting |
| `--separate`          | Enable branch isolation                       |
| `--reset-ports`       | Clear saved port state for current branch     |

### Interactive Keys

While the server is running, press these keys:

| Key | Action                                |
| --- | ------------------------------------- |
| `e` | Switch environment (local / docker)   |
| `r` | Full restart                          |
| `s` | Show status dashboard                 |
| `f` | Freeze / unfreeze hot reload          |
| `t` | Trigger one-shot reload (when frozen) |
| `q` | Quit (graceful shutdown)              |
| `h` | Show help                             |

---

## Environments

### Local (default)

```bash
./start-dev.sh
```

- SQLite in-memory database
- No Docker required
- Zero-setup path for quick development

### Docker

```bash
./start-dev.sh --env docker
```

- PostgreSQL 17.7 on port 5432
- Redis 8.2.1 on port 6379
- OpenSearch 2.19.4 on port 9200
- Closer to production configuration

---

## Branch Isolation (Separate Mode)

Run feature branches in complete isolation with their own Docker containers, ports, and database:

```bash
./start-dev.sh separate
```

Each branch gets:

- Branch-specific PostgreSQL, Redis, and OpenSearch containers
- Unique ports (auto-assigned, saved across sessions)
- Branch-specific `app-config.{branch}.yaml`
- Isolated database with its own volume

Reset port assignments:

```bash
./start-dev.sh separate --reset-ports
```

---

## Freeze / Reload

Pause hot reload to make multiple changes without triggering restarts:

1. Press `f` to **freeze** (stops the server, pauses auto-reload)
2. Make your changes
3. Press `t` to **trigger** a one-shot reload (picks up all changes at once)
4. Press `f` again to **unfreeze** (resumes normal hot reload)

---

## Logs

Timestamped logs are stored in `logs/`:

```bash
# View current backend log
tail -f logs/backend/latest.log

# View current frontend log
tail -f logs/frontend/latest.log
```

---

## Yarn Commands (alternative to start-dev.sh)

These are the standard Backstage commands available without `start-dev.sh`:

| Command                        | Description                   |
| ------------------------------ | ----------------------------- |
| `yarn start`                   | Start frontend + backend      |
| `yarn start:docker`            | Start with Docker deps        |
| `yarn test --no-watch <path>`  | Run tests                     |
| `yarn tsc`                     | TypeScript type checking      |
| `yarn lint --fix`              | Lint and auto-fix             |
| `yarn prettier --write <path>` | Format code                   |
| `yarn build:api-reports`       | Generate API reports          |
| `yarn new`                     | Scaffold new plugins/packages |

---

## Ports

| Service             | Default Port |
| ------------------- | ------------ |
| Frontend            | 3000         |
| Backend             | 7007         |
| PostgreSQL (docker) | 5432         |
| Redis (docker)      | 6379         |
| OpenSearch (docker) | 9200         |
