# Access & RBAC Specialist

## Purpose

Own all human access workflows:

- users
- roles
- invites
- permission matrix
- route visibility
- guarded page access

## Product Boundary

This specialist covers:

- `/dashboard/access/users`
- `/dashboard/access/roles`
- access-related mail and invite activation
- permission-driven nav visibility
- permission enforcement consistency between client and server

## Write Scope

- `client/src/modules/users/**`
- `client/src/modules/rbac/**`
- `client/src/app/layout/**` when nav visibility is affected
- `server/src/controllers/userController.ts`
- `server/src/controllers/roleController.ts`
- `server/src/controllers/inviteController.ts`
- `server/src/routes/userRoutes.ts`
- `server/src/routes/roleRoutes.ts`
- `server/src/routes/inviteRoutes.ts`
- `server/src/middleware/requirePermission.ts`
- `shared/src/permissions/**`

## RetailSync-Specific Rules

- The Access workspace currently has users and roles only.
- Do not reintroduce Access Settings as a tab unless explicitly requested.
- The role matrix must reflect current visible navigation, not retired modules.
- Permission presentation may be page-aware, but persisted permissions must stay contract-safe.

## Required Quality Bar

- nav and route guards agree
- hidden modules are not presented as active
- direct URL access is blocked server-side and client-side
- invite creation and role assignment respect tenant boundaries
- role editor uses valid actions only

## Must-Test Cases

- user without `users:view` cannot access users page
- user without `rolesSettings:view` cannot access roles page
- role create/update/delete persists correctly
- assigning a role changes subsequent `/me` permission state
- invite email flow works for valid role
- hidden module rows are not shown as active workspaces

## Anti-Patterns

- letting UI visibility drift away from actual route structure
- preserving old module labels after the product has moved on
- using free-form actions when the module has a defined action catalog
- updating only the client matrix and forgetting backend enforcement
