# Security Policy — Fluxer MCP

## Supported Versions

Fluxer MCP `1.x` receives active security fixes.

## Security Architecture Commitments

- **Strict TLS by default**: Certificate verification is never disabled. Private CAs for self-hosted Fluxer instances are supported cleanly via `FLUXER_CA_CERT_PATH` / `NODE_EXTRA_CA_CERTS`.
- **Zero secrets on disk**: `fluxer-mcp setup` profiles store only non-secret metadata (`api_url`, `allowed_guilds`, safety flags) — never `FLUXER_TOKEN` or `FLUXER_MCP_ACCESS_TOKEN`.
- **Log & Audit Redaction**: Pino loggers and JSONL audit sinks automatically redact tokens, passwords, secrets, webhook tokens, and base64 image payloads.
- **Least-Privilege Guardrails**: `ALLOWED_GUILDS`, `MCP_CATEGORIES`, `FLUXER_EXPECTED_BOT_ID`, `MCP_WRITE_MODE=preview`, `MCP_DRY_RUN=true` + `__confirm: true`, and `MCP_DM_CONSENT_MODE=require`.
- **Signed Local State**: Blueprint plans, change plans, backups, raid-shield snapshots, and workflows are integrity-checked with SHA-256 digests and HMAC signatures.
- **Constant-Time HTTP Auth**: Streamable HTTP (`/mcp`, `/healthz`) validates Bearer tokens with `crypto.timingSafeEqual`, enforces body-size and in-flight limits, and applies localhost DNS-rebinding Host/Origin checks.

## Reporting a Vulnerability

Please **do not** open public issues containing exploits, bot tokens, or private community data. Report security issues privately via GitHub Security Advisories or directly to the maintainers.
