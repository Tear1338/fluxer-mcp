# AGENTS.md — Fluxer MCP

This repository contains **Fluxer MCP**, a native Model Context Protocol (MCP) server for Fluxer Cloud and self-hosted instances.

## Packages

- `packages/mcp-core` (`@fluxer-mcp/core`): Native Fluxer API v1 client, discovery, Gateway, permissions, safety middleware, 172 typed MCP tools, blueprints, security audit, backup/diff/clone, and MCP server builder.
- `packages/mcp-server` (`@fluxer-mcp/cli`): `fluxer-mcp` CLI (`serve`, `catalog`, `setup`, `doctor`, `smoke`, `init`, `profile`), stdio & Streamable HTTP transports, and AI client snippet generators.
- `packages/mcp-server-mocks` (`@fluxer-mcp/server-mocks`): MSW v2 HTTP mocks matching Fluxer OpenAPI 3.1.0.

## Commands

```bash
pnpm install        # Install workspace dependencies
pnpm build          # Build @fluxer-mcp/core and @fluxer-mcp/cli
pnpm typecheck      # Strict TypeScript check across all packages
pnpm lint           # Biome lint & format check
pnpm test           # Run Vitest unit, integration, and e2e test suites
pnpm catalog:check  # Validate credential-free tool catalog contract
```

## Engineering Rules

- Never invent Fluxer endpoints — verify every route against Fluxer OpenAPI 3.1.0 and `@fluxerjs/types`.
- Never disable TLS certificate verification by default.
- Never log `FLUXER_TOKEN`, `FLUXER_MCP_ACCESS_TOKEN`, or webhook tokens.
- Keep `PROGRESS.md`, `PARITY.md`, and `CONTINUATION.md` synchronized with real verified state.
