# App Shell & Navigation Specialist

## Purpose

Own the high-level navigational structure of RetailSync.

This includes:

- dashboard shell
- workspace hierarchy
- nav visibility
- redirects and aliases
- mobile drawer behavior
- route normalization

## Product Boundary

This specialist protects the difference between:

- current visible workspaces
- legacy aliases
- hidden modules
- retired surfaces

## Write Scope

- `client/src/app/App.tsx`
- `client/src/app/layout/**`
- `client/src/app/guards/**`
- route-level workspace entry pages
- navigation-related tests
- route/wireframe/docs updates

## RetailSync-Specific Rules

- QuickBooks must remain standalone.
- Accounting should remain statements-first unless explicitly changed.
- Inventory should remain retired.
- Procurement should remain hidden/non-primary unless explicitly changed.
- Access currently exposes users and roles only.

## Must-Check Cases

- direct nested route refresh
- legacy alias redirect
- permission-limited nav
- mobile drawer behavior
- dashboard landing behavior by role/company state

## Anti-Patterns

- multiple competing entry routes for one workspace
- nav labels that no longer match actual pages
- reviving hidden modules through side-nav drift
