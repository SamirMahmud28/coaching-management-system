# Khaatakolom CMS

A multi-tenant SaaS **Coaching Management System** for coaching institutes in Bangladesh, by Neo Nexor Limited.

Every institute gets its own subdomain: a public website, a staff office, an instructor portal and a student portal. A platform (Super Admin) panel manages institutes, their modules and their status.

## Features

- **Core** (always on):
  - institute settings and branding;
  - users and roles;
  - courses, subjects and batches with weekly schedules;
  - students and guardians, with configurable student IDs;
  - instructors;
  - audit log;
  - printable documents;
  - an admin dashboard.
- **Attendance & Leave:**
  - registers per class;
  - leave requests and approvals;
  - attendance reports.
- **Exams & Results:**
  - exams with split and optional papers;
  - mark entry;
  - grading scales, merit lists and published results with marksheets.
- **Routine & Lesson Plans:**
  - dated timetables;
  - cancellations, reschedules, substitutes and holidays;
  - lesson-plan progress.
- **Fees & Payments:**
  - fee items and monthly charge generation;
  - waivers and fines;
  - payment recording with receipts;
  - voids and refunds;
  - dues and collection reports.
- **Website:**
  - a themeable multi-page public site (English and Bangla);
  - a live-preview editor;
  - notices, gallery, faculty, achievers, testimonials and an enquiry inbox.
- **Platform:**
  - institute onboarding and lifecycle (active, suspended, deactivated);
  - module entitlements;
  - platform admins.

Tenant isolation is enforced on every query:
- the institute is taken from the host;
- tables use composite `(tenant_id, id)` foreign keys;
- every API handler and page goes through a single guard (session → tenant status → module → permission).

Financial records are immutable: corrections are voids or refunds, and payments are idempotent.

## Stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript (strict)
- **Database:** PostgreSQL 16 with Drizzle ORM
- **Auth:** Better Auth (separate instances for institute users and platform admins)
- **UI:** Tailwind CSS 4, shadcn/ui (Radix), lucide icons, Recharts, Motion
- **Tests:** Vitest (unit and integration, against a real PostgreSQL test database), Testing Library, Playwright (end-to-end)

## Requirements

- Node.js 24 LTS
- PostgreSQL 16
- Chrome or Edge in development (institute addresses use `*.localhost`, which these browsers resolve without a hosts-file change)

## Getting started

1. Install dependencies:
   ```bash
   npm install --legacy-peer-deps
   ```
2. Create two databases, one for development and one for tests (the test database name must end in `_test`):
   ```bash
   createdb cms
   createdb cms_test
   ```
3. Copy `.env.example` to `.env`, and again to `.env.test` with `DATABASE_URL` pointing at `cms_test`. Set two **different** auth secrets:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
4. Apply the migrations and seed the platform catalogue:
   ```bash
   npm run db:migrate
   npm run db:migrate:test
   npm run db:seed
   ```
5. Start the app:
   ```bash
   npm run dev
   ```
   - Super Admin: `http://admin.localhost:3000`
   - An institute: `http://<subdomain>.localhost:3000`

To try the product with realistic data, create a demo institute:
```bash
npm run demo:seed -- --subdomain=demo
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm run start` | Production build / server |
| `npm run lint` · `npm run typecheck` | ESLint · TypeScript |
| `npm test` | Unit and integration tests |
| `npm run test:e2e` | End-to-end tests (starts its own server on port 3100) |
| `npm run db:generate` · `db:migrate` · `db:studio` | Create a migration · apply migrations · browse data |
| `npm run demo:seed` | Create a demo institute with sample data |

`npm test` and `npm run test:e2e` both reset the test database, so don't run them at the same time.

## Project structure

```
src/
  app/          Routes: public site, institute app, platform, API (/api/v1, /api/platform)
  server/
    core/       Config, database, tenancy, RBAC, module registry, errors, test harness
    modules/    Business logic and API handlers, per module
  modules/      Feature UI (institute, platform, website)
  components/   Shared UI components
  lib/          Helpers (dates, money, formatting)
drizzle/        SQL migrations
e2e/            Playwright tests
scripts/        Demo seed and environment helpers
```
