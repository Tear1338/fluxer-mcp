import {
  type CallToolResult,
  type Tool as McpTool,
  Server,
} from '@modelcontextprotocol/server';
import type { Logger } from 'pino';
import { z } from 'zod';
import packageJson from '../package.json' with { type: 'json' };
import { type AuditSink, NoopAuditSink, createAuditSink } from './audit.js';
import { type Config, parseCategoryAllowlist } from './config.js';
import {
  PROGRESSIVE_ARCHITECT_TOOL_NAME,
  PROGRESSIVE_DESTRUCTIVE_TOOL_NAME,
  PROGRESSIVE_READ_TOOL_NAME,
  PROGRESSIVE_SEARCH_TOOL_NAME,
  PROGRESSIVE_WRITE_TOOL_NAME,
  buildProgressiveMetaTools,
  classifyToolRisk,
  searchTools,
} from './discovery.js';
import { FluxerMcpError, formatErrorForUser } from './errors.js';
import type { FluxerRestClient } from './fluxer/rest.js';
import { ALWAYS_ALLOWED_CATEGORIES, executeToolWithMiddleware } from './middleware.js';
import type { FluxerTool, ToolRuntimeContext } from './tools/_lib/types.js';
import { ALL_FLUXER_TOOLS, FLUXER_TOOL_CATEGORIES } from './tools/index.js';

export const VERSION: string = packageJson.version;

export interface BuildServerDeps {
  readonly rest: FluxerRestClient;
  readonly config: Config;
  readonly logger: Logger;
  readonly transport?: 'stdio' | 'http';
  readonly auditSink?: AuditSink;
}

export interface BuildServerResult {
  readonly server: Server;
  readonly registeredTools: readonly string[];
  readonly categories: readonly string[];
  readonly auditSink: AuditSink;
}

function compileToolContract(tool: FluxerTool, hasDefaultGuild: boolean): McpTool {
  const inputSchema = z.toJSONSchema(z.object(tool.inputSchema), {
    target: 'draft-2020-12',
    io: 'input',
  }) as McpTool['inputSchema'];

  if (tool.confirmRequired || tool.name === 'users_create_dm') {
    inputSchema.properties ??= {};
    (inputSchema.properties as Record<string, unknown>).__confirm = {
      type: 'boolean',
      description: tool.confirmRequired
        ? 'Set true to confirm this destructive operation (also requires MCP_DRY_RUN=false).'
        : 'Set true to confirm DM recipient consent when MCP_DM_CONSENT_MODE=require.',
    };
  }

  if (
    hasDefaultGuild &&
    Object.hasOwn(tool.inputSchema, 'guild_id') &&
    Array.isArray(inputSchema.required)
  ) {
    inputSchema.required = inputSchema.required.filter((r) => r !== 'guild_id');
  }

  return {
    name: tool.name,
    description: tool.description,
    inputSchema,
    annotations: tool.annotations,
  };
}

const PROMPTS = [
  {
    name: 'build-fluxer-community',
    description:
      'Design and build a complete Fluxer community from a natural-language brief using safe dry-run planning and verified apply.',
    arguments: [
      { name: 'guild_id', description: 'Target Fluxer guild snowflake ID', required: true },
      { name: 'description', description: 'Kind of community to create', required: true },
    ],
  },
  {
    name: 'audit-fluxer-security',
    description:
      'Run a full security, permission, role hierarchy, and audit log assessment on a Fluxer community.',
    arguments: [{ name: 'guild_id', description: 'Target Fluxer guild snowflake ID', required: true }],
  },
  {
    name: 'triage-moderation',
    description:
      'Scan a Fluxer channel for spam/scam/raid signals and review recent audit logs before taking action.',
    arguments: [
      { name: 'guild_id', description: 'Target Fluxer guild snowflake ID', required: true },
      { name: 'channel_id', description: 'Channel snowflake ID to inspect', required: true },
    ],
  },
] as const;

export function buildServer(deps: BuildServerDeps): BuildServerResult {
  const transport = deps.transport ?? 'stdio';
  const auditSink = deps.auditSink ?? createAuditSink(deps.config);
  const categoryAllowlist = parseCategoryAllowlist(deps.config.MCP_CATEGORIES);
  const hasDefaultGuild = deps.config.FLUXER_DEFAULT_GUILD_ID !== undefined;

  if (categoryAllowlist !== null) {
    const valid = new Set(FLUXER_TOOL_CATEGORIES);
    const unknown = [...categoryAllowlist].filter((c) => !valid.has(c));
    if (unknown.length > 0) {
      throw new Error(
        `Unknown MCP_CATEGORIES: ${unknown.join(', ')}. Valid categories: ${FLUXER_TOOL_CATEGORIES.join(', ')}`,
      );
    }
  }

  const visibleTools = ALL_FLUXER_TOOLS.filter(
    (t) =>
      categoryAllowlist === null ||
      categoryAllowlist.has(t.category) ||
      ALWAYS_ALLOWED_CATEGORIES.has(t.category),
  );
  const toolMap = new Map(visibleTools.map((t) => [t.name, t]));

  const server = new Server(
    { name: 'fluxer-mcp', version: VERSION },
    { capabilities: { tools: {}, resources: {}, prompts: {} } },
  );

  const runTool = async (
    toolName: string,
    rawArgs: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<CallToolResult> => {
    const tool = toolMap.get(toolName);
    if (!tool) {
      return formatErrorForUser(
        new FluxerMcpError('TOOL_NOT_FOUND', `Unknown or disabled Fluxer MCP tool: ${toolName}`, {
          recoveryHint: 'Use fluxer_search_tools or tools/list to discover available tools.',
        }),
        { toolName, transport },
      );
    }
    const runtimeCtx: ToolRuntimeContext = {
      rest: deps.rest,
      config: deps.config,
      logger: deps.logger,
      signal,
      invokeTool: (nestedName, nestedArgs) => runTool(nestedName, nestedArgs, signal),
      getTools: () => visibleTools,
    };
    try {
      return await executeToolWithMiddleware(tool, rawArgs, runtimeCtx, {
        config: deps.config,
        rest: deps.rest,
        auditSink,
      });
    } catch (err) {
      return formatErrorForUser(err, { toolName, transport });
    }
  };

  server.setRequestHandler('tools/list', async () => {
    if (deps.config.MCP_TOOL_SURFACE === 'progressive') {
      const architectTool = toolMap.get('guild_blueprint_plan');
      const applyTool = toolMap.get('guild_blueprint_apply');
      const evidenceTool = toolMap.get('guild_blueprint_evidence');
      const advertised: McpTool[] = [
        ...(architectTool
          ? [
              {
                ...compileToolContract(architectTool, hasDefaultGuild),
                name: PROGRESSIVE_ARCHITECT_TOOL_NAME,
              },
            ]
          : []),
        ...(applyTool ? [compileToolContract(applyTool, hasDefaultGuild)] : []),
        ...(evidenceTool ? [compileToolContract(evidenceTool, hasDefaultGuild)] : []),
        ...buildProgressiveMetaTools(),
      ];
      return { tools: advertised };
    }

    return {
      tools: visibleTools.map((tool) => compileToolContract(tool, hasDefaultGuild)),
    };
  });

  server.setRequestHandler('tools/call', async (request, extra) => {
    const toolName = request.params.name;
    const rawArgs = (request.params.arguments ?? {}) as Record<string, unknown>;
    const signal = extra.mcpReq.signal;

    // Handle progressive meta tools cleanly
    if (toolName === PROGRESSIVE_ARCHITECT_TOOL_NAME) {
      return runTool('guild_blueprint_plan', rawArgs, signal);
    }
    if (toolName === PROGRESSIVE_SEARCH_TOOL_NAME) {
      const query = typeof rawArgs.query === 'string' ? rawArgs.query : '';
      const category = typeof rawArgs.category === 'string' ? rawArgs.category : undefined;
      const risk =
        rawArgs.risk === 'read' || rawArgs.risk === 'write' || rawArgs.risk === 'destructive'
          ? rawArgs.risk
          : undefined;
      const limit = typeof rawArgs.limit === 'number' ? rawArgs.limit : 15;
      const matches = searchTools(visibleTools, query, {
        ...(category ? { category } : {}),
        ...(risk ? { risk } : {}),
        limit,
      });
      return {
        content: [
          {
            type: 'text',
            text:
              matches.length === 0
                ? `No Fluxer MCP tools matched "${query}".`
                : matches
                    .map((m) => `- \`${m.name}\` [${m.category} / ${m.risk}]: ${m.description_summary}`)
                    .join('\n'),
          },
        ],
        structuredContent: { query, count: matches.length, tools: matches },
      };
    }

    if (
      toolName === PROGRESSIVE_READ_TOOL_NAME ||
      toolName === PROGRESSIVE_WRITE_TOOL_NAME ||
      toolName === PROGRESSIVE_DESTRUCTIVE_TOOL_NAME
    ) {
      const targetName = typeof rawArgs.tool === 'string' ? rawArgs.tool : '';
      const targetArgs =
        rawArgs.arguments && typeof rawArgs.arguments === 'object' && !Array.isArray(rawArgs.arguments)
          ? (rawArgs.arguments as Record<string, unknown>)
          : {};
      const target = toolMap.get(targetName);
      if (!target) {
        return formatErrorForUser(
          new FluxerMcpError('TOOL_NOT_FOUND', `Unknown tool "${targetName}".`, {
            recoveryHint: 'Search with fluxer_search_tools first.',
          }),
          { toolName: targetName || toolName, transport },
        );
      }
      const risk = classifyToolRisk(target);
      if (toolName === PROGRESSIVE_READ_TOOL_NAME && risk !== 'read') {
        return formatErrorForUser(
          new FluxerMcpError(
            'DISPATCHER_RISK_MISMATCH',
            `Tool "${targetName}" is a ${risk} tool and cannot be invoked via fluxer_read.`,
            { recoveryHint: `Use fluxer_${risk} instead.` },
          ),
          { toolName: targetName, transport },
        );
      }
      if (toolName === PROGRESSIVE_WRITE_TOOL_NAME && risk === 'destructive') {
        return formatErrorForUser(
          new FluxerMcpError(
            'DISPATCHER_RISK_MISMATCH',
            `Tool "${targetName}" is destructive and must be invoked via fluxer_destructive.`,
            { recoveryHint: 'Use fluxer_destructive with __confirm: true.' },
          ),
          { toolName: targetName, transport },
        );
      }
      return runTool(targetName, targetArgs, signal);
    }

    return runTool(toolName, rawArgs, signal);
  });

  // MCP Resources
  server.setRequestHandler('resources/list', async () => ({
    resources: [
      {
        uri: 'fluxer://instance/discovery',
        name: 'Fluxer Instance Discovery',
        description: 'Live /.well-known/fluxer capabilities, endpoints, features, and limits',
        mimeType: 'application/json',
      },
      {
        uri: 'fluxer://catalog/summary',
        name: 'Fluxer MCP Tool Catalog Summary',
        description: 'Registered tool counts by category for this Fluxer MCP instance',
        mimeType: 'application/json',
      },
    ],
  }));

  server.setRequestHandler('resources/read', async (request) => {
    const uri = request.params.uri;
    if (uri === 'fluxer://instance/discovery') {
      const doc = await deps.rest.discoverInstance();
      return {
        contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(doc, null, 2) }],
      };
    }
    if (uri === 'fluxer://catalog/summary') {
      const byCategory: Record<string, number> = {};
      for (const t of visibleTools) {
        byCategory[t.category] = (byCategory[t.category] ?? 0) + 1;
      }
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                name: 'fluxer-mcp',
                version: VERSION,
                total_tools: visibleTools.length,
                categories: byCategory,
              },
              null,
              2,
            ),
          },
        ],
      };
    }
    throw new Error(`Unknown Fluxer MCP resource URI: ${uri}`);
  });

  // MCP Prompts
  server.setRequestHandler('prompts/list', async () => ({
    prompts: PROMPTS.map((p) => ({
      name: p.name,
      description: p.description,
      arguments: [...p.arguments],
    })),
  }));

  server.setRequestHandler('prompts/get', async (request) => {
    const name = request.params.name;
    const args = request.params.arguments ?? {};
    if (name === 'build-fluxer-community') {
      return {
        description: 'Build a complete Fluxer community with safe dry-run review',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Call guild_blueprint_plan with guild_id="${args.guild_id ?? '<GUILD_ID>'}" and request="${args.description ?? 'community server'}". Present the complete dry-run preview (roles, categories, channels, overwrites, welcome posts) and wait for explicit approval before calling guild_blueprint_apply.`,
            },
          },
        ],
      };
    }
    if (name === 'audit-fluxer-security') {
      return {
        description: 'Comprehensive Fluxer community security audit',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Run guild_security_audit, roles_analyze_hierarchy, and audit_log_summary for guild_id="${args.guild_id ?? '<GUILD_ID>'}". Summarize findings by severity and propose a safe guild_change_plan for any critical/high misconfigurations.`,
            },
          },
        ],
      };
    }
    if (name === 'triage-moderation') {
      return {
        description: 'Moderation and spam/raid triage',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Run intelligence_moderate_content on channel_id="${args.channel_id ?? '<CHANNEL_ID>'}" and audit_log_summary on guild_id="${args.guild_id ?? '<GUILD_ID>'}". Report flagged content and recommend actions without mutating Fluxer until confirmed.`,
            },
          },
        ],
      };
    }
    throw new Error(`Unknown prompt: ${name}`);
  });

  return {
    server,
    registeredTools: visibleTools.map((t) => t.name),
    categories: FLUXER_TOOL_CATEGORIES,
    auditSink,
  };
}

/**
 * Credential-free catalog server for schema inspection (`fluxer-mcp catalog`).
 * Makes ZERO Fluxer API calls and refuses all tool executions.
 */
export function buildCatalogServer(): BuildServerResult {
  const server = new Server(
    { name: 'fluxer-mcp', version: VERSION },
    { capabilities: { tools: {}, prompts: {} } },
  );

  server.setRequestHandler('tools/list', async () => ({
    tools: ALL_FLUXER_TOOLS.map((tool) => compileToolContract(tool, false)),
  }));

  server.setRequestHandler('tools/call', async (request) =>
    formatErrorForUser(
      new FluxerMcpError(
        'CATALOG_ONLY',
        'Fluxer MCP is running in credential-free catalog mode; tool execution is disabled.',
        { recoveryHint: 'Start the server with `fluxer-mcp serve` and set FLUXER_TOKEN.' },
      ),
      { toolName: request.params.name, transport: 'stdio' },
    ),
  );

  server.setRequestHandler('prompts/list', async () => ({
    prompts: PROMPTS.map((p) => ({
      name: p.name,
      description: p.description,
      arguments: [...p.arguments],
    })),
  }));

  return {
    server,
    registeredTools: ALL_FLUXER_TOOLS.map((t) => t.name),
    categories: FLUXER_TOOL_CATEGORIES,
    auditSink: new NoopAuditSink(),
  };
}
