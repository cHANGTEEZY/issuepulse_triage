<h1 align="center">Hono API Boilerplate</h1>

<p align="center">
  A production-ready REST API starter built with <strong>Bun</strong> and <strong>Hono</strong>, featuring <strong>Better Auth</strong>, <strong>Turso</strong> via <strong>Drizzle ORM</strong>, and <strong>Arcjet</strong> security.
</p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT" /></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/Bun-000000?style=flat-square&logo=bun&logoColor=white" alt="Bun" /></a>
  <a href="https://hono.dev"><img src="https://img.shields.io/badge/Hono-E36002?style=flat-square&logo=hono&logoColor=white" alt="Hono" /></a>
  <a href="https://turso.tech"><img src="https://img.shields.io/badge/Turso-4FF8D2?style=flat-square&logo=turso&logoColor=black" alt="Turso" /></a>
  <a href="https://www.better-auth.com"><img src="https://img.shields.io/badge/Better%20Auth-000000?style=flat-square" alt="Better Auth" /></a>
  <a href="https://arcjet.com"><img src="https://img.shields.io/badge/Arcjet-000000?style=flat-square" alt="Arcjet" /></a>
</p>

---

## Overview

This API is the IssueNest backend: Better Auth GitHub sign-in, a GitHub App for repository access, verified webhooks, and a Turso store for issues plus local triage. The TanStack Start app talks to it with a session cookie.

### Features

- **Fast runtime** — [Bun](https://bun.sh) for dev, build, test, and production
- **Lightweight framework** — [Hono](https://hono.dev) with middleware, CORS, and secure headers
- **Authentication** — [Better Auth](https://www.better-auth.com) GitHub OAuth and session cookies
- **GitHub App** — installation tokens, signed webhooks, and issue sync
- **Database** — [Turso](https://turso.tech) (libSQL) + [Drizzle ORM](https://orm.drizzle.team) with migration workflow
- **Security** — [Arcjet](https://arcjet.com) shield, rate limiting, and signup abuse protection
- **API docs** — Scalar API reference at `/docs`
- **Observability** — Request IDs, structured Pino logging, graceful shutdown
- **Docker** — Multi-stage Dockerfile with health checks

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Runtime | [Bun](https://bun.sh) |
| HTTP framework | [Hono](https://hono.dev) |
| Auth | [Better Auth](https://www.better-auth.com) + `@better-auth/drizzle-adapter` |
| Database | [Turso](https://turso.tech) (libSQL) |
| ORM | [Drizzle ORM](https://orm.drizzle.team) + Drizzle Kit |
| Security | [Arcjet](https://arcjet.com) (`@arcjet/bun`) |
| Validation | [Zod](https://zod.dev) |
| Logging | [Pino](https://getpino.io) |
| API docs | [Scalar](https://scalar.com) |

---

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.3
- A [Turso](https://turso.tech) database, or a local libSQL file (`file:local.db`)
- An [Arcjet](https://app.arcjet.com) API key (optional in development — fails open without a valid key)

---

## Getting Started

### 1. Clone and install

```bash
git clone <your-repo-url>
cd hono-api-boiler-plate
bun install
```

### 2. Configure environment

Copy the example env file and fill in your values:

```bash
cp .env.example .env.local
```

Generate a Better Auth secret:

```bash
openssl rand -base64 32
```

### 3. Set up the database

Point `TURSO_DATABASE_URL` at a local libSQL file or a remote Turso database, then run migrations:

```bash
bun run db:migrate
```

### 4. Start the dev server

```bash
bun run dev
```

The API listens at **http://localhost:3000** by default.

| Endpoint | Description |
| --- | --- |
| `GET /health` | Health check |
| `GET /api/v1/users/me` | Current user profile (auth required) |
| `GET /api/v1/users` | Users that can own a triage item |
| `GET /api/v1/issues` | Triage feed |
| `POST /api/webhooks/github` | GitHub App webhook |
| `GET/POST /api/auth/*` | Better Auth handlers |
| `GET /docs` | Scalar API reference |

---

## Environment Variables

All variables are validated at startup via Zod in `src/config/env.ts`. Bun loads `.env.local` automatically.

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | No | Server port (default: `3000`) |
| `HOST` | No | Bind address (default: `0.0.0.0`) |
| `NODE_ENV` | No | `development` \| `production` \| `test` |
| `LOG_LEVEL` | No | Pino log level (default: `info`) |
| `CORS_ORIGIN` | No | Allowed origin(s) or `*` |
| `FRONTEND_ORIGIN` | **Yes** | SPA origin for auth callbacks |
| `TURSO_DATABASE_URL` | **Yes** | libSQL URL (`file:local.db` or `libsql://…`) |
| `TURSO_AUTH_TOKEN` | Remote only | Turso auth token. Omit for `file:` URLs |
| `BETTER_AUTH_URL` | No | Auth base URL (default: `http://localhost:3000`) |
| `BETTER_AUTH_SECRET` | **Yes** | Min 32 chars — encryption & hashing |
| `ARCJET_KEY` | **Yes** | Arcjet site key from [app.arcjet.com](https://app.arcjet.com) |
| `ARCJET_ENV` | No | `development` \| `production` (default: `development`) |
| `GITHUB_CLIENT_ID` | **Yes** | GitHub OAuth app client id for Better Auth |
| `GITHUB_CLIENT_SECRET` | **Yes** | GitHub OAuth app client secret |
| `GITHUB_APP_ID` | Sync and webhooks | GitHub App id |
| `GITHUB_APP_SLUG` | Install URL | App slug in `https://github.com/apps/<slug>` |
| `GITHUB_PRIVATE_KEY` | Sync | App private key. Server only |
| `GITHUB_WEBHOOK_SECRET` | Webhooks | HMAC secret for `X-Hub-Signature-256`. Server only |

See [`.env.example`](.env.example) for a full template.

---

## Authentication (Better Auth)

Auth is configured in [`src/modules/auth/auth.service.ts`](src/modules/auth/auth.service.ts) with the Drizzle adapter. Email and password are disabled. Users sign in with GitHub OAuth (`GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`). The callback is `http://localhost:3000/api/auth/callback/github`.

The session cookie is `better-auth.session_token`. The TanStack app on `http://localhost:5173` sends it with `credentials: include`.

```bash
curl http://localhost:3000/api/auth/get-session \
  -H "Cookie: better-auth.session_token=<token>"
```

### Protecting routes

Use the `requireAuth()` middleware on routes that need a logged-in user:

```typescript
import { requireAuth } from "./middleware/require-auth";

router.get("/me", requireAuth(), (c) => {
  return c.json({ user: c.get("user") });
});
```

Session context (`user`, `session`) is populated globally in [`src/app.ts`](src/app.ts).

### Regenerating auth schema

After changing Better Auth plugins or config:

```bash
bun run auth:generate   # Better Auth → Drizzle schema
bun run db:generate     # Drizzle Kit → SQL migration
bun run db:migrate      # Apply migration
```

---

## Database (Turso + Drizzle)

Schemas live under [`src/db/schema/`](src/db/schema/). The barrel file [`src/db/schema/index.ts`](src/db/schema/index.ts) is the single entry point for Drizzle Kit.

```
src/db/
├── index.ts              # Drizzle client + libSQL
└── schema/
    ├── index.ts          # Re-exports all tables
    ├── auth.ts           # Better Auth tables (generated)
    └── github.ts         # Installations, issues, labels, triage
```

GitHub rows and triage rows are separate. Webhook and sync upserts write `github_issues` and `issue_labels`, and insert a blank `triage` row only when one does not exist. Status, priority, owner, and notes are never replaced by GitHub.

### Commands

| Script | Description |
| --- | --- |
| `bun run auth:generate` | Generate Better Auth Drizzle schema |
| `bun run db:generate` | Generate SQL migrations |
| `bun run db:migrate` | Apply pending migrations |
| `bun run db:push` | Push schema directly (dev only) |
| `bun run db:studio` | Open Drizzle Studio |

---

## GitHub App

Create a GitHub App and set `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_PRIVATE_KEY`, and `GITHUB_WEBHOOK_SECRET` in `.env.local`. The private key and webhook secret never go to the frontend.

### Permissions

| Permission | Access |
| --- | --- |
| Issues | Read |
| Metadata | Read |

Subscribe to these installation webhooks:

- `issues`
- `issue_comment`
- `installation`
- `installation_repositories`

`POST /api/webhooks/github` is mounted outside auth and Arcjet. It reads the raw body, checks `X-Hub-Signature-256` with `crypto.timingSafeEqual`, then parses JSON. A repeated `X-GitHub-Delivery` id returns 200 without writing again. Handled events:

- `issues`: opened, edited, closed, reopened, labeled, unlabeled. A `pull_request` object is stored as `is_pull_request`.
- `issue_comment`: updates the issue activity time only.
- `installation` and `installation_repositories`: created, added, and removed. A newly installed repository starts a detached sync.

`GET /api/v1/repositories/install-url` returns `https://github.com/apps/<slug>/installations/new`. Authenticated `POST /api/v1/repositories/:id/sync` pages `GET /repos/{owner}/{repo}/issues?state=all&per_page=100`, follows `Link` headers, and backs off on `x-ratelimit-remaining` / `retry-after`.

### Local webhook forwarding

GitHub cannot reach `localhost` directly. Forward a public URL to the API:

```bash
# Cloudflare Tunnel
cloudflared tunnel --url http://localhost:3000

# or ngrok
ngrok http 3000
```

Set the App webhook URL to `https://<public-host>/api/webhooks/github` and use the same `GITHUB_WEBHOOK_SECRET` locally and in the App settings.

## Security (Arcjet)

Arcjet is configured in [`src/shared/utils/arcjet.ts`](src/shared/utils/arcjet.ts) and applied per route handler (not global middleware), following Arcjet best practices.

| Client | Rules | Applied to |
| --- | --- | --- |
| `aj` | Shield (WAF) | Health check |
| `ajApi` | Shield + sliding window (100/min) | `/api/v1/*` |
| `ajAuth` | Shield + sliding window (30/min) | `/api/auth/*` |
| `ajAuthSignup` | Bot block, email validation, rate limit | Sign-up POST |

The Bun server wraps `app.fetch` with `aj.handler()` for accurate client IP detection. Denied requests return structured JSON errors via [`src/shared/utils/arcjet-deny.ts`](src/shared/utils/arcjet-deny.ts).

### Get an Arcjet key

```bash
npx @arcjet/cli auth login
npx @arcjet/cli sites get-key --site-id <site_id> --output json --fields key
```

Set the key in `.env.local` as `ARCJET_KEY=ajkey_...`.

---

## Project Structure

```
├── drizzle/                 # SQL migrations
├── scripts/
│   └── migrate.ts           # Migration runner
├── src/
│   ├── app.ts               # Hono app, middleware, route mounting
│   ├── server.ts            # Bun.serve entry point
│   ├── config/
│   │   └── env.ts           # Zod env validation
│   ├── docs/
│   │   └── openapi.ts       # OpenAPI spec registration
│   ├── db/
│   │   ├── index.ts         # Drizzle + libSQL client
│   │   └── schema/          # Drizzle schemas
│   ├── middleware/          # Session, auth, request ID, logging
│   ├── shared/
│   │   ├── utils/           # Logger, Arcjet, CORS helpers
│   │   ├── types/           # App context types
│   │   └── errors/          # HTTP error builders
│   └── modules/
│       ├── auth/            # Better Auth module
│       ├── health/          # Health check module
│       ├── users/           # Users module
│       ├── github/          # App tokens, webhooks, sync, triage
│       └── v1.routes.ts     # API v1 route aggregator
├── test/                    # Bun test suite
├── .env.example
├── drizzle.config.ts
├── Dockerfile
└── package.json
```

---

## Scripts

| Command | Description |
| --- | --- |
| `bun run dev` | Start dev server with hot reload |
| `bun run serve` | Start server (no watch) |
| `bun run build` | Build for production |
| `bun run start` | Run production build |
| `bun run test` | Run test suite |
| `bun run typecheck` | TypeScript check |

---

## Docker

Build and run with Docker:

```bash
docker build -t hono-api .
docker run -p 3000:3000 --env-file .env.local hono-api
```

The image uses a multi-stage build on `oven/bun`, runs as the non-root `bun` user, and includes a `/health` check.

---

## Development

### CORS & cookies

CORS is configured for SPA frontends with credentials support. Auth responses merge CORS headers via `mergeCorsIntoAuthResponse()` so browsers accept `Set-Cookie` on cross-origin requests.

Set `CORS_ORIGIN` and `FRONTEND_ORIGIN` to your frontend URL (e.g. `http://localhost:5173` for Vite).

### Adding routes

1. Create a module under `src/modules/<name>/` (routes, controller, service, docs)
2. Register routes in [`src/modules/v1.routes.ts`](src/modules/v1.routes.ts) or [`src/app.ts`](src/app.ts)
3. Call `ajApi.protect()` (or another Arcjet client) in the controller
4. Use `requireAuth()` for protected endpoints

---

## License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

```
MIT License

Copyright (c) 2026

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
