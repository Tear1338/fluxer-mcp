# Fluxer MCP — Development Progress

This file tracks the real, verified state of development for **Fluxer MCP**. Features are only marked complete after code implementation, typecheck, lint, build, and automated test verification pass.

## Current Status: Phase 1 Complete → Starting Phase 2

| Phase | Scope | Status | Verification |
| --- | --- | --- | --- |
| **Phase 1: Deep Analysis & Parity Matrix** | Cloned upstream `cappyeo/discord-mcp` (v0.34.1, 222 tools); fetched live Fluxer OpenAPI 3.1.0 (`363 paths / 445 operations`), live `/.well-known/fluxer`, `fluxerapp/fluxer` constants (`Permissions`, `ChannelTypes`, `GuildConstants`, `AuditLogActionType`, `GatewayConstants`, `ApiErrorCodes`, `ThreadPermissionUtils`), and `@fluxerjs/*` SDKs; authored `PARITY.md`. | **DONE** | Verified against live Fluxer OpenAPI 3.1.0 & GitHub source |
| **Phase 2: Monorepo Rebrand & Native Fluxer Runtime** | Rebrand workspace packages (`@fluxer-mcp/core`, `@fluxer-mcp/cli`, `@fluxer-mcp/server-mocks`); implement native Fluxer constants, `FluxerRestClient` (Cloud + self-hosted + custom CA TLS + discovery + Cockatiel resilience), native Fluxer Gateway client, permission evaluator, error formatter, and full middleware pipeline. | **IN PROGRESS** | Pending build & tests |
| **Phase 3: Complete Ported + Fluxer-Native Tool Suite** | Implement all 173 verified tools across 17 categories (120 ported/adapted from Discord MCP + 53 Fluxer-native & advanced community architecture, security audit, backup/diff/clone, anti-raid, hierarchy analysis, discovery, forum tag, search, and webhook integration tools). | **PLANNED** | Pending unit & integration tests |
| **Phase 4: CLI, Transports, Mocks & Full Test Suite** | Implement `fluxer-mcp` CLI (`serve` stdio + Streamable HTTP, `catalog`, `setup`, `doctor`, `smoke`, `init`, `profile`), MSW Fluxer API v1 mocks, and full unit/integration/e2e test suite. | **PLANNED** | Pending `pnpm test` |
| **Phase 5: Docker, CI/CD, Docs & Release Readiness** | Production `Dockerfile` + `docker-compose.yml`, GitHub Actions CI/release workflows, complete documentation (`README.md`, `docs/*`, `CONTRIBUTING.md`, `SECURITY.md`, `NOTICE`), full verification (`typecheck`, `lint`, `build`, `test`, `catalog --check`). | **PLANNED** | Pending full QA |

## Blocked / External Requirements

- **Live Fluxer Bot Token Testing**: No live Fluxer bot token or test guild is present in this environment. All API contracts are verified against Fluxer's live OpenAPI 3.1.0 specification and tested end-to-end against MSW HTTP mocks matching the exact OpenAPI schemas. Users can run `fluxer-mcp doctor --online` and `fluxer-mcp smoke` with their own bot token to verify live connectivity against Fluxer Cloud or any self-hosted instance.
