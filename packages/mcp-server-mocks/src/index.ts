import { HttpResponse, http } from 'msw';

export const FLUXER_MOCK_API_ORIGIN = 'https://api.fluxer.app';
export const FLUXER_MOCK_API_V1 = `${FLUXER_MOCK_API_ORIGIN}/v1`;

export function makeSnowflake(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return String(100000000000000000n + BigInt(h) * 977n);
}

export const MOCK_GUILD_ID = '999000999000999000';
export const MOCK_CHANNEL_ID = '111122223333444401';
export const MOCK_VOICE_CHANNEL_ID = '111122223333444403';
export const MOCK_FORUM_CHANNEL_ID = '111122223333444404';
export const MOCK_BOT_ID = '500000000000000001';
export const MOCK_USER_ID = '500000000000000002';
export const MOCK_MOD_ROLE_ID = '655826858834335716';
export const MOCK_WEBHOOK_ID = '164383424266383145';
export const MOCK_WEBHOOK_TOKEN = 'test_webhook_token_1234567890abcdef';

export function createFluxerHandlers(apiOrigin: string = FLUXER_MOCK_API_ORIGIN) {
  const v1 = `${apiOrigin.replace(/\/+$/, '')}/v1`;
  let nextSeq = 1;
  const nextId = () => String(700000000000000000n + BigInt(nextSeq++));

  return [
    // Instance Discovery (unversioned)
    http.get(`${apiOrigin.replace(/\/+$/, '')}/.well-known/fluxer`, () =>
      HttpResponse.json({
        api_code_version: 1,
        endpoints: {
          api: `${apiOrigin}/api`,
          api_public: `${apiOrigin}/api`,
          gateway: 'wss://gateway.fluxer.com',
          webapp: 'https://fluxer.app',
          invite: 'https://fluxer.gg',
        },
        features: {
          voice_enabled: true,
          discovery_enabled: true,
          self_hosted: apiOrigin !== FLUXER_MOCK_API_ORIGIN,
        },
        limits: {
          version: 2,
          rules: [
            { id: 'default', overrides: { max_message_length: 4000, max_guild_emojis: 500 } },
          ],
        },
      }),
    ),

    http.get(`${v1}/instance/badges`, () =>
      HttpResponse.json([{ id: 'verified', name: 'Verified Community' }]),
    ),

    http.get(`${v1}/gateway/bot`, () =>
      HttpResponse.json({
        url: 'wss://gateway.fluxer.com',
        shards: 1,
        session_start_limit: {
          total: 1000,
          remaining: 999,
          reset_after: 14400000,
          max_concurrency: 1,
        },
      }),
    ),

    // Application & Users
    http.get(`${v1}/applications/@me`, () =>
      HttpResponse.json({
        id: MOCK_BOT_ID,
        name: 'Fluxer MCP Test Bot',
        description: 'Automated test bot',
        bot_public: false,
        bot_require_code_grant: false,
      }),
    ),

    http.get(`${v1}/oauth2/applications/:id/public`, ({ params }) =>
      HttpResponse.json({ id: params.id, name: 'Public Fluxer App', bot_public: true }),
    ),

    http.get(`${v1}/users/@me`, () =>
      HttpResponse.json({
        id: MOCK_BOT_ID,
        username: 'fluxer-mcp-bot',
        discriminator: '0001',
        global_name: 'Fluxer MCP Bot',
        bot: true,
      }),
    ),

    http.patch(`${v1}/users/@me`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ id: MOCK_BOT_ID, username: 'fluxer-mcp-bot', ...body });
    }),

    http.get(`${v1}/users/@me/guilds`, () =>
      HttpResponse.json([{ id: MOCK_GUILD_ID, name: 'Fluxer Test Community', owner: false }]),
    ),

    http.delete(`${v1}/users/@me/guilds/:guildId`, () => new HttpResponse(null, { status: 204 })),

    http.get(`${v1}/users/@me/channels`, () =>
      HttpResponse.json([{ id: '888000000000000001', type: 1 }]),
    ),

    http.post(`${v1}/users/@me/channels`, async ({ request }) => {
      const body = (await request.json()) as { recipient_id?: string };
      return HttpResponse.json({
        id: '888000000000000001',
        type: 1,
        recipients: [{ id: body.recipient_id ?? MOCK_USER_ID }],
      });
    }),

    http.get(`${v1}/users/:userId/profile`, ({ params }) =>
      HttpResponse.json({ user: { id: params.userId, username: 'alice' }, bio: 'Fluxer user' }),
    ),

    http.get(`${v1}/users/:userId`, ({ params }) =>
      HttpResponse.json({ id: params.userId, username: 'alice', global_name: 'Alice', bot: false }),
    ),

    // Guild
    http.get(`${v1}/guilds/:guildId`, ({ params }) =>
      HttpResponse.json({
        id: params.guildId,
        name: 'Fluxer Test Community',
        icon: null,
        owner_id: MOCK_USER_ID,
        verification_level: 1,
        mfa_level: 0,
        explicit_content_filter: 1,
        default_message_notifications: 1,
        nsfw_level: 0,
        nsfw: false,
        content_warning_level: 0,
        splash_card_alignment: 0,
        system_channel_flags: 0,
        afk_timeout: 300,
        disabled_operations: 0,
        features: ['VANITY_URL', 'DISCOVERABLE'],
        badge_ids: [],
        member_count: 42,
      }),
    ),

    http.patch(`${v1}/guilds/:guildId`, async ({ params, request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ id: params.guildId, name: 'Fluxer Test Community', ...body });
    }),

    http.post(`${v1}/guilds/:guildId/delete`, () => new HttpResponse(null, { status: 204 })),

    http.get(`${v1}/guilds/:guildId/vanity-url`, () =>
      HttpResponse.json({ code: 'fluxer-test', uses: 12 }),
    ),

    http.patch(`${v1}/guilds/:guildId/vanity-url`, async ({ request }) => {
      const body = (await request.json()) as { code: string | null };
      return HttpResponse.json({ code: body.code, uses: 0 });
    }),

    // Audit Logs
    http.get(`${v1}/guilds/:guildId/audit-logs`, () =>
      HttpResponse.json({
        audit_log_entries: [
          {
            id: makeSnowflake('audit_1'),
            action_type: 22,
            user_id: MOCK_USER_ID,
            target_id: '500000000000000099',
            reason: 'Spam',
            changes: [],
          },
        ],
        users: [],
        webhooks: [],
        threads: [],
      }),
    ),

    // Roles
    http.get(`${v1}/guilds/:guildId/roles`, ({ params }) =>
      HttpResponse.json([
        {
          id: params.guildId,
          name: '@everyone',
          color: 0,
          position: 0,
          hoist_position: null,
          permissions: '104324673',
          hoist: false,
          mentionable: false,
          icon: null,
          unicode_emoji: null,
        },
        {
          id: MOCK_MOD_ROLE_ID,
          name: 'Moderator',
          color: 0x3498db,
          position: 5,
          hoist_position: 1,
          permissions: '8',
          hoist: true,
          mentionable: true,
          icon: null,
          unicode_emoji: null,
        },
      ]),
    ),

    http.post(`${v1}/guilds/:guildId/roles`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({
        id: nextId(),
        name: body.name ?? 'New Role',
        color: body.color ?? 0,
        position: 1,
        hoist_position: null,
        permissions: body.permissions ?? '0',
        hoist: Boolean(body.hoist),
        mentionable: Boolean(body.mentionable),
      });
    }),

    http.patch(`${v1}/guilds/:guildId/roles`, () => new HttpResponse(null, { status: 204 })),
    http.patch(
      `${v1}/guilds/:guildId/roles/hoist-positions`,
      () => new HttpResponse(null, { status: 204 }),
    ),
    http.delete(
      `${v1}/guilds/:guildId/roles/hoist-positions`,
      () => new HttpResponse(null, { status: 204 }),
    ),

    http.patch(`${v1}/guilds/:guildId/roles/:roleId`, async ({ params, request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ id: params.roleId, name: 'Updated Role', ...body });
    }),

    http.delete(
      `${v1}/guilds/:guildId/roles/:roleId`,
      () => new HttpResponse(null, { status: 204 }),
    ),

    // Channels & Forum Tags & Threads
    http.get(`${v1}/guilds/:guildId/channels`, ({ params }) =>
      HttpResponse.json([
        {
          id: MOCK_CHANNEL_ID,
          guild_id: params.guildId,
          name: 'general',
          type: 0,
          position: 0,
          parent_id: null,
          nsfw: false,
          permission_overwrites: [],
        },
        {
          id: MOCK_VOICE_CHANNEL_ID,
          guild_id: params.guildId,
          name: 'voice-lobby',
          type: 2,
          position: 1,
          parent_id: null,
          permission_overwrites: [],
        },
        {
          id: MOCK_FORUM_CHANNEL_ID,
          guild_id: params.guildId,
          name: 'help-forum',
          type: 15,
          position: 2,
          parent_id: null,
          available_tags: [{ id: '300000000000000001', name: 'Question', moderated: false }],
          permission_overwrites: [],
        },
      ]),
    ),

    http.post(`${v1}/guilds/:guildId/channels`, async ({ params, request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({
        id: nextId(),
        guild_id: params.guildId,
        name: body.name ?? 'new-channel',
        type: body.type ?? 0,
        parent_id: body.parent_id ?? null,
        ...body,
      });
    }),

    http.patch(`${v1}/guilds/:guildId/channels`, () => new HttpResponse(null, { status: 204 })),

    http.get(`${v1}/channels/:channelId`, ({ params }) =>
      HttpResponse.json({
        id: params.channelId,
        guild_id: MOCK_GUILD_ID,
        name: 'general',
        type: 0,
        position: 0,
        parent_id: null,
        topic: 'Main discussion',
        rate_limit_per_user: 0,
        permission_overwrites: [],
      }),
    ),

    http.patch(`${v1}/channels/:channelId`, async ({ params, request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({
        id: params.channelId,
        guild_id: MOCK_GUILD_ID,
        name: 'general',
        ...body,
      });
    }),

    http.delete(`${v1}/channels/:channelId`, () => new HttpResponse(null, { status: 204 })),
    http.put(
      `${v1}/channels/:channelId/permissions/:overwriteId`,
      () => new HttpResponse(null, { status: 204 }),
    ),
    http.delete(
      `${v1}/channels/:channelId/permissions/:overwriteId`,
      () => new HttpResponse(null, { status: 204 }),
    ),
    http.post(`${v1}/channels/:channelId/typing`, () => new HttpResponse(null, { status: 204 })),
    http.get(`${v1}/channels/:channelId/slowmode`, () =>
      HttpResponse.json({
        rate_limit_per_user: 5,
        retry_after_ms: 0,
        next_send_allowed_at: null,
        can_bypass: true,
      }),
    ),
    http.post(`${v1}/channels/:channelId/followers`, ({ params }) =>
      HttpResponse.json({ channel_id: params.channelId, webhook_id: MOCK_WEBHOOK_ID }),
    ),
    http.get(`${v1}/channels/:channelId/follower-stats`, () =>
      HttpResponse.json({ follower_count: 14 }),
    ),
    http.post(`${v1}/channels/:channelId/tags`, async ({ params, request }) => {
      const body = (await request.json()) as { name: string };
      return HttpResponse.json({
        id: params.channelId,
        available_tags: [{ id: nextId(), name: body.name, moderated: false }],
      });
    }),
    http.put(`${v1}/channels/:channelId/tags/:tagId`, async ({ params, request }) => {
      const body = (await request.json()) as { name: string };
      return HttpResponse.json({
        id: params.channelId,
        updated_tag: { id: params.tagId, name: body.name },
      });
    }),
    http.delete(
      `${v1}/channels/:channelId/tags/:tagId`,
      () => new HttpResponse(null, { status: 204 }),
    ),
    http.post(`${v1}/channels/:channelId/post-data`, () => HttpResponse.json({ threads: {} })),
    http.post(`${v1}/channels/:channelId/threads`, async ({ params, request }) => {
      const body = (await request.json()) as { name?: string };
      return HttpResponse.json({
        id: nextId(),
        guild_id: MOCK_GUILD_ID,
        parent_id: params.channelId,
        type: 11,
        name: body.name ?? 'Thread',
      });
    }),
    http.get(`${v1}/guilds/:guildId/threads/active`, () =>
      HttpResponse.json({ threads: [], members: [] }),
    ),
    http.get(`${v1}/channels/:channelId/threads/archived/public`, () =>
      HttpResponse.json({ threads: [], has_more: false }),
    ),
    http.get(`${v1}/channels/:channelId/threads/archived/private`, () =>
      HttpResponse.json({ threads: [], has_more: false }),
    ),
    http.get(`${v1}/channels/:channelId/users/@me/threads/archived/private`, () =>
      HttpResponse.json({ threads: [], has_more: false }),
    ),
    http.get(`${v1}/channels/:channelId/threads/search`, () =>
      HttpResponse.json({ threads: [], total_results: 0 }),
    ),
    http.put(
      `${v1}/channels/:channelId/thread-members/@me`,
      () => new HttpResponse(null, { status: 204 }),
    ),
    http.delete(
      `${v1}/channels/:channelId/thread-members/@me`,
      () => new HttpResponse(null, { status: 204 }),
    ),
    http.put(
      `${v1}/channels/:channelId/thread-members/:userId`,
      () => new HttpResponse(null, { status: 204 }),
    ),
    http.delete(
      `${v1}/channels/:channelId/thread-members/:userId`,
      () => new HttpResponse(null, { status: 204 }),
    ),
    http.get(`${v1}/channels/:channelId/thread-members/:userId`, ({ params }) =>
      HttpResponse.json({
        id: params.channelId,
        user_id: params.userId,
        join_timestamp: '2026-01-01T00:00:00Z',
        flags: 0,
      }),
    ),
    http.get(`${v1}/channels/:channelId/thread-members`, ({ params }) =>
      HttpResponse.json([
        {
          id: params.channelId,
          user_id: MOCK_USER_ID,
          join_timestamp: '2026-01-01T00:00:00Z',
          flags: 0,
        },
      ]),
    ),

    // Messages, Pins, Reactions, Search
    http.post(`${v1}/channels/:channelId/messages`, async ({ params, request }) => {
      const body = (await request.json()) as { content?: string };
      return HttpResponse.json({
        id: nextId(),
        channel_id: params.channelId,
        guild_id: MOCK_GUILD_ID,
        content: body.content ?? '',
        timestamp: '2026-11-24T00:00:00.000Z',
        author: { id: MOCK_BOT_ID, username: 'fluxer-mcp-bot', bot: true },
      });
    }),
    http.get(`${v1}/channels/:channelId/messages`, ({ params }) =>
      HttpResponse.json([
        {
          id: makeSnowflake('msg_1'),
          channel_id: params.channelId,
          content: 'Hello Fluxer community!',
          timestamp: '2026-11-24T00:00:00.000Z',
          author: { id: MOCK_USER_ID, username: 'alice', bot: false },
        },
      ]),
    ),
    http.get(`${v1}/channels/:channelId/messages/pins`, () =>
      HttpResponse.json({
        items: [{ id: makeSnowflake('pin_1'), content: 'Pinned welcome message' }],
        has_more: false,
      }),
    ),
    http.put(
      `${v1}/channels/:channelId/pins/:messageId`,
      () => new HttpResponse(null, { status: 204 }),
    ),
    http.delete(
      `${v1}/channels/:channelId/pins/:messageId`,
      () => new HttpResponse(null, { status: 204 }),
    ),
    http.post(
      `${v1}/channels/:channelId/messages/bulk-delete`,
      () => new HttpResponse(null, { status: 204 }),
    ),
    http.get(`${v1}/channels/:channelId/messages/:messageId`, ({ params }) =>
      HttpResponse.json({
        id: params.messageId,
        channel_id: params.channelId,
        content: 'Sample message',
        timestamp: '2026-11-24T00:00:00.000Z',
        author: { id: MOCK_USER_ID, username: 'alice' },
      }),
    ),
    http.patch(`${v1}/channels/:channelId/messages/:messageId`, async ({ params, request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({
        id: params.messageId,
        channel_id: params.channelId,
        edited_timestamp: '2026-11-24T01:00:00.000Z',
        ...body,
      });
    }),
    http.delete(
      `${v1}/channels/:channelId/messages/:messageId`,
      () => new HttpResponse(null, { status: 204 }),
    ),
    http.post(`${v1}/channels/:channelId/messages/:messageId/crosspost`, ({ params }) =>
      HttpResponse.json({ id: params.messageId, channel_id: params.channelId, flags: 1 }),
    ),
    http.get(`${v1}/channels/:channelId/messages/:messageId/crosspost-source`, () =>
      HttpResponse.json({ guild_id: MOCK_GUILD_ID, channel_id: MOCK_CHANNEL_ID }),
    ),
    http.post(
      `${v1}/channels/:channelId/messages/:messageId/threads`,
      async ({ params, request }) => {
        const body = (await request.json()) as { name?: string };
        return HttpResponse.json({
          id: nextId(),
          parent_id: params.channelId,
          type: 11,
          name: body.name ?? 'Thread',
        });
      },
    ),
    http.delete(
      `${v1}/channels/:channelId/messages/:messageId/attachments/:attachmentId`,
      () => new HttpResponse(null, { status: 204 }),
    ),
    http.post(`${v1}/attachments/refresh-urls`, async ({ request }) => {
      const body = (await request.json()) as { attachment_urls: string[] };
      return HttpResponse.json({
        refreshed_urls: body.attachment_urls.map((u) => ({ original: u, refreshed: u })),
      });
    }),
    http.post(`${v1}/search/messages`, () =>
      HttpResponse.json({
        total: 1,
        messages: [[{ id: makeSnowflake('hit_1'), content: 'Fluxer search match' }]],
      }),
    ),

    // Reactions
    http.put(
      `${v1}/channels/:channelId/messages/:messageId/reactions/:emoji/@me`,
      () => new HttpResponse(null, { status: 204 }),
    ),
    http.delete(
      `${v1}/channels/:channelId/messages/:messageId/reactions/:emoji/@me`,
      () => new HttpResponse(null, { status: 204 }),
    ),
    http.delete(
      `${v1}/channels/:channelId/messages/:messageId/reactions/:emoji/:userId`,
      () => new HttpResponse(null, { status: 204 }),
    ),
    http.delete(
      `${v1}/channels/:channelId/messages/:messageId/reactions/:emoji`,
      () => new HttpResponse(null, { status: 204 }),
    ),
    http.delete(
      `${v1}/channels/:channelId/messages/:messageId/reactions`,
      () => new HttpResponse(null, { status: 204 }),
    ),
    http.get(`${v1}/channels/:channelId/messages/:messageId/reactions/:emoji`, () =>
      HttpResponse.json([{ id: MOCK_USER_ID, username: 'alice' }]),
    ),

    // Members & Bans
    http.get(`${v1}/guilds/:guildId/members`, () =>
      HttpResponse.json([
        {
          user: { id: MOCK_USER_ID, username: 'alice' },
          roles: [MOCK_MOD_ROLE_ID],
          joined_at: '2026-01-01T00:00:00Z',
          mute: false,
          deaf: false,
        },
      ]),
    ),
    http.post(`${v1}/guilds/:guildId/members-search`, ({ params }) =>
      HttpResponse.json({
        guild_id: params.guildId,
        members: [{ member: { user: { id: MOCK_USER_ID, username: 'alice' }, roles: [] } }],
        page_result_count: 1,
        total_result_count: 1,
        indexing: false,
      }),
    ),
    http.get(`${v1}/guilds/:guildId/members/@me`, () =>
      HttpResponse.json({
        user: { id: MOCK_BOT_ID, username: 'fluxer-mcp-bot' },
        roles: [MOCK_MOD_ROLE_ID],
        mute: false,
        deaf: false,
      }),
    ),
    http.patch(`${v1}/guilds/:guildId/members/@me`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ user: { id: MOCK_BOT_ID }, ...body });
    }),
    http.get(`${v1}/guilds/:guildId/members/:userId`, ({ params }) =>
      HttpResponse.json({
        user: { id: params.userId, username: 'alice' },
        roles: [MOCK_MOD_ROLE_ID],
        joined_at: '2026-01-01T00:00:00Z',
        mute: false,
        deaf: false,
      }),
    ),
    http.patch(`${v1}/guilds/:guildId/members/:userId`, async ({ params, request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ user: { id: params.userId }, ...body });
    }),
    http.delete(
      `${v1}/guilds/:guildId/members/:userId`,
      () => new HttpResponse(null, { status: 204 }),
    ),
    http.put(
      `${v1}/guilds/:guildId/members/:userId/roles/:roleId`,
      () => new HttpResponse(null, { status: 204 }),
    ),
    http.delete(
      `${v1}/guilds/:guildId/members/:userId/roles/:roleId`,
      () => new HttpResponse(null, { status: 204 }),
    ),
    http.get(`${v1}/guilds/:guildId/bans`, () =>
      HttpResponse.json([
        {
          user: { id: '500000000000000099', username: 'spammer' },
          reason: 'Raid',
          moderator_id: MOCK_USER_ID,
          banned_at: '2026-01-01T00:00:00Z',
          expires_at: null,
        },
      ]),
    ),
    http.get(`${v1}/guilds/:guildId/bans/:userId`, ({ params }) =>
      HttpResponse.json({
        user: { id: params.userId, username: 'spammer' },
        reason: 'Raid',
        moderator_id: MOCK_USER_ID,
        banned_at: '2026-01-01T00:00:00Z',
        expires_at: null,
      }),
    ),
    http.put(`${v1}/guilds/:guildId/bans/:userId`, () => new HttpResponse(null, { status: 204 })),
    http.delete(
      `${v1}/guilds/:guildId/bans/:userId`,
      () => new HttpResponse(null, { status: 204 }),
    ),

    // Invites
    http.get(`${v1}/guilds/:guildId/invites`, () =>
      HttpResponse.json([
        { code: 'flux123', uses: 3, max_uses: 0, max_age: 86400, temporary: false },
      ]),
    ),
    http.get(`${v1}/channels/:channelId/invites`, () =>
      HttpResponse.json([{ code: 'flux123', uses: 3, max_uses: 0, max_age: 86400 }]),
    ),
    http.post(`${v1}/channels/:channelId/invites`, () =>
      HttpResponse.json({ code: 'newinv99', temporary: false, type: 0 }),
    ),
    http.get(`${v1}/invites/:code`, ({ params }) =>
      HttpResponse.json({ code: params.code, temporary: false, type: 0, member_count: 42 }),
    ),
    http.delete(`${v1}/invites/:code`, () => new HttpResponse(null, { status: 204 })),

    // Emojis & Stickers
    http.get(`${v1}/guilds/:guildId/emojis`, () =>
      HttpResponse.json([
        { id: makeSnowflake('emoji_1'), name: 'fluxer_wave', animated: false, nsfw: false },
      ]),
    ),
    http.post(`${v1}/guilds/:guildId/emojis`, async ({ request }) => {
      const body = (await request.json()) as { name: string };
      return HttpResponse.json({ id: nextId(), name: body.name, animated: false, nsfw: false });
    }),
    http.post(`${v1}/guilds/:guildId/emojis/bulk`, () => HttpResponse.json({ emojis: [] })),
    http.post(`${v1}/guilds/:guildId/emojis/clone`, () =>
      HttpResponse.json({ id: nextId(), name: 'cloned_emoji', animated: false, nsfw: false }),
    ),
    http.patch(`${v1}/guilds/:guildId/emojis/:emojiId`, async ({ params, request }) => {
      const body = (await request.json()) as { name: string };
      return HttpResponse.json({ id: params.emojiId, name: body.name });
    }),
    http.delete(
      `${v1}/guilds/:guildId/emojis/:emojiId`,
      () => new HttpResponse(null, { status: 204 }),
    ),
    http.get(`${v1}/emojis/:emojiId/metadata`, ({ params }) =>
      HttpResponse.json({ id: params.emojiId, name: 'fluxer_wave' }),
    ),
    http.get(`${v1}/emojis/:emojiId/source`, () =>
      HttpResponse.json({ id: MOCK_GUILD_ID, name: 'Fluxer Test Community' }),
    ),

    http.get(`${v1}/guilds/:guildId/stickers`, () =>
      HttpResponse.json([
        {
          id: makeSnowflake('sticker_1'),
          name: 'hello',
          description: '',
          tags: ['hi'],
          animated: false,
          nsfw: false,
        },
      ]),
    ),
    http.post(`${v1}/guilds/:guildId/stickers`, async ({ request }) => {
      const body = (await request.json()) as { name: string };
      return HttpResponse.json({ id: nextId(), name: body.name, animated: false, nsfw: false });
    }),
    http.post(`${v1}/guilds/:guildId/stickers/bulk`, () => HttpResponse.json({ stickers: [] })),
    http.post(`${v1}/guilds/:guildId/stickers/clone`, () =>
      HttpResponse.json({ id: nextId(), name: 'cloned_sticker', animated: false, nsfw: false }),
    ),
    http.patch(`${v1}/guilds/:guildId/stickers/:stickerId`, async ({ params, request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ id: params.stickerId, ...body });
    }),
    http.delete(
      `${v1}/guilds/:guildId/stickers/:stickerId`,
      () => new HttpResponse(null, { status: 204 }),
    ),
    http.get(`${v1}/stickers/:stickerId/metadata`, ({ params }) =>
      HttpResponse.json({ id: params.stickerId, name: 'hello' }),
    ),
    http.get(`${v1}/stickers/:stickerId/source`, () =>
      HttpResponse.json({ id: MOCK_GUILD_ID, name: 'Fluxer Test Community' }),
    ),

    // Discovery
    http.get(`${v1}/discovery/categories`, () =>
      HttpResponse.json([
        { id: 1, name: 'Gaming' },
        { id: 2, name: 'Technology' },
      ]),
    ),
    http.get(`${v1}/discovery/guilds`, () =>
      HttpResponse.json({
        guilds: [{ id: MOCK_GUILD_ID, name: 'Fluxer Test Community' }],
        total: 1,
      }),
    ),
    http.get(`${v1}/guilds/:guildId/discovery`, () =>
      HttpResponse.json({ eligible: true, min_member_count: 50, application: null }),
    ),
    http.post(`${v1}/guilds/:guildId/discovery`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ status: 'pending', ...body });
    }),
    http.patch(`${v1}/guilds/:guildId/discovery`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ status: 'updated', ...body });
    }),
    http.delete(`${v1}/guilds/:guildId/discovery`, () => new HttpResponse(null, { status: 204 })),

    // Webhooks
    http.get(`${v1}/channels/:channelId/webhooks`, ({ params }) =>
      HttpResponse.json([
        {
          id: MOCK_WEBHOOK_ID,
          channel_id: params.channelId,
          guild_id: MOCK_GUILD_ID,
          name: 'CI Hook',
          type: 1,
        },
      ]),
    ),
    http.get(`${v1}/guilds/:guildId/webhooks`, ({ params }) =>
      HttpResponse.json([
        {
          id: MOCK_WEBHOOK_ID,
          channel_id: MOCK_CHANNEL_ID,
          guild_id: params.guildId,
          name: 'CI Hook',
          type: 1,
        },
      ]),
    ),
    http.post(`${v1}/channels/:channelId/webhooks`, async ({ params, request }) => {
      const body = (await request.json()) as { name: string };
      return HttpResponse.json({
        id: nextId(),
        channel_id: params.channelId,
        name: body.name,
        token: MOCK_WEBHOOK_TOKEN,
        type: 1,
      });
    }),
    http.get(`${v1}/webhooks/:webhookId`, ({ params }) =>
      HttpResponse.json({
        id: params.webhookId,
        channel_id: MOCK_CHANNEL_ID,
        name: 'CI Hook',
        type: 1,
      }),
    ),
    http.patch(`${v1}/webhooks/:webhookId`, async ({ params, request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ id: params.webhookId, ...body });
    }),
    http.delete(`${v1}/webhooks/:webhookId`, () => new HttpResponse(null, { status: 204 })),
    http.get(`${v1}/webhooks/:webhookId/:token`, ({ params }) =>
      HttpResponse.json({ id: params.webhookId, name: 'CI Hook', type: 1 }),
    ),
    http.patch(`${v1}/webhooks/:webhookId/:token`, async ({ params, request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ id: params.webhookId, ...body });
    }),
    http.delete(`${v1}/webhooks/:webhookId/:token`, () => new HttpResponse(null, { status: 204 })),
    http.post(`${v1}/webhooks/:webhookId/:token`, () =>
      HttpResponse.json({ id: nextId(), channel_id: MOCK_CHANNEL_ID, content: 'Webhook sent' }),
    ),
    http.post(
      `${v1}/webhooks/:webhookId/:token/github`,
      () => new HttpResponse(null, { status: 204 }),
    ),
    http.post(
      `${v1}/webhooks/:webhookId/:token/slack`,
      () => new HttpResponse(null, { status: 204 }),
    ),
    http.post(
      `${v1}/webhooks/:webhookId/:token/instatus`,
      () => new HttpResponse(null, { status: 204 }),
    ),
    http.post(
      `${v1}/webhooks/:webhookId/:token/libredesk`,
      () => new HttpResponse(null, { status: 204 }),
    ),
    http.get(`${v1}/webhooks/:webhookId/:token/messages/:messageId`, ({ params }) =>
      HttpResponse.json({ id: params.messageId, content: 'Webhook msg' }),
    ),
    http.patch(
      `${v1}/webhooks/:webhookId/:token/messages/:messageId`,
      async ({ params, request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: params.messageId, ...body });
      },
    ),
    http.delete(
      `${v1}/webhooks/:webhookId/:token/messages/:messageId`,
      () => new HttpResponse(null, { status: 204 }),
    ),
  ];
}

export const fluxerHandlers = createFluxerHandlers();
