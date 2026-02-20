# Routing and Permission Gates

## Route Guard Layers

```mermaid
flowchart TD
  Start[Route Request] --> Token{Has access token?}
  Token -- No --> Login[/login]
  Token -- Yes --> Onboard{User has companyId?}
  Onboard -- No --> Onboarding[/onboarding]
  Onboard -- Yes --> Dashboard[/dashboard/*]
```

## UI Gating Components

- `ProtectedRoute`: blocks unauthenticated access
- `OnboardingGuard`: routes pre-company users to onboarding
- `PermissionGate`: module/action-level element control
- `NoAccess`: module page fallback screen

## Button Gating Examples

- POS import: `module="pos" action="actions:import"`
- Item delete: `module="items" action="delete"`
- Inventory move: `module="inventory" action="actions:move"`

## Recommended UX Convention

- Use `mode="hide"` for destructive actions if user lacks permission.
- Use `mode="disable"` when you want discoverability with explicit lockout.
