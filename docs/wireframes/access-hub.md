# Access Hub Wireframe

Path: [client/src/modules/users/pages/AccessHubPage.tsx](/Users/trupal/Projects/RetailSync/client/src/modules/users/pages/AccessHubPage.tsx)

## Current Model

Access contains only:
- Users
- Roles

There is no separate Access settings tab in the active UX.

## Desktop Sketch

```text
+---------------------------------------------------------------------------------------------+
| Access                                                                                      |
| Manage people, invites, roles, and permission policy.                                       |
|                                                                                             |
| [ Users ] [ Roles ]                                                                         |
|                                                                                             |
| +-----------------------------------------------------------------------------------------+ |
| | invite action | search | filters                                                        | |
| +-----------------------------------------------------------------------------------------+ |
| | User Name | Email | Role | Status | Last Login | Actions                               | |
| |-----------|-------|------|--------|------------|---------------------------------------| |
| | ...                                                                                     | |
| +-----------------------------------------------------------------------------------------+ |
+---------------------------------------------------------------------------------------------+
```

## Mobile Sketch

```text
+--------------------------------------+
| Access                               |
| [ Users ] [ Roles ]                  |
|                                      |
| [ Invite ]                           |
| [ Search................. ]          |
|                                      |
| user cards or compact table rows     |
+--------------------------------------+
```

## UX Rules

- Use routed sub-pages, not local-only tab state.
- Keep users and roles as one hub, but avoid nesting unrelated system settings here.
- Invite flow should remain discoverable from the users surface.
