import { z } from 'zod';
import { FluxerRoutes } from '../fluxer/constants.js';
import { ChannelId, defineTool, dualResult, type FluxerTool, wrapUntrusted } from './_lib/types.js';

interface RawMsg {
  readonly id: string;
  readonly content?: string;
  readonly timestamp?: string;
  readonly author?: { readonly id: string; readonly username?: string; readonly bot?: boolean };
}

const SPAM_PATTERNS: ReadonlyArray<{
  readonly label: string;
  readonly re: RegExp;
  readonly weight: number;
}> = [
  { label: 'mass_mention', re: /@(everyone|here)/i, weight: 25 },
  {
    label: 'invite_link',
    re: /(fluxer\.gg|discord\.gg|discord\.com\/invite)\/[a-z0-9-]+/i,
    weight: 20,
  },
  {
    label: 'suspicious_giveaway',
    re: /(free\s+(nitro|plutonium|crypto|airdrop)|claim\s+now)/i,
    weight: 40,
  },
  { label: 'url_shortener', re: /\b(bit\.ly|tinyurl\.com|t\.co|rb\.gy)\//i, weight: 15 },
  { label: 'excessive_caps', re: /[A-Z]{20,}/, weight: 15 },
];

export const intelligenceTools: readonly FluxerTool[] = [
  defineTool({
    name: 'intelligence_summarize_channel',
    category: 'intelligence',
    requiredPermissions: ['VIEW_CHANNEL', 'READ_MESSAGE_HISTORY'],
    description:
      'Analyze recent messages in a Fluxer channel and produce a structured activity digest (message count, active participants, top keywords, link count, and fenced recent highlights).',
    inputSchema: {
      channel_id: ChannelId,
      limit: z.number().int().min(5).max(100).optional(),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const msgs = await ctx.rest.get<RawMsg[]>(FluxerRoutes.channelMessages(args.channel_id), {
        query: { limit: args.limit ?? 50 },
      });
      const byAuthor = new Map<string, number>();
      const wordCounts = new Map<string, number>();
      let linkCount = 0;
      const stop = new Set([
        'the',
        'and',
        'for',
        'that',
        'this',
        'with',
        'have',
        'from',
        'vous',
        'pour',
        'dans',
        'avec',
        'plus',
        'tout',
        'les',
        'des',
        'une',
      ]);

      for (const m of msgs) {
        const who = m.author?.username ?? m.author?.id ?? 'unknown';
        byAuthor.set(who, (byAuthor.get(who) ?? 0) + 1);
        const text = m.content ?? '';
        if (/https?:\/\//i.test(text)) linkCount++;
        for (const w of text.toLowerCase().split(/[^a-z0-9àâäéèêëïîôöùûüç]+/i)) {
          if (w.length >= 4 && !stop.has(w)) wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1);
        }
      }

      const topParticipants = [...byAuthor.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([user, count]) => ({ user, count }));
      const topTopics = [...wordCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([term, count]) => ({ term, count }));

      const sample = msgs
        .slice(0, 10)
        .map((m) => `@${m.author?.username ?? m.author?.id}: ${(m.content ?? '').slice(0, 160)}`)
        .join('\n');

      return dualResult({
        text: `Channel \`${args.channel_id}\` summary: ${msgs.length} message(s), ${byAuthor.size} participant(s), ${linkCount} link(s).\n${wrapUntrusted(sample, 'message')}`,
        data: {
          channel_id: args.channel_id,
          message_count: msgs.length,
          unique_participants: byAuthor.size,
          link_count: linkCount,
          top_participants: topParticipants,
          top_topics: topTopics,
        },
      });
    },
  }),

  defineTool({
    name: 'intelligence_classify_messages',
    category: 'intelligence',
    requiredPermissions: ['VIEW_CHANNEL', 'READ_MESSAGE_HISTORY'],
    description:
      'Classify recent Fluxer channel messages into operational categories (`question`, `bug_report`, `announcement`, `moderation_risk`, `feedback`, `general`).',
    inputSchema: {
      channel_id: ChannelId,
      limit: z.number().int().min(1).max(100).optional(),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const msgs = await ctx.rest.get<RawMsg[]>(FluxerRoutes.channelMessages(args.channel_id), {
        query: { limit: args.limit ?? 30 },
      });
      const classified = msgs.map((m) => {
        const text = m.content ?? '';
        let label: string = 'general';
        if (SPAM_PATTERNS.some((p) => p.re.test(text))) label = 'moderation_risk';
        else if (/\b(bug|error|crash|broken|fail|exception|issue|erreur)\b/i.test(text))
          label = 'bug_report';
        else if (/\?|\b(how|why|help|comment|pourquoi|aide)\b/i.test(text)) label = 'question';
        else if (/\b(release|update|announce|changelog|lancement)\b/i.test(text))
          label = 'announcement';
        else if (/\b(suggest|feature|idea|feedback|amélioration)\b/i.test(text)) label = 'feedback';
        return { message_id: m.id, author_id: m.author?.id ?? null, label };
      });
      const counts: Record<string, number> = {};
      for (const c of classified) counts[c.label] = (counts[c.label] ?? 0) + 1;
      return dualResult({
        text: `Classified ${classified.length} message(s) in \`${args.channel_id}\`.`,
        data: { channel_id: args.channel_id, counts, messages: classified },
      });
    },
  }),

  defineTool({
    name: 'intelligence_extract_entities',
    category: 'intelligence',
    requiredPermissions: ['VIEW_CHANNEL', 'READ_MESSAGE_HISTORY'],
    description:
      'Extract structured entities from recent Fluxer messages: URLs, Fluxer user/role/channel mentions, invite codes, and fenced code blocks.',
    inputSchema: {
      channel_id: ChannelId,
      limit: z.number().int().min(1).max(100).optional(),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const msgs = await ctx.rest.get<RawMsg[]>(FluxerRoutes.channelMessages(args.channel_id), {
        query: { limit: args.limit ?? 50 },
      });
      const urls = new Set<string>();
      const users = new Set<string>();
      const roles = new Set<string>();
      const channels = new Set<string>();
      const invites = new Set<string>();

      for (const m of msgs) {
        const text = m.content ?? '';
        for (const hit of text.matchAll(/https?:\/\/[^\s<>()]+/gi)) urls.add(hit[0]);
        for (const hit of text.matchAll(/<@!?(\d{17,20})>/g)) users.add(hit[1]!);
        for (const hit of text.matchAll(/<@&(\d{17,20})>/g)) roles.add(hit[1]!);
        for (const hit of text.matchAll(/<#(\d{17,20})>/g)) channels.add(hit[1]!);
        for (const hit of text.matchAll(/fluxer\.gg\/([A-Za-z0-9_-]+)/gi)) invites.add(hit[1]!);
      }

      return dualResult({
        text: `Extracted ${urls.size} URL(s), ${users.size} user mention(s), ${roles.size} role mention(s), ${channels.size} channel mention(s), ${invites.size} Fluxer invite(s).`,
        data: {
          channel_id: args.channel_id,
          urls: [...urls],
          user_mentions: [...users],
          role_mentions: [...roles],
          channel_mentions: [...channels],
          fluxer_invites: [...invites],
        },
      });
    },
  }),

  defineTool({
    name: 'intelligence_moderate_content',
    category: 'intelligence',
    description:
      'Read-only heuristic moderation & spam/raid scanner (compensates for Fluxer having no server-side AutoMod API). Scores text or recent channel messages for spam, phishing/giveaway scams, invite links, mass mentions, duplicate message bursts, and excessive caps, recommending exact moderation actions.',
    inputSchema: {
      text: z.string().max(4000).optional().describe('Single text snippet to score'),
      channel_id: ChannelId.optional().describe('Or scan recent messages in a Fluxer channel'),
      limit: z.number().int().min(5).max(100).optional(),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const items: Array<{ id: string; author_id: string | null; text: string }> = [];
      if (args.text !== undefined) {
        items.push({ id: 'inline', author_id: null, text: args.text });
      }
      if (args.channel_id !== undefined) {
        const msgs = await ctx.rest.get<RawMsg[]>(FluxerRoutes.channelMessages(args.channel_id), {
          query: { limit: args.limit ?? 50 },
        });
        for (const m of msgs) {
          items.push({ id: m.id, author_id: m.author?.id ?? null, text: m.content ?? '' });
        }
      }

      const duplicateCounts = new Map<string, number>();
      for (const item of items) {
        const norm = item.text.trim().toLowerCase();
        if (norm.length >= 12) duplicateCounts.set(norm, (duplicateCounts.get(norm) ?? 0) + 1);
      }

      const flagged: Array<{
        id: string;
        author_id: string | null;
        score: number;
        signals: string[];
        recommended_action: string;
      }> = [];
      for (const item of items) {
        let score = 0;
        const signals: string[] = [];
        for (const rule of SPAM_PATTERNS) {
          if (rule.re.test(item.text)) {
            score += rule.weight;
            signals.push(rule.label);
          }
        }
        const norm = item.text.trim().toLowerCase();
        if (norm.length >= 12 && (duplicateCounts.get(norm) ?? 0) >= 3) {
          score += 35;
          signals.push('duplicate_spam_burst');
        }
        if (score > 0) {
          const action =
            score >= 60
              ? 'ban_or_timeout_and_bulk_delete'
              : score >= 30
                ? 'timeout_and_delete'
                : 'review';
          flagged.push({
            id: item.id,
            author_id: item.author_id,
            score: Math.min(100, score),
            signals,
            recommended_action: action,
          });
        }
      }

      return dualResult({
        text: `Moderation scan checked ${items.length} item(s): ${flagged.length} flagged.`,
        data: { scanned: items.length, flagged_count: flagged.length, flagged },
      });
    },
  }),

  defineTool({
    name: 'intelligence_draft_response',
    category: 'intelligence',
    requiredPermissions: ['VIEW_CHANNEL', 'READ_MESSAGE_HISTORY'],
    description:
      'Inspect recent channel context and assemble a structured non-mutating reply brief & draft template for human or AI review before calling `messages_send`.',
    inputSchema: {
      channel_id: ChannelId,
      intent: z.string().min(3).max(500).describe('Goal of the response to draft'),
      tone: z.enum(['friendly', 'professional', 'concise', 'moderation']).optional(),
      context_limit: z.number().int().min(1).max(30).optional(),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const msgs = await ctx.rest.get<RawMsg[]>(FluxerRoutes.channelMessages(args.channel_id), {
        query: { limit: args.context_limit ?? 10 },
      });
      const latest = msgs[0];
      const tone = args.tone ?? 'professional';
      const draft = `[${tone.toUpperCase()} DRAFT] ${args.intent}`;
      return dualResult({
        text: `Prepared response draft for \`${args.channel_id}\` (replying after ${latest?.id ?? 'none'}). Review before sending with \`messages_send\`.`,
        data: {
          channel_id: args.channel_id,
          tone,
          latest_message_id: latest?.id ?? null,
          context_messages_reviewed: msgs.length,
          draft,
        },
      });
    },
  }),
];
