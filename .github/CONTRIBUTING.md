# Contributing to RetailSync

Thank you for your interest in contributing to RetailSync.

This project follows a structured development workflow to maintain code quality, tenant safety, and security guarantees.

---

## Development Setup

### Prerequisites

- Node.js 20+
- pnpm 10+
- Docker Desktop (recommended for MongoDB)

### Installation

    make install

### Start Development

    make dev

Local services:

- Client: http://localhost:4630  
- Server: http://localhost:4000  
- Health: http://localhost:4000/health  

---

## Project Structure

    RetailSync/
      client/        # Vite + React + TypeScript + Redux Toolkit + MUI
      server/        # Express + TypeScript + MongoDB + Mongoose + Zod + JWT
      shared/        # Shared types and schemas
      docs/          # Architecture and system documentation

---

## Branching Strategy

Use clear branch names:

- feature/<feature-name>
- fix/<bug-name>
- refactor/<area>
- docs/<update>

Example:

    feature/google-oauth-login
    fix/inventory-ledger-balance

---

## Code Standards

- TypeScript strict mode is enforced.
- All inputs must be validated using Zod.
- Business logic must remain server-authoritative.
- Tenant isolation (`companyId`) must never be bypassed.
- Inventory updates must remain ledger-based (append-only).
- Keep pull requests focused and atomic.

---

## Quality Gate (Required Before PR)

Run the full quality check before submitting a pull request:

    make check

Or individually:

    make typecheck
    make lint
    make test
    make build

Pull requests that fail checks will not be merged.

---

## Testing Guidelines

- Unit tests: Vitest  
- DB integration tests: mongodb-memory-server  
- UI tests: React Testing Library  
- New features must include test coverage where applicable.  

---

## Commit Guidelines

Use clear, conventional-style commits:

    feat: add google oauth login
    fix: correct inventory ledger aggregation bug
    refactor: simplify auth middleware logic
    docs: update README integration section

Keep commits descriptive and concise.

---

## Security Requirements

- Do not commit secrets (.env files are ignored).
- JWT signing logic must not be altered without review.
- OAuth and email flows must preserve state validation.
- All protected endpoints must enforce authentication and RBAC.
- Inventory ledger integrity must never be compromised.

If you discover a security issue, please follow the instructions in SECURITY.md.

---

## Pull Request Process

1. Fork the repository  
2. Create a feature branch  
3. Implement changes with tests  
4. Run make check  
5. Submit a pull request with:
   - Clear description of changes  
   - Linked issue (if applicable)  
   - Screenshots (for UI changes)  

---

## Architectural Principles

RetailSync is built around:

- Strict tenant isolation  
- Role-based access control (RBAC)  
- Immutable inventory ledger tracking  
- Server-authoritative permission checks  
- Secure authentication flows (JWT + OTP + OAuth)  

All contributions should preserve these principles.

---

Thank you for helping improve RetailSync.
