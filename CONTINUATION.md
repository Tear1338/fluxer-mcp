# Fluxer MCP — Continuation Guide

This file records architectural decisions, invariants, and exact next steps so development can resume at any time without loss of context.

## Repository Layout

- `packages/mcp-core` (`@fluxer-mcp/core`): Native Fluxer MCP core library (config, Fluxer constants, Fluxer REST + discovery + resilience, Fluxer Gateway, permission evaluator, middleware pipeline, 173 typed tools, MCP server & progressive discovery).
- `packages/mcp-server` (`@fluxer-mcp/cli`): CLI (`fluxer-mcp` / `fluxer-mcp-server`), stdio & Streamable HTTP transports, client config snippet generators (Claude Code, Claude Desktop, Codex, Cursor, VS Code, Windsurf, Cline, Roo Code, Continue, Zed, OpenCode, Generic), profiles, `doctor`, `smoke`, `setup`, `catalog`.
- `packages/mcp-server-mocks` (`@fluxer-mcp/server-mocks`): MSW v2 mock handlers for Fluxer API v1 and `/.well-known/fluxer`.
- `docs/`: Comprehensive user, self-hosting, Docker, permissions, tool reference, examples, limitations, and troubleshooting documentation.

## Non-Negotiable Technical Invariants

1. **Zero Discord runtime dependencies**: No `discord.js`, no `@discordjs/rest`, no `discord-api-types`. All REST, routes, and types target Fluxer API v1 natively (`@fluxerjs/rest`, `@fluxerjs/types`, plus verified Fluxer constants from `fluxerapp/fluxer`).
2. **Zero invented endpoints**: Every REST call maps 1:1 to a verified path in Fluxer OpenAPI 3.1.0 (`https://api.fluxer.app/v1/openapi.json`).
3. **Cloud + Self-Hosted parity**: `FLUXER_API_URL` defaults to `https://api.fluxer.app`, supports any self-hosted base URL, queries `/.well-known/fluxer` for feature/limit/endpoint discovery, supports `FLUXER_CA_CERT_PATH` for private CAs, and **never disables TLS verification by default**.
4. **Safety by default**:
   - `MCP_WRITE_MODE=preview` blocks all mutating calls with a preview.
   - `MCP_DRY_RUN=true` (default) blocks destructive tools (`__confirm: true` + `MCP_DRY_RUN=false` required).
   - `ALLOWED_GUILDS` enforces strict guild allowlisting with channel-to-guild verification.
   - `FLUXER_EXPECTED_BOT_ID` locks the server to one bot identity.
   - Tokens and webhook secrets are redacted from all logs and audit events.
5. **Attribution**: Apache-2.0 license retained; `NOTICE` credits `cappyeo/discord-mcp` and all upstream contributors.

## Next Immediate Steps

1. Rebrand workspace manifests and install Fluxer dependencies (`@fluxerjs/rest`, `@fluxerjs/types`).
2. Build `@fluxer-mcp/core` runtime foundation (`config`, `fluxer/constants`, `fluxer/rest`, `fluxer/gateway`, `fluxer/permissions`, `errors`, `middleware`, `audit`, `tools/_lib`).
3. Implement all 173 tools across 17 categories + `server.ts` (full + progressive surfaces + resources + prompts).
4. Implement `@fluxer-mcp/cli` + `@fluxer-mcp/server-mocks` + full Vitest suite.
5. Finalize Docker, CI, complete docs, and run full verification gate.
