# Ranikuthi Project Summary

## Product Direction

Ranikuthi is a housing-society management system. The full specification defines five areas:

1. Gateway and identity
2. Members and flat directory
3. Billing and financial log
4. Accounting book
5. Service directory and complaints

The specification contains 41 locked business rules covering mobile-only login, lockout, session expiry, data-driven RBAC, billing, receipt allocation, Member Credit, immutable financial documents, audit trails, ownership transfer, backups, and notifications.

## Current Repository

The repository is transitioning from the original Python/SQL prototype to a Node.js/Supabase backend.

Current backend files are under `backend/src` and include:

- Express entry point and health endpoint
- Supabase database client
- Login, logout, session validation, OTP, password recovery, and admin recovery
- Flat create, list, update, and resident-owned-flat access
- Admin bootstrap and break-glass recovery scripts
- Email OTP service

The live backend runs on port `3000` with `node src/index.js` from `backend`.

## Implemented Today

- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- OTP request and reset routes
- Admin reset routes
- `POST /members/flats`
- `GET /members/flats`
- `GET /members/flats/me`
- `PATCH /members/flats/:id`
- Password hashing with Node `scrypt`
- Session inactivity and absolute timeout logic
- Failed-login lockout logic
- Flat creation audit entries

The test flat `GA-3D` exists in the connected Supabase database according to the project log.

## Important Gaps

- No committed Supabase migrations or reproducible database schema
- Billing, receipts, Member Credit, vendors, expenses, accounting, complaints, notices, backups, and frontend are not implemented
- No automated backend tests; `npm test` is still a placeholder
- No `start` script in `backend/package.json`
- RBAC is currently enforced through hardcoded route roles rather than a database permission matrix
- `force_password_reset` is exposed in login responses, but there is no completed password-change endpoint
- Ownership transfer and occupancy workflows are not implemented in the Node backend
- Financial operations need transactional/idempotent database constraints before implementation
- The original Python/schema/test files are deleted in the current worktree and the Node implementation is mostly untracked; this migration needs a deliberate baseline and commit strategy
- `schema.txt` is the plain-text project specification/history. It was originally treated as `schema.docx`, but it is not a valid binary DOCX file.

## Recommended Direction

Continue with the Node.js/Supabase rebuild and treat the specification as the business source of truth. Do not mix the old Apps Script/Google Sheets implementation with the new backend unless an explicit synchronization boundary is designed.

## Recommended Next Sequence

1. Confirm Node/Supabase as the target architecture.
2. Recover or formally recreate the complete database schema as versioned Supabase migrations.
3. Define the current API contract and acceptance tests for identity and members.
4. Replace hardcoded role checks with data-driven permissions.
5. Complete password-change and forced-reset flows.
6. Add automated tests and a real start/test workflow.
7. Implement billing and receipt rules before accounting integration.
8. Add accounting through a controlled pending-transaction queue.
9. Implement complaints, notifications, frontend, backups, and full-system backtesting.

## New-Chat Handoff

Start the next conversation with:

> Continue Ranikuthi from `docs/project-summary.md`. We are using the Node.js/Supabase architecture. Do not code until the target architecture and database schema plan are confirmed.
