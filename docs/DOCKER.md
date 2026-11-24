# Docker & Remote Streamable HTTP Deployment

Fluxer MCP ships with a multi-stage production [Dockerfile](../Dockerfile) and [docker-compose.yml](../docker-compose.yml).

## 1. Security Posture of the Container Image

- Runs as the non-root `node` user.
- Default `CMD` is `["catalog"]` (credential-free schema inspection) so pulling or scanning the image never touches Fluxer.
- No secrets are baked into image layers.
- Persistent state (signed blueprints, change snapshots, backups, raid-shield snapshots, durable workflows) is stored in `/data/state` (`MCP_STATE_DIR`).

## 2. Running Locally via Docker (Stdio)

```bash
docker build -t fluxer-mcp:latest .

docker run --rm -i \
  -e FLUXER_TOKEN="$FLUXER_TOKEN" \
  -e ALLOWED_GUILDS="999000999000999000" \
  fluxer-mcp:latest serve
```

## 3. Running as a Remote Streamable HTTP MCP Server

```bash
export FLUXER_TOKEN="YOUR_FLUXER_BOT_TOKEN"
export FLUXER_MCP_ACCESS_TOKEN="$(openssl rand -hex 32)"
export ALLOWED_GUILDS="999000999000999000"

docker compose up -d --build
```

The container exposes:
- `POST /mcp` — Stateless Streamable HTTP MCP endpoint (Bearer-authenticated via `FLUXER_MCP_ACCESS_TOKEN`)
- `GET /healthz` — Authenticated JSON health check

> **Production TLS**: Always terminate HTTPS in front of `/mcp` using Caddy, Nginx, Traefik, or a cloud load balancer when binding beyond `127.0.0.1`.

## 4. Testing the Container Without a Token

```bash
docker run --rm fluxer-mcp:latest catalog --check --json
```
