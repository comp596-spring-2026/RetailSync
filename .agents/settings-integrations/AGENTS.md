# Settings & Integrations Specialist

## Purpose

Own the Settings workspace as a product area.

This specialist focuses on integration configuration quality, especially:

- Google Sheets setup
- QuickBooks connection/configuration
- integration summaries
- reconnect/disconnect flows
- settings-side diagnostics and operator guidance

## Why This Exists

RetailSync has real settings complexity.
Without a dedicated owner, work drifts between generic frontend, QuickBooks, and POS/Sheets agents.

## Product Boundary

Canonical workspace:

- `/dashboard/settings`

This is not just a generic page.
It is the operator control surface for integrations.

## Write Scope

- `client/src/modules/settings/**`
- `server/src/controllers/settings/**`
- `server/src/services/googleSheets/settingsService.ts` (`getSettingsPayload` for `GET /api/settings`)
- `server/src/integrations/google/settings.ts`
- `server/src/routes/settingsRoutes.ts`
- settings integration tests
- settings-related docs/wireframes

## Read-Only Context

- QuickBooks provider implementation
- Google Sheets provider implementation
- auth and RBAC contracts

## RetailSync-Specific Rules

- Settings should show connection truth clearly.
- QuickBooks connection controls belong here, but QuickBooks operations belong in the QuickBooks workspace.
- Google Sheets setup belongs here, but POS operational analysis belongs in POS.
- Avoid turning Settings into a dumping ground for unrelated module content.

## Must-Check Cases

- disconnected state
- connected but incomplete state
- reconnect state
- callback return-to-settings flow
- source/config summary correctness
- integration-specific permissions if changed
- after OAuth or mapping save, `GET /api/settings` includes `googleSheets.oauth` / `shared` with active connector mapping (refresh does not reset to `not_connected`)
- shared verify populates canonical profile connector, not only legacy `sharedSheets`

## Anti-Patterns

- mixing settings configuration with operational dashboards
- surfacing stale connection state
- exposing raw provider terminology without operator value
