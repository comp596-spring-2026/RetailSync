# Skill: Map Fields

## Goal

Design and implement durable, versioned, and deterministic field mappings between external systems (Google Sheets, QuickBooks) and internal domain models.

Mappings must support:

- import (external → internal)
- export (internal → external)
- reconciliation (detecting mismatches)

---

## Use This Skill When

- building UI-defined mappings
- transforming Google Sheets rows into internal DTOs
- mapping internal accounting records to QuickBooks payloads
- reconciling mismatched schemas across systems
- validating sync readiness before execution

---

## Required Architecture

### Storage

- Mapping definitions live in:
  - `IntegrationSettings.mappingProfiles`

- Mapping must include:
  - stable field identifiers (NOT display labels)
  - version number
  - provider (google / quickbooks)
  - direction (import / export)

### Execution

- Mapping execution happens ONLY in:
  - `server/src/services/*SyncService.ts`
  - or dedicated transformer utilities

- NEVER in:
  - controllers
  - React components

---

## Mapping Schema (REQUIRED)

```ts
{
  tenantId,
  provider: "google" | "quickbooks",
  profileName,
  version,

  direction: "import" | "export",

  mappings: [
    {
      sourceField: string,
      targetField: string,

      required: boolean,
      defaultValue?: any,

      transform?: {
        type: "string" | "number" | "date" | "boolean",
        format?: string,
        custom?: string
      }
    }
  ],

  createdAt,
  updatedAt
}
```

---

## Workflow

### 1. Define Mapping Schema

- enforce:
  - unique `targetField`
  - valid `sourceField`

- validate before persistence

---

### 2. Persist Mapping

- store in `IntegrationSettings`
- ensure version increment on change
- preserve previous versions for rollback/debug

---

### 3. Load Mapping at Runtime

- load mapping by:
  - tenantId
  - provider
  - profileName
  - latest version (or specified)

---

### 4. Execute Transformation

Transformer must:

- iterate over mapping definitions
- extract source value
- apply:
  - default values
  - type conversions
  - custom transforms

- produce normalized DTO

---

### 5. Validation Layer (MANDATORY)

Before returning mapped result:

- check required fields
- validate type correctness
- detect missing mappings

Output:

- valid records
- invalid records (with reasons)

---

### 6. Emit Diagnostics

All mapping executions MUST return:

```ts
{
  success: boolean,

  data: [...validRecords],

  errors: [
    {
      rowId,
      field,
      reason,
      retryable: boolean
    }
  ]
}
```

---

### 7. Use in Sync Pipeline

Mapping must be used in:

- Google Sheets import jobs
- QuickBooks export jobs
- manual sync triggers
- scheduled jobs

Never duplicate mapping logic.

---

## Determinism Rules (CRITICAL)

Mapping execution must be:

- stateless
- deterministic
- idempotent

Same input + same mapping version → same output

---

## Versioning Rules

- Every mapping change increments `version`

- Sync runs must record:
  - mapping version used

- Old mappings must remain accessible for:
  - debugging
  - replaying sync runs

---

## Bidirectional Mapping Support

### Import (Google Sheets → Internal)

- normalize raw rows
- enforce required fields
- reject invalid rows with diagnostics

### Export (Internal → QuickBooks)

- validate required provider fields
- ensure:
  - correct formats
  - valid enums

- prevent invalid payload creation

---

## Guardrails

- do NOT hardcode mappings anywhere
- do NOT drop invalid fields silently
- do NOT rely on UI labels as identifiers
- do NOT mix mapping with business logic
- do NOT assume all fields exist in source

---

## Anti-Patterns

- mapping logic inside controllers
- mapping logic inside React components
- using dynamic/untyped mapping structures
- not versioning mappings
- ignoring partial mapping failures

---

## File Placement

Suggested structure:

```
server/src/services/mapping/
  mappingLoader.ts
  mappingValidator.ts
  mappingTransformer.ts
```

---

## Example Tasks

- implement Google Sheets row transformer
- build QuickBooks payload mapper
- add mapping validation before sync execution
- create diagnostics for unmapped fields

---

## Deliverables

- mapping schema definition
- mapping persistence logic
- transformer implementation
- validation layer
- diagnostics output
- versioning support

---

## Test Requirements

Must include:

- valid mapping case
- missing required field
- invalid type conversion
- partial mapping failure
- version compatibility

---

## Final Rule

Mapping is the contract between systems.

If mapping is wrong:

- sync is wrong
- data is corrupted

Treat mapping logic as critical infrastructure, not helper code.
