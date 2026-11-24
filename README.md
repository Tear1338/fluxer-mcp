# Fluxer MCP

**The native Model Context Protocol (MCP) server for [Fluxer](https://fluxer.com/) — Cloud & Self-Hosted.**

Connect **Claude Code**, **Claude Desktop**, **OpenAI Codex**, **Cursor**, **VS Code**, **Windsurf**, **Cline**, **Roo Code**, **Zed**, or any MCP-compatible AI client directly to your Fluxer bot. Create, architect, administer, moderate, audit, back up, clone, and secure entire Fluxer communities through **172 strictly typed, Fluxer-native tools**.

[![CI](https://github.com/Tear1338/fluxer-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Tear1338/fluxer-mcp/actions/workflows/ci.yml)
[![Apache-2.0 License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
[![Node.js >= 22.13](https://img.shields.io/badge/node-%3E%3D22.13-brightgreen)](https://nodejs.org/)
[![Fluxer API v1](https://img.shields.io/badge/Fluxer%20API-v1%20Native-4641d9)](https://docs.fluxer.com/)

---

## Why Fluxer MCP?

Fluxer MCP is **not** a thin Discord find-and-replace wrapper. Every route, schema, permission bit, channel type, audit-log action, gateway frame, and error code was verified against the live **Fluxer API v1 OpenAPI 3.1.0** specification and [`fluxerapp/fluxer`](https://github.com/fluxerapp/fluxer):

- **100% Native Fluxer API v1**: Zero Discord runtime dependencies. Supports Fluxer-exclusive features including `/.well-known/fluxer` instance discovery, `GUILD_LINK (998)` channels, role `hoist_position` ordering, temporary bans (`ban_duration_seconds`), `timeout_reason`, bot-accessible full-text message search (`POST /search/messages`), `POST /members-search`, forum tag CRUD, Guild Discovery management, bulk/clone emojis & stickers, Instatus & Libredesk webhooks, and Fluxer's exact 37+4 permission bitfield (`PIN_MESSAGES`, `BYPASS_SLOWMODE`, `UPDATE_RTC_REGION`, `VIEW_CHANNEL_MEMBERS`).
- **Cloud & Self-Hosted First**: Configure any `FLUXER_API_URL`, auto-discover capabilities via `/.well-known/fluxer`, and load private PEM CA bundles via `FLUXER_CA_CERT_PATH` — **TLS verification is never disabled by default**.
- **AI Community Architect**: Describe a community in plain English or French → get a safe dry-run plan (`guild_blueprint_plan`), review roles, channels, overwrites, forum tags, and starter posts, then apply idempotently (`guild_blueprint_apply`) and verify live state (`guild_blueprint_evidence`).
- **Security, Anti-Raid, Backup & Restore**: Built-in `guild_security_audit` (0–100 score + findings), `roles_analyze_hierarchy`, reversible `guild_raid_shield` lockdown, signed `guild_backup_export`, `guild_config_diff`, `guild_clone_plan`, and bounded `guild_change_plan` / `apply` / `restore`.
- **Enterprise-Grade Safety**: `MCP_WRITE_MODE=preview`, `MCP_DRY_RUN=true` + `__confirm: true` for destructive operations, `ALLOWED_GUILDS` enforcement, `FLUXER_EXPECTED_BOT_ID` identity lock, Cockatiel retry/circuit-breaker/bulkhead resilience, and automatic secret redaction in logs and audit trails.

---

## Quick Start (2 Minutes)

Requires **Node.js 22.13+** and a Fluxer bot token.

### 1. Install

```bash
npm install -g @fluxer-mcp/cli
```

Or run directly without installing globally:

```bash
npx -y @fluxer-mcp/cli catalog --check
```

### 2. Set your Fluxer bot token

```bash
# macOS / Linux
export FLUXER_TOKEN="YOUR_FLUXER_BOT_TOKEN"
```

```powershell
# Windows PowerShell
$env:FLUXER_TOKEN = "YOUR_FLUXER_BOT_TOKEN"
```

*(For a self-hosted Fluxer instance, also set `FLUXER_API_URL="https://your-fluxer.example.com/api"`.)*

### 3. Verify connectivity

```bash
fluxer-mcp doctor --online
fluxer-mcp smoke
```

### 4. Connect your AI client

Generate ready-to-use configuration for your preferred client:

```bash
# Claude Code
fluxer-mcp init --client claude-code --allowed-guilds 999000999000999000

# OpenAI Codex (~/.codex/config.toml)
fluxer-mcp init --client codex --allowed-guilds 999000999000999000

# Claude Desktop / Cursor / VS Code / Windsurf / Cline / Roo Code / Zed / OpenCode
fluxer-mcp init --client claude-desktop
fluxer-mcp init --client cursor
fluxer-mcp init --client vscode
```

Or create a saved non-secret profile with preview-first defaults:

```bash
fluxer-mcp setup --profile prod --client claude-code --allowed-guilds 999000999000999000
```

---

## AI Client Configuration Examples

### Claude Code

```bash
claude mcp add fluxer -e FLUXER_TOKEN="$FLUXER_TOKEN" -- npx -y @fluxer-mcp/cli serve
```

### OpenAI Codex (`~/.codex/config.toml`)

```toml
[mcp_servers.fluxer]
command = "npx"
args = ["-y", "@fluxer-mcp/cli", "serve"]

[mcp_servers.fluxer.env]
FLUXER_TOKEN = "${FLUXER_TOKEN}"
MCP_TOOL_SURFACE = "progressive"
```

### Claude Desktop / Cursor (`mcp.json`)

```json
{
  "mcpServers": {
    "fluxer": {
      "command": "npx",
      "args": ["-y", "@fluxer-mcp/cli", "serve"],
      "env": {
        "FLUXER_TOKEN": "${FLUXER_TOKEN}",
        "ALLOWED_GUILDS": "999000999000999000",
        "MCP_DRY_RUN": "true"
      }
    }
  }
}
```

### Self-Hosted Fluxer Instance

```json
{
  "mcpServers": {
    "fluxer": {
      "command": "npx",
      "args": ["-y", "@fluxer-mcp/cli", "serve"],
      "env": {
        "FLUXER_TOKEN": "${FLUXER_TOKEN}",
        "FLUXER_API_URL": "https://chat.mycompany.example/api",
        "FLUXER_CA_CERT_PATH": "/etc/ssl/certs/company-ca.pem"
      }
    }
  }
}
```

---

## Docker & Remote Streamable HTTP

Run Fluxer MCP as a bearer-authenticated remote Streamable HTTP server (`/mcp` and `/healthz`):

```bash
export FLUXER_TOKEN="YOUR_FLUXER_BOT_TOKEN"
export FLUXER_MCP_ACCESS_TOKEN="$(openssl rand -hex 32)"
docker compose up -d --build
```

Verify health:

```bash
curl -H "Authorization: Bearer $FLUXER_MCP_ACCESS_TOKEN" http://127.0.0.1:3000/healthz
```

---

## Tool Catalog Overview (172 Tools across 20 Categories)

| Category | Tools | Highlights |
| --- | ---: | --- |
| `instance` | 3 | `/.well-known/fluxer` discovery, instance badges, gateway info |
| `application` | 2 | Current bot app metadata, public application lookup |
| `guild` | 19 | Settings, vanity URL, channel positions, **Blueprints** (compile/plan/apply/evidence), **Change Plan/Apply/Restore**, **Security Audit**, **Raid Shield**, **Backup Export**, **Config Diff**, **Clone Plan** |
| `channels` | 21 | CRUD, overwrites, `GUILD_LINK (998)`, slowmode state, follower stats, **Forum Tag CRUD**, forum post data, thread search & archives |
| `threads` | 6 | Join, leave, add/remove/get/list thread members |
| `roles` | 8 | CRUD, positions, Fluxer **hoist positions**, **Role Hierarchy Analyzer** |
| `permissions` | 3 | Channel role audit, member permission trace (`permissions_explain`), guild-wide member access report |
| `members` | 18 | List, get, Fluxer `POST /members-search`, role assign/bulk-assign/bulk-remove, kick, **temp bans (`ban_duration_seconds`)**, bulk ban, unban, **timeout (`timeout_reason`)**, **voice moderation** |
| `messages` | 20 | Send (up to 4000 chars + embeds), read, edit, delete, bulk delete, pins, crosspost + source, attachment delete/refresh, **Fluxer full-text search**, cited context, rich composer |
| `reactions` | 6 | Add, remove own/user/emoji/all, list reactors |
| `invites` | 5 | Channel & guild invites list, create, inspect, delete |
| `emojis` | 8 | List, create, **bulk create**, **clone**, modify, delete, metadata, source |
| `stickers` | 8 | List, create, **bulk create**, **clone**, modify, delete, metadata, source |
| `discovery` | 6 | Categories, search discoverable guilds, status, apply, update, withdraw |
| `webhooks` | 17 | Full CRUD + execute + message edit/delete + GitHub, Slack, **Instatus**, **Libredesk** |
| `audit_log` | 2 | Filtered audit logs (all 38 Fluxer action types) + anomaly summary |
| `users` | 8 | Current user, profile lookup, guild list, leave guild, DM channels |
| `intelligence` | 5 | Channel summary, message classification, entity extraction, **heuristic spam/scam/raid moderation**, reply drafting |
| `inspiration` | 1 | Read-only emoji.gg search |
| `meta` | 6 | Intent planner, multi-step `mcp_pipeline`, durable `workflow_start/status/resume/cancel` |

See the complete tool reference in [docs/TOOLS.md](docs/TOOLS.md) and the full Discord MCP compatibility matrix in [PARITY.md](PARITY.md).

---

## Safety Controls

| Environment Variable | Default | Purpose |
| --- | --- | --- |
| `FLUXER_TOKEN` | *(required)* | Fluxer bot token (never logged or written to profiles) |
| `FLUXER_API_URL` | `https://api.fluxer.app` | Base URL for Fluxer Cloud or self-hosted instance |
| `FLUXER_CA_CERT_PATH` | *(unset)* | Optional PEM CA file for private TLS CAs (TLS verification always stays on) |
| `ALLOWED_GUILDS` | *(unset)* | Comma-separated guild IDs the bot may access |
| `FLUXER_DEFAULT_GUILD_ID` | *(unset)* | Optional default guild ID when omitted by the AI |
| `FLUXER_EXPECTED_BOT_ID` | *(unset)* | Identity lock verified against `GET /users/@me` |
| `MCP_WRITE_MODE` | `allow` | Set `preview` to block ALL mutating calls with a preview |
| `MCP_DRY_RUN` | `true` | Blocks destructive tools unless set to `false` AND `__confirm: true` is passed |
| `MCP_TOOL_SURFACE` | `full` | `full` (all 172 tools) or `progressive` (compact search + risk dispatchers) |
| `MCP_CATEGORIES` | *(all)* | Comma-separated tool category allowlist (`meta` & `instance` stay reachable) |
| `MCP_DM_CONSENT_MODE` | `advisory` | Set `require` to demand `__confirm: true` before opening a DM |

---

## Documentation

- [Getting Started & Creating a Fluxer Bot](docs/GETTING-STARTED.md)
- [Permissions Guide](docs/PERMISSIONS.md)
- [Self-Hosted Fluxer & TLS Guide](docs/SELF-HOSTED.md)
- [Docker & Remote HTTP Deployment](docs/DOCKER.md)
- [Complete Tool Reference](docs/TOOLS.md)
- [Usage Examples & Prompts](docs/EXAMPLES.md)
- [Known Limitations & Discord Parity](PARITY.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Contributing](CONTRIBUTING.md) · [Security Policy](SECURITY.md)

---

## Local Development

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm catalog:check
```

---

## License & Credits

Licensed under the **Apache License 2.0** ([LICENSE](LICENSE)).

Fluxer MCP originated as a fork of [cappyeo/discord-mcp](https://github.com/cappyeo/discord-mcp) and retains full upstream license notices and attribution in [NOTICE](NOTICE). Built natively for [Fluxer](https://fluxer.com/) using [`@fluxerjs/rest`](https://fluxer.js.org/) and [`@fluxerjs/types`](https://fluxer.js.org/).
