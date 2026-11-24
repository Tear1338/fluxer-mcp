# Getting Started with Fluxer MCP

This guide walks you from zero to a working **Fluxer MCP** connection in under 5 minutes.

## Prerequisites

- **Node.js 22.13 or newer** (`node -v`)
- A **Fluxer account** on [Fluxer Cloud](https://fluxer.com/) or a compatible self-hosted Fluxer instance
- A Fluxer community (guild) where you have permission to invite and configure bots

> **Important Fluxer API rule**: Fluxer forbids bot accounts from creating new guilds (`BOTS_CANNOT_CREATE_GUILDS`). Create your empty community manually in the Fluxer client first, invite your bot, and then let your AI build the entire structure using `guild_blueprint_plan` and `guild_blueprint_apply`.

---

## Step 1 — Create & Configure a Fluxer Bot

1. Open your Fluxer client (Cloud or self-hosted) and navigate to **User Settings → Applications / Bots** (or your instance's developer portal).
2. Create a new **Application** and add a **Bot** user to it.
3. Copy your **Bot Token** and keep it secret. Never commit it to Git or paste it into plain config files.
4. Generate a bot invite link with the scopes/permissions you need (see [PERMISSIONS.md](PERMISSIONS.md)) and invite the bot to your target community.
5. In Fluxer, make sure the bot's highest role sits **above** any roles you want the AI to create, edit, or assign.

> **Good news for Fluxer developers**: Unlike Discord, Fluxer does **not** require privileged Gateway Intents (`GUILD_MEMBERS` / `MESSAGE_CONTENT`).

---

## Step 2 — Install Fluxer MCP

### Option A: Global CLI

```bash
npm install -g @fluxer-mcp/cli
fluxer-mcp --version
```

### Option B: Zero-install via `npx`

```bash
npx -y @fluxer-mcp/cli catalog --check
```

### Option C: From source (monorepo)

```bash
git clone https://github.com/Tear1338/fluxer-mcp.git
cd fluxer-mcp
pnpm install
pnpm build
node packages/mcp-server/dist/cli.js catalog --check
```

---

## Step 3 — Export Your Token & Verify Connectivity

```bash
# macOS / Linux
export FLUXER_TOKEN="YOUR_FLUXER_BOT_TOKEN"
```

```powershell
# Windows PowerShell
$env:FLUXER_TOKEN = "YOUR_FLUXER_BOT_TOKEN"
```

Run online diagnostics and a read-only smoke test:

```bash
fluxer-mcp doctor --online
fluxer-mcp smoke
```

---

## Step 4 — Save a Safe Profile & Configure Your AI Client

Recommended for first-time setup (`setup` creates a non-secret profile with preview mode enabled by default):

```bash
fluxer-mcp setup \
  --profile my-community \
  --client claude-code \
  --allowed-guilds YOUR_GUILD_ID \
  --write-mode allow
```

Or generate a configuration snippet directly for any supported AI client:

| Client | Command |
| --- | --- |
| **Claude Code** | `fluxer-mcp init --client claude-code` |
| **Claude Desktop** | `fluxer-mcp init --client claude-desktop` |
| **OpenAI Codex** | `fluxer-mcp init --client codex` |
| **Cursor** | `fluxer-mcp init --client cursor` |
| **VS Code / Copilot** | `fluxer-mcp init --client vscode` |
| **Windsurf** | `fluxer-mcp init --client windsurf` |
| **Cline / Roo Code / Continue / Zed / OpenCode** | `fluxer-mcp init --client <id>` |

When you are ready to allow destructive operations (such as `members_ban`, `channels_delete`, `roles_delete`, or `guild_blueprint_apply`), set `MCP_DRY_RUN=false` in the MCP environment and instruct the AI to confirm previews before passing `__confirm: true`.
