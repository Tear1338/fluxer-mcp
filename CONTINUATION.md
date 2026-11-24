# Fluxer MCP — Continuation Guide

Fluxer MCP `v1.0.0` is complete, built, linted, typechecked, and tested. Use this guide to maintain, extend, or release future versions without losing architectural context.

## Repository Architecture

- `packages/mcp-core` (`@fluxer-mcp/core`):
  - `src/fluxer/constants.ts`: Verified Fluxer API v1 constants, 41 permission bits, 13 channel types, 38 audit log actions, gateway opcodes, and `FluxerRoutes`.
  - `src/fluxer/rest.ts`: Native Fluxer HTTP client supporting Cloud & self-hosted `FLUXER_API_URL`, `/.well-known/fluxer` discovery caching, strict TLS (`FLUXER_CA_CERT_PATH`), `X-Audit-Log-Reason`, `@fluxerjs/rest` error types, and Cockatiel resilience.
  - `src/fluxer/gateway.ts`: Native Fluxer WebSocket Gateway client (no Discord intents required).
  - `src/fluxer/permissions.ts`: Exact Fluxer effective permission evaluator & trace engine.
  - `src/middleware.ts`: Category allowlist, strict Zod validation, default guild, `ALLOWED_GUILDS` (with channel-to-guild verification), `MCP_WRITE_MODE=preview`, `MCP_DM_CONSENT_MODE=require`, `MCP_DRY_RUN` + `__confirm: true`, and redacted audit sink.
  - `src/state.ts`: SHA-256 + HMAC-signed local state storage for blueprints, change plans, backups, raid-shield snapshots, and durable workflows.
  - `src/tools/`: 184 typed tools across 20 categories + `src/server.ts` (full & progressive surfaces, resources incl. `fluxer://instance/gateway`, prompts, credential-free catalog server).
- `packages/mcp-server` (`@fluxer-mcp/cli`):
  - `src/cli.ts`: `fluxer-mcp` CLI (`serve`, `catalog`, `doctor`, `smoke`, `setup`, `init`, `profile`).
  - `src/transports/stdio.ts` & `src/transports/http.ts`: Stdio and Bearer-authenticated Streamable HTTP transports.
  - `src/lib/client-snippets.ts` & `src/lib/profiles.ts`: 12 AI client generators + non-secret profile management.
- `packages/mcp-server-mocks` (`@fluxer-mcp/server-mocks`): MSW v2 Fluxer API v1 handlers.

## Verification Checklist Before Any Release

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm catalog:check
```

## Future Enhancement Ideas (When Fluxer API Adds Them)

- Server-side AutoMod rules (if Fluxer introduces `/guilds/{id}/auto-moderation/rules`)
- Native Guild Scheduled Events & Polls (when added to Fluxer OpenAPI)
- Optional OpenTelemetry OTLP exporter integration
