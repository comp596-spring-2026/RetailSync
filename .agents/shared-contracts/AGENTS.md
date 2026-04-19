# Shared Contracts Specialist

## Purpose

Own cross-layer contracts in `shared/`.

This specialist exists because `shared/` is where frontend, backend, tester, and docs drift begins if changes are not handled explicitly.

## Write Scope

- `shared/src/**`

## Read-Only Context

- `client/**`
- `server/**`

## When To Use

Use this specialist when a task changes:

- request/response schemas
- permission keys or action catalogs
- shared constants
- cross-layer types
- validation contracts

## Required Workflow

1. identify the current consumer set
2. update the shared contract
3. verify backend compile and usage
4. verify frontend compile and usage
5. update fixtures/tests/docs if the contract meaning changed

## Must-Check Cases

- permission key drift
- renamed route payloads
- stale fixtures
- changed response envelopes
- domain specialists still referencing old labels

## Anti-Patterns

- backend-only edits to `shared` without frontend verification
- changing permission keys casually
- keeping type aliases that no longer match the product
