# Fluxer MCP — Troubleshooting Guide

## `FLUXER_AUTH_INVALID` (HTTP 401)
- Verify `FLUXER_TOKEN` is exported in the environment used by your AI client.
- If running against a self-hosted instance, confirm `FLUXER_API_URL` points to the right instance (a Cloud token will be rejected by a self-hosted server and vice versa).
- Run `fluxer-mcp doctor --online` to validate token & discovery live.

## `BOTS_CANNOT_CREATE_GUILDS` (HTTP 403)
- Fluxer intentionally forbids bot accounts from creating guilds (`POST /guilds` requires a user session).
- **Fix**: Create an empty community in the Fluxer app with your user account, invite your bot, then use `guild_blueprint_plan` + `guild_blueprint_apply` to build the full server structure.

## `DRY_RUN_PREVIEW` on Destructive Tools
- By default, `MCP_DRY_RUN=true` prevents destructive operations (`members_ban`, `members_kick`, `channels_delete`, `roles_delete`, `messages_delete`, `guild_delete`, `guild_blueprint_apply`, etc.) from mutating Fluxer.
- **Fix**: Review the preview output, set `MCP_DRY_RUN=false` in your MCP client environment, and re-run with `__confirm: true`.

## `WRITE_PREVIEW` on Mutating Tools
- `fluxer-mcp setup` defaults profiles to `MCP_WRITE_MODE=preview` so new setups cannot mutate Fluxer accidentally.
- **Fix**: Pass `--write-mode allow` during `setup` or set `MCP_WRITE_MODE=allow` in your environment.

## `GUILD_NOT_ALLOWED` or `GUILD_SCOPE_UNRESOLVED`
- When `ALLOWED_GUILDS` is set, only guilds in that comma-separated list (and channels proven to belong to them) may be accessed.
- **Fix**: Add the target guild snowflake ID to `ALLOWED_GUILDS`.

## TLS / Self-Signed Certificate Errors on Self-Hosted Fluxer
- Fluxer MCP **never** disables TLS certificate validation (`rejectUnauthorized: true`).
- **Fix**: Point `FLUXER_CA_CERT_PATH` (or `NODE_EXTRA_CA_CERTS`) to your instance's PEM root/intermediate CA certificate bundle. See [SELF-HOSTED.md](SELF-HOSTED.md).

## `FLUXER_RATE_LIMITED` (HTTP 429)
- Fluxer MCP automatically retries rate-limited calls using Cockatiel backoff and honors `Retry-After`.
- For high-volume notifications, prefer `webhooks_execute`, `emojis_bulk_create`, `stickers_bulk_create`, `members_bulk_add_role`, or `messages_bulk_delete`.

## Checking the Catalog Without Credentials
Run:
```bash
fluxer-mcp catalog --check --json
```
This validates all 172 tool contracts locally with zero network calls.
