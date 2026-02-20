# Notes — Freddy Backend x Backstage

## Final scope (agreed)

Three things only:

1. Backstage catalog entry for "Freddy Backend"
2. API docs rendered from OpenAPI spec (all ~30 parent route groups)
3. Live health widget calling /v1/health/details — green/yellow/red per component

## What's deferred

- Prometheus / metrics
- SonarQube / code quality
- TechDocs / rendered markdown
- GitHub Actions plugin
- Alerting / uptime history

## Freddy Backend — key facts

- Location: ../freddy.backend
- Runtime: localhost:8000
- Health: /v1/health/ (liveness), /v1/health/details (readiness)
- OpenAPI: /openapi.json (auto-generated, ~30 route groups)
- Infra: PostgreSQL, Redis, Qdrant (all Docker containers)
- CI/CD: 13 GitHub Actions workflows (already in place)
- Stack: Python 3.13, FastAPI, uv, supervisord, Docker

## Health response shape

```json
{
  "status": "healthy",
  "components": [
    {
      "name": "database",
      "status": "healthy",
      "details": "Connection successful"
    },
    {
      "name": "redis_cache",
      "status": "healthy",
      "details": "Connection successful"
    },
    {
      "name": "limit_enforcement",
      "status": "healthy",
      "details": "Cache and database operational"
    },
    {
      "name": "qdrant_vector_store",
      "status": "healthy",
      "details": "Connection successful"
    }
  ]
}
```

Status values: "healthy" | "degraded" | "unhealthy"
