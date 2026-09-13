# Ranikuthi Agent Guide

## Project Shape

- This repository is the Node.js/Supabase rebuild of Ranikuthi, a housing-society management system.
- Backend code lives in `backend/src` and uses CommonJS, Express, and direct Supabase access.
- The entry point is `backend/src/index.js`; routes are mounted at `/auth` and `/members`.
- Authentication owns login, logout, sessions, OTP, password reset, and admin recovery in `backend/src/modules/auth`.
- Members owns flat and occupancy workflows in `backend/src/modules/members`.
- Standalone operational scripts live in `backend/src/scripts`.

Read [docs/project-summary.md](docs/project-summary.md) for project status and [schema.txt](schema.txt) for business rules. Treat `schema.txt` as the specification/history, not as an executable or current migration. The summary may lag the implementation; verify behavior in source and the database contract before relying on it.

## Commands

Run commands from `backend`:

```sh
npm ci
node src/index.js
curl http://localhost:3000/health
npx nodemon src/index.js
npm test
node src/scripts/seedAdmin.js <mobile> <password> ["Full Name"]
node src/scripts/breakGlassRecovery.js <admin_mobile> <new_password> <justification>
```

`npm test` is currently an intentional placeholder that exits with an error; there are no automated tests yet. There is no committed `start` or `dev` script.

## Implementation Conventions

- Keep HTTP parsing, status codes, and response shaping in route files; put database and business logic in the corresponding service.
- Use the shared client from `backend/src/db.js`; do not create additional Supabase clients in modules.
- Supabase tables and columns use lowercase `snake_case`.
- Authenticated routes use `requireAuth`; role-restricted routes use `requireRole` from `auth.middleware.js`.
- Resident endpoints must scope reads to `req.user` and must not trust a client-supplied flat identifier for self-service data.
- Service operations should return the existing `{ ok, status, message, ... }` result shape so routes can map failures consistently.
- Record important mutations in `system_audit_trail`, following the nearby service implementations.
- Preserve CommonJS style and avoid unrelated refactors.

## Security And Data

- `SUPABASE_SERVICE_ROLE_KEY` is server-only. Never print, commit, or expose `.env` values.
- The backend is the access-control layer; the current design assumes Supabase RLS is off.
- Passwords use Node `crypto.scryptSync`; session tokens are bearer tokens stored on the user record.
- Login is mobile-number-only. Sessions have inactivity and absolute expiry, and a new login invalidates the previous token.
- Verify authorization at the route boundary and validate all user-controlled input before database writes.
- The database must already exist with the expected tables. No reproducible Supabase migrations are committed, so schema changes require explicit coordination.
- Multi-step workflows may not be transactional today, especially ownership transfer and password reset; consider failure and compensation behavior before extending them.

## Change And Validation Rules

- Start from the owning route/service and inspect neighboring tests or call sites before editing.
- Keep changes narrow and update documentation when behavior or commands change.
- After edits, run the narrowest available check. At minimum, start the backend and verify `GET /health`; for API changes, exercise the affected route with a configured local database.
- Do not treat the placeholder `npm test` failure as evidence of a code regression.
- Do not commit credentials, generated secrets, or ad hoc database schema files.

## Key References

- [backend/src/index.js](backend/src/index.js): server startup and route registration
- [backend/src/db.js](backend/src/db.js): shared Supabase client
- [backend/src/modules/auth/auth.routes.js](backend/src/modules/auth/auth.routes.js): auth API surface
- [backend/src/modules/auth/auth.service.js](backend/src/modules/auth/auth.service.js): password, lockout, and session behavior
- [backend/src/modules/auth/auth.middleware.js](backend/src/modules/auth/auth.middleware.js): bearer authentication and role checks
- [backend/src/modules/members/members.routes.js](backend/src/modules/members/members.routes.js): members API surface
- [backend/src/modules/members/members.service.js](backend/src/modules/members/members.service.js): flat CRUD and resident scoping