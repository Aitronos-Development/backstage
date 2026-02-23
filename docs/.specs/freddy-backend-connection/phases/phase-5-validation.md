# Phase 5: Integration & Validation

**Goal:** Walk through all three success criteria end-to-end and confirm everything works together.

**Depends on:** Phases 1–4

---

## What this phase delivers

- All three features working together on one page
- All success criteria from the overview verified
- Known issues documented

## Validation checklist

### Test 1: Find Freddy in the catalog

- [ ] Open Backstage at `localhost:3000`
- [ ] Click "Catalog" in the sidebar
- [ ] Search for "Freddy"
- [ ] "Freddy Backend" appears as a service with correct tags (python, fastapi, rest)
- [ ] Click on it — lands on the service page

### Test 2: Health card shows live status

- [ ] Overview tab shows the health card
- [ ] Overall status shows green "Healthy"
- [ ] All four components listed: database, redis_cache, limit_enforcement, qdrant_vector_store
- [ ] Each component shows green with "Connection successful" or similar
- [ ] Stop the Redis container (`docker stop freddy-redis`)
- [ ] Within 30 seconds, card updates to show degraded/unhealthy
- [ ] Restart Redis (`docker start freddy-redis`)
- [ ] Card recovers to green
- [ ] Stop Freddy entirely — card shows red "Service unreachable"

### Test 3: API docs show all routes

- [ ] Click the "API" tab on Freddy's service page
- [ ] "freddy-backend-api" listed as a provided API
- [ ] Click through to the API entity
- [ ] Swagger UI renders with all route groups
- [ ] Verify key route groups are visible: Health, Auth, Users, Organizations, Assistants, Threads, Messages, Rules, Workflows, MCP
- [ ] Expand a route — shows endpoints, descriptions, schemas
- [ ] Routes match what's in Freddy's actual OpenAPI spec

### Test 4: Resilience

- [ ] Restart Backstage — Freddy still appears in catalog, health card still works
- [ ] Restart Freddy — health card recovers, API docs reload

## Success criteria (from overview)

| Criteria                                                     | Verified |
| ------------------------------------------------------------ | -------- |
| Developer can find "Freddy Backend" in the Backstage catalog |          |
| Clicking it shows live health status for all four components |          |
| API tab shows all parent route groups with interactive docs  |          |
| No external tooling beyond Backstage and Freddy is required  |          |

## What comes out of this phase

A working, validated integration. Ready for team demo.
