# Contributing to Fluxer MCP

Thank you for contributing to **Fluxer MCP**!

## Development Setup

Requirements: **Node.js 22.13+** and **pnpm 9.15+**.

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm catalog:check
```

## Contribution Rules

1. **Verify every Fluxer endpoint against the official OpenAPI specification** (`https://api.fluxer.app/v1/openapi.json`) or [`fluxerapp/fluxer`](https://github.com/fluxerapp/fluxer). Never invent endpoints or assume Discord API parity.
2. **Strict TypeScript**: Code must pass `pnpm typecheck` (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`).
3. **Formatting & Linting**: Run `pnpm format` and `pnpm lint` (Biome).
4. **Safety First**:
   - Destructive tools MUST declare `confirmRequired: true` and `annotations.destructiveHint: true`.
   - Never log tokens, authorization headers, or webhook secrets.
   - Never disable TLS verification.
5. **Tests Required**: Add unit tests and MSW integration tests in `packages/mcp-core` or `packages/mcp-server` for every new or modified tool.
6. **Keep Documentation Updated**: Update `PARITY.md` and regenerate `docs/TOOLS.md` whenever tools are added or changed.

## License

Contributions are licensed under the **Apache License 2.0** ([LICENSE](LICENSE)).
