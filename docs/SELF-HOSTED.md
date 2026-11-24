# Self-Hosted Fluxer & TLS Configuration Guide

Fluxer MCP is engineered from the ground up to work seamlessly with **both Fluxer Cloud** (`https://api.fluxer.app`) and **self-hosted Fluxer deployments**.

## 1. Pointing to a Self-Hosted Instance

Set `FLUXER_API_URL` (or pass `--api-url` to `serve`, `doctor`, `setup`, or `init`):

```bash
export FLUXER_TOKEN="YOUR_SELF_HOSTED_BOT_TOKEN"
export FLUXER_API_URL="https://chat.mycompany.example/api"
# Optional: override webapp URL if not returned by /.well-known/fluxer
export FLUXER_WEBAPP_URL="https://chat.mycompany.example"

fluxer-mcp doctor --online
```

You can also store the self-hosted URL in a non-secret profile:

```bash
fluxer-mcp setup \
  --profile corp-fluxer \
  --api-url https://chat.mycompany.example/api \
  --ca-cert-path /etc/ssl/certs/corp-root-ca.pem \
  --client claude-code
```

## 2. Automatic Instance Capability Discovery (`/.well-known/fluxer`)

Fluxer MCP queries `GET /.well-known/fluxer` (unversioned, unauthenticated) to inspect:

- `api_code_version` — API protocol version exposed by the instance
- `endpoints` — `api_public`, `gateway`, `media`, `webapp`, `invite`
- `features` — `self_hosted`, `voice_enabled`, `discovery_enabled`, `presigned_attachment_uploads`, etc.
- `limits` — `max_message_length`, `max_guild_emojis`, `max_guild_stickers`, etc.
- `community` — `single_community`, `direct_messages_disabled`, `guild_create_access`
- `sso` — SSO provider configuration

Call the `instance_get_discovery` MCP tool at any time (or read the `fluxer://instance/discovery` MCP Resource) so your AI automatically adapts to the self-hosted instance's exact capabilities and limits.

## 3. HTTPS & Private CA Certificates (Security First)

**Fluxer MCP NEVER disables TLS certificate verification (`rejectUnauthorized` is always `true`).**

If your self-hosted Fluxer server uses a certificate signed by an internal enterprise or home-lab CA:

1. Provide the PEM root/intermediate CA bundle via `FLUXER_CA_CERT_PATH`:
   ```bash
   export FLUXER_CA_CERT_PATH="/etc/ssl/certs/internal-ca.pem"
   ```
   *(Or use Node's standard `NODE_EXTRA_CA_CERTS=/path/to/ca.pem`.)*
2. Verify connectivity with `fluxer-mcp doctor --online`.
3. In Docker, mount the CA bundle read-only:
   ```yaml
   environment:
     FLUXER_API_URL: https://chat.internal.local/api
     FLUXER_CA_CERT_PATH: /certs/internal-ca.pem
   volumes:
     - ./certs/internal-ca.pem:/certs/internal-ca.pem:ro
   ```

## 4. Handling API Version Differences

- Set `FLUXER_API_VERSION` (defaults to `1`) if a future self-hosted release exposes a new major path prefix.
- If a self-hosted instance disables Guild Discovery (`features.discovery_enabled: false`) or limits certain endpoints, Fluxer MCP surfaces Fluxer's exact structured error code (`DISCOVERY_DISABLED`, etc.) with a clear recovery hint without crashing.
