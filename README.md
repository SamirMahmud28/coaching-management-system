# Khaatakolom CMS (working name)

Multi-tenant SaaS Coaching Management System for coaching institutes in Bangladesh, by Neo Nexor Limited.

> **Developers and Claude sessions:** start with [docs/00-PROJECT-STATUS.md](docs/00-PROJECT-STATUS.md) and [CLAUDE.md](CLAUDE.md).

## Stack

The CMS uses the same stack as the Neo Nexor EMS:

- **Framework:** Next.js 16 (App Router), React 19, TypeScript (strict)
- **Database:** PostgreSQL 16 with Drizzle ORM
- **Auth:** Better Auth (two instances: institute users and platform admins)
- **UI:** Tailwind CSS 4 and shadcn/ui
- **Tests:** Vitest (unit and integration, against a real Postgres test database) and Playwright (end-to-end)

Details: [docs/04-ARCHITECTURE.md](docs/04-ARCHITECTURE.md).

## Requirements

- Node.js 24 LTS
- PostgreSQL 16
- Chrome or Edge (institute addresses use `*.localhost`, which these browsers resolve without a hosts-file change)

## Getting started

1. Install dependencies:
   ```bash
   npm install --legacy-peer-deps
   ```
2. Create the databases once (the exact commands are added in milestone M1):
   - `cms` for development;
   - `cms_test` for tests.
3. Copy `.env.example` to `.env`, and again to `.env.test` with `DATABASE_URL` pointing at `cms_test`. Set two **different** secrets:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
4. Start the app:
   ```bash
   npm run dev
   ```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm run start` | Production build / server |
| `npm run lint` · `npm run typecheck` | ESLint · TypeScript |
| `npm test` | Unit and integration tests |
| `npm run test:e2e` | End-to-end tests (own dev server on port 3100) |
| `npm run db:generate` · `db:migrate` · `db:studio` | Drizzle: create a migration · apply migrations · browse data |

`npm test` and `npm run test:e2e` both reset the test database, so don't run them at the same time.

## Project structure

```
src/
  app/          Routes
  server/
    core/       Config, database, tenancy, RBAC, module registry, errors, testing harness
    modules/    Business logic and API handlers per module
  modules/      Feature UI
  components/   Shared UI
  lib/          Helpers
drizzle/        SQL migrations
e2e/            Playwright tests
docs/           Project status, decisions, specifications, plans (the source of truth; committed)
```
