# syntax=docker/dockerfile:1

# Production multi-stage image for Fluxer MCP.
# Defaults to credential-free `catalog` mode for safe registry inspection.
# For live operation, override CMD with `serve` (stdio) or `serve --http --host 0.0.0.0 --port 3000`
# and provide FLUXER_TOKEN (and FLUXER_API_URL for self-hosted instances).
FROM node:22-bookworm-slim AS build

WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json ./
COPY packages/mcp-core/package.json packages/mcp-core/package.json
COPY packages/mcp-server/package.json packages/mcp-server/package.json
COPY packages/mcp-server-mocks/package.json packages/mcp-server-mocks/package.json

RUN pnpm install --frozen-lockfile --filter @fluxer-mcp/cli...

COPY LICENSE NOTICE README.md ./
COPY packages/mcp-core packages/mcp-core
COPY packages/mcp-server packages/mcp-server

RUN pnpm --filter @fluxer-mcp/core build \
 && pnpm --filter @fluxer-mcp/cli build \
 && pnpm deploy --filter @fluxer-mcp/cli --prod /runtime

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV MCP_STATE_DIR=/data/state
WORKDIR /app

LABEL org.opencontainers.image.title="Fluxer MCP" \
      org.opencontainers.image.description="Native Model Context Protocol server for Fluxer Cloud and self-hosted communities." \
      org.opencontainers.image.source="https://github.com/Tear1338/fluxer-mcp" \
      org.opencontainers.image.licenses="Apache-2.0"

RUN mkdir -p /data/state && chown -R node:node /data

COPY --from=build --chown=node:node /runtime/ ./
COPY --from=build --chown=node:node /workspace/LICENSE /licenses/fluxer-mcp/LICENSE
COPY --from=build --chown=node:node /workspace/NOTICE /licenses/fluxer-mcp/NOTICE

USER node

EXPOSE 3000

ENTRYPOINT ["node", "dist/cli.js"]
CMD ["catalog"]
