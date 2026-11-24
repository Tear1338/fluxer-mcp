import type { FluxerTool } from './_lib/types.js';
import { auditLogTools } from './audit-log.js';
import { blueprintAndChangeTools } from './blueprint.js';
import { channelTools } from './channels.js';
import { discoveryTools } from './discovery.js';
import { expressionTools } from './expressions.js';
import { guildTools } from './guild.js';
import { instanceAndApplicationTools } from './instance.js';
import { intelligenceTools } from './intelligence.js';
import { inviteTools } from './invites.js';
import { memberTools } from './members.js';
import { messageTools } from './messages.js';
import { metaTools } from './meta.js';
import { permissionTools } from './permissions.js';
import { reactionTools } from './reactions.js';
import { roleTools } from './roles.js';
import { threadTools } from './threads.js';
import { userTools } from './users.js';
import { webhookTools } from './webhooks.js';

export const ALL_FLUXER_TOOLS: readonly FluxerTool[] = [
  ...instanceAndApplicationTools,
  ...auditLogTools,
  ...channelTools,
  ...discoveryTools,
  ...expressionTools,
  ...guildTools,
  ...blueprintAndChangeTools,
  ...intelligenceTools,
  ...inviteTools,
  ...memberTools,
  ...messageTools,
  ...metaTools,
  ...permissionTools,
  ...reactionTools,
  ...roleTools,
  ...threadTools,
  ...userTools,
  ...webhookTools,
];

// Fail-fast invariant: ensure every registered tool name is unique.
const seen = new Set<string>();
for (const tool of ALL_FLUXER_TOOLS) {
  if (seen.has(tool.name)) {
    throw new Error(`Duplicate Fluxer MCP tool registration: ${tool.name}`);
  }
  seen.add(tool.name);
}

export const FLUXER_TOOL_CATEGORIES: readonly string[] = [
  ...new Set(ALL_FLUXER_TOOLS.map((t) => t.category)),
].sort();
