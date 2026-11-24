import type { Tool as McpTool } from '@modelcontextprotocol/server';
import type { FluxerTool } from './tools/_lib/types.js';

export const PROGRESSIVE_SEARCH_TOOL_NAME = 'fluxer_search_tools';
export const PROGRESSIVE_ARCHITECT_TOOL_NAME = 'build_fluxer_community';
export const PROGRESSIVE_READ_TOOL_NAME = 'fluxer_read';
export const PROGRESSIVE_WRITE_TOOL_NAME = 'fluxer_write';
export const PROGRESSIVE_DESTRUCTIVE_TOOL_NAME = 'fluxer_destructive';

const SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  salon: ['channel', 'channels'],
  salons: ['channel', 'channels'],
  serveur: ['guild', 'community', 'blueprint'],
  communaute: ['guild', 'community', 'blueprint'],
  communauté: ['guild', 'community', 'blueprint'],
  role: ['roles', 'hierarchy', 'hoist'],
  rôle: ['roles', 'hierarchy', 'hoist'],
  rôles: ['roles', 'hierarchy', 'hoist'],
  membre: ['member', 'members'],
  membres: ['member', 'members'],
  bannir: ['ban', 'members_ban'],
  expulser: ['kick', 'members_kick'],
  sauvegarde: ['backup', 'export', 'restore', 'clone'],
  securite: ['security', 'audit', 'raid', 'permissions'],
  sécurité: ['security', 'audit', 'raid', 'permissions'],
  moderation: ['moderate', 'ban', 'kick', 'timeout', 'raid'],
  modération: ['moderate', 'ban', 'kick', 'timeout', 'raid'],
  epingle: ['pin', 'pins'],
  épingler: ['pin', 'pins'],
  invitation: ['invite', 'invites'],
  invitations: ['invite', 'invites'],
  recherche: ['search', 'messages_search', 'members_search'],
  vocal: ['voice', 'members_voice_moderate'],
  audit: ['audit_log', 'security_audit', 'permissions_audit'],
};

export interface ToolSearchResult {
  readonly name: string;
  readonly category: string;
  readonly risk: 'read' | 'write' | 'destructive';
  readonly description_summary: string;
  readonly score: number;
}

export function classifyToolRisk(tool: FluxerTool): 'read' | 'write' | 'destructive' {
  if (tool.annotations.readOnlyHint) return 'read';
  if (tool.confirmRequired || tool.annotations.destructiveHint) return 'destructive';
  return 'write';
}

export function searchTools(
  tools: readonly FluxerTool[],
  query: string,
  opts: { category?: string; risk?: 'read' | 'write' | 'destructive'; limit?: number } = {},
): ToolSearchResult[] {
  const limit = Math.min(Math.max(opts.limit ?? 15, 1), 50);
  const rawTokens = query
    .toLowerCase()
    .split(/[^a-z0-9_àâäéèêëïîôöùûüç-]+/i)
    .filter((t) => t.length > 1);

  const expandedTokens = new Set<string>(rawTokens);
  for (const tok of rawTokens) {
    const syns = SYNONYMS[tok];
    if (syns) {
      for (const s of syns) expandedTokens.add(s);
    }
  }

  const scored: ToolSearchResult[] = [];
  for (const tool of tools) {
    if (opts.category && tool.category !== opts.category) continue;
    const risk = classifyToolRisk(tool);
    if (opts.risk && risk !== opts.risk) continue;

    const nameLower = tool.name.toLowerCase();
    const catLower = tool.category.toLowerCase();
    const descLower = tool.description.toLowerCase();

    let score = 0;
    if (expandedTokens.size === 0) {
      score = 1;
    } else {
      for (const tok of expandedTokens) {
        if (nameLower === tok) score += 20;
        else if (nameLower.includes(tok)) score += 10;
        if (catLower === tok) score += 8;
        else if (catLower.includes(tok)) score += 4;
        if (descLower.includes(tok)) score += 2;
      }
    }

    if (score > 0) {
      const firstLine = tool.description.split('\n')[0] ?? tool.description;
      scored.push({
        name: tool.name,
        category: tool.category,
        risk,
        description_summary: firstLine.slice(0, 220),
        score,
      });
    }
  }

  return scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit);
}

export function buildProgressiveMetaTools(): McpTool[] {
  return [
    {
      name: PROGRESSIVE_SEARCH_TOOL_NAME,
      description:
        'Search the full Fluxer MCP catalog (172 typed tools) by keyword, category, or risk level. Returns exact tool names and summaries to invoke via fluxer_read, fluxer_write, or fluxer_destructive.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Keywords or intent (English or French)' },
          category: { type: 'string', description: 'Optional category filter' },
          risk: {
            type: 'string',
            enum: ['read', 'write', 'destructive'],
            description: 'Optional risk tier filter',
          },
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 15 },
        },
        required: ['query'],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: PROGRESSIVE_READ_TOOL_NAME,
      description:
        'Invoke any read-only Fluxer MCP tool discovered via fluxer_search_tools. Cannot mutate Fluxer.',
      inputSchema: {
        type: 'object',
        properties: {
          tool: { type: 'string', description: 'Exact read-only tool name' },
          arguments: { type: 'object', description: 'Tool input arguments' },
        },
        required: ['tool'],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    {
      name: PROGRESSIVE_WRITE_TOOL_NAME,
      description:
        'Invoke a non-destructive mutating Fluxer MCP tool (create/update channels, roles, messages, settings, tags, webhooks). Subject to MCP_WRITE_MODE and ALLOWED_GUILDS.',
      inputSchema: {
        type: 'object',
        properties: {
          tool: { type: 'string', description: 'Exact write tool name' },
          arguments: { type: 'object', description: 'Tool input arguments' },
        },
        required: ['tool'],
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    {
      name: PROGRESSIVE_DESTRUCTIVE_TOOL_NAME,
      description:
        'Invoke a confirmation-gated destructive Fluxer MCP tool (ban, kick, delete channel/role/message/guild). Requires __confirm: true and MCP_DRY_RUN=false.',
      inputSchema: {
        type: 'object',
        properties: {
          tool: { type: 'string', description: 'Exact destructive tool name' },
          arguments: {
            type: 'object',
            description: 'Tool input arguments (include __confirm: true)',
          },
        },
        required: ['tool'],
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
  ];
}
