/**
 * Verified Fluxer API v1 constants, permission bitfields, channel types,
 * guild enums, audit log actions, gateway opcodes, error codes, and REST routes.
 *
 * Sourced directly from:
 * - https://api.fluxer.app/v1/openapi.json (OpenAPI 3.1.0)
 * - https://github.com/fluxerapp/fluxer/tree/main/packages/constants/src
 */

export const FLUXER_DEFAULT_API_URL = 'https://api.fluxer.app';
export const FLUXER_DEFAULT_API_VERSION = '1';
export const FLUXER_DEFAULT_WEBAPP_URL = 'https://fluxer.app';

/**
 * Complete Fluxer permission flags (37 core bits + 4 thread bits).
 * All permission bitfields MUST be serialized as base-10 strings over REST.
 */
export const FLUXER_PERMISSIONS = {
  CREATE_INSTANT_INVITE: 1n << 0n,
  KICK_MEMBERS: 1n << 1n,
  BAN_MEMBERS: 1n << 2n,
  ADMINISTRATOR: 1n << 3n,
  MANAGE_CHANNELS: 1n << 4n,
  MANAGE_GUILD: 1n << 5n,
  ADD_REACTIONS: 1n << 6n,
  VIEW_AUDIT_LOG: 1n << 7n,
  PRIORITY_SPEAKER: 1n << 8n,
  STREAM: 1n << 9n,
  VIEW_CHANNEL: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
  SEND_TTS_MESSAGES: 1n << 12n,
  MANAGE_MESSAGES: 1n << 13n,
  EMBED_LINKS: 1n << 14n,
  ATTACH_FILES: 1n << 15n,
  READ_MESSAGE_HISTORY: 1n << 16n,
  MENTION_EVERYONE: 1n << 17n,
  USE_EXTERNAL_EMOJIS: 1n << 18n,
  CONNECT: 1n << 20n,
  SPEAK: 1n << 21n,
  MUTE_MEMBERS: 1n << 22n,
  DEAFEN_MEMBERS: 1n << 23n,
  MOVE_MEMBERS: 1n << 24n,
  USE_VAD: 1n << 25n,
  CHANGE_NICKNAME: 1n << 26n,
  MANAGE_NICKNAMES: 1n << 27n,
  MANAGE_ROLES: 1n << 28n,
  MANAGE_WEBHOOKS: 1n << 29n,
  MANAGE_EXPRESSIONS: 1n << 30n,
  MANAGE_THREADS: 1n << 34n,
  CREATE_PUBLIC_THREADS: 1n << 35n,
  CREATE_PRIVATE_THREADS: 1n << 36n,
  USE_EXTERNAL_STICKERS: 1n << 37n,
  SEND_MESSAGES_IN_THREADS: 1n << 38n,
  MODERATE_MEMBERS: 1n << 40n,
  CREATE_EXPRESSIONS: 1n << 43n,
  PIN_MESSAGES: 1n << 51n,
  BYPASS_SLOWMODE: 1n << 52n,
  UPDATE_RTC_REGION: 1n << 53n,
  VIEW_CHANNEL_MEMBERS: 1n << 54n,
} as const;

export type FluxerPermissionName = keyof typeof FLUXER_PERMISSIONS;

export const FLUXER_PERMISSION_NAMES = Object.keys(FLUXER_PERMISSIONS) as FluxerPermissionName[];

export const ALL_FLUXER_PERMISSIONS: bigint = Object.values(FLUXER_PERMISSIONS).reduce(
  (acc, bit) => acc | bit,
  0n,
);

export const DEFAULT_FLUXER_PERMISSIONS: bigint =
  FLUXER_PERMISSIONS.CREATE_INSTANT_INVITE |
  FLUXER_PERMISSIONS.ADD_REACTIONS |
  FLUXER_PERMISSIONS.STREAM |
  FLUXER_PERMISSIONS.VIEW_CHANNEL |
  FLUXER_PERMISSIONS.SEND_MESSAGES |
  FLUXER_PERMISSIONS.EMBED_LINKS |
  FLUXER_PERMISSIONS.ATTACH_FILES |
  FLUXER_PERMISSIONS.READ_MESSAGE_HISTORY |
  FLUXER_PERMISSIONS.USE_EXTERNAL_EMOJIS |
  FLUXER_PERMISSIONS.CONNECT |
  FLUXER_PERMISSIONS.SPEAK |
  FLUXER_PERMISSIONS.USE_VAD |
  FLUXER_PERMISSIONS.CHANGE_NICKNAME |
  FLUXER_PERMISSIONS.USE_EXTERNAL_STICKERS |
  FLUXER_PERMISSIONS.VIEW_CHANNEL_MEMBERS |
  FLUXER_PERMISSIONS.CREATE_PUBLIC_THREADS |
  FLUXER_PERMISSIONS.SEND_MESSAGES_IN_THREADS;

export const ELEVATED_FLUXER_PERMISSIONS: readonly FluxerPermissionName[] = [
  'ADMINISTRATOR',
  'MANAGE_GUILD',
  'MANAGE_ROLES',
  'MANAGE_CHANNELS',
  'MANAGE_WEBHOOKS',
  'BAN_MEMBERS',
  'KICK_MEMBERS',
  'MODERATE_MEMBERS',
  'MANAGE_MESSAGES',
  'MANAGE_THREADS',
  'MANAGE_EXPRESSIONS',
  'MANAGE_NICKNAMES',
  'MENTION_EVERYONE',
  'VIEW_AUDIT_LOG',
] as const;

export const CRITICAL_EVERYONE_PERMISSIONS: readonly FluxerPermissionName[] = [
  'ADMINISTRATOR',
  'MANAGE_GUILD',
  'MANAGE_ROLES',
  'MANAGE_CHANNELS',
  'MANAGE_WEBHOOKS',
  'BAN_MEMBERS',
  'KICK_MEMBERS',
  'MODERATE_MEMBERS',
  'MANAGE_MESSAGES',
  'MANAGE_THREADS',
  'MANAGE_EXPRESSIONS',
  'MENTION_EVERYONE',
  'VIEW_AUDIT_LOG',
] as const;

/** Exact Fluxer channel types from fluxerapp/fluxer ChannelConstants.ts */
export const FLUXER_CHANNEL_TYPES = {
  GUILD_TEXT: 0,
  DM: 1,
  GUILD_VOICE: 2,
  GROUP_DM: 3,
  GUILD_CATEGORY: 4,
  GUILD_ANNOUNCEMENT: 5,
  ANNOUNCEMENT_THREAD: 10,
  PUBLIC_THREAD: 11,
  PRIVATE_THREAD: 12,
  GUILD_FORUM: 15,
  GUILD_MEDIA: 16,
  GUILD_LINK: 998,
  DM_PERSONAL_NOTES: 999,
} as const;

export type FluxerChannelType = (typeof FLUXER_CHANNEL_TYPES)[keyof typeof FLUXER_CHANNEL_TYPES];

export const FLUXER_CHANNEL_TYPE_VALUES = [
  0, 1, 2, 3, 4, 5, 10, 11, 12, 15, 16, 998, 999,
] as const;

export const FLUXER_GUILD_CREATABLE_CHANNEL_TYPES = [0, 2, 4, 5, 15, 16, 998] as const;

export const FLUXER_THREAD_CHANNEL_TYPES = new Set<number>([
  FLUXER_CHANNEL_TYPES.ANNOUNCEMENT_THREAD,
  FLUXER_CHANNEL_TYPES.PUBLIC_THREAD,
  FLUXER_CHANNEL_TYPES.PRIVATE_THREAD,
]);

export const FLUXER_CHANNEL_TYPE_NAMES: Readonly<Record<number, string>> = {
  0: 'GUILD_TEXT',
  1: 'DM',
  2: 'GUILD_VOICE',
  3: 'GROUP_DM',
  4: 'GUILD_CATEGORY',
  5: 'GUILD_ANNOUNCEMENT',
  10: 'ANNOUNCEMENT_THREAD',
  11: 'PUBLIC_THREAD',
  12: 'PRIVATE_THREAD',
  15: 'GUILD_FORUM',
  16: 'GUILD_MEDIA',
  998: 'GUILD_LINK',
  999: 'DM_PERSONAL_NOTES',
};

export const GUILD_VERIFICATION_LEVEL = {
  NONE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
} as const;

export const GUILD_MFA_LEVEL = {
  NONE: 0,
  ELEVATED: 1,
} as const;

export const GUILD_EXPLICIT_CONTENT_FILTER = {
  DISABLED: 0,
  MEMBERS_WITHOUT_ROLES: 1,
  ALL_MEMBERS: 2,
} as const;

export const GUILD_NSFW_LEVEL = {
  SAFE: 0,
  AGE_RESTRICTED: 3,
} as const;

export const GUILD_SPLASH_CARD_ALIGNMENT = {
  CENTER: 0,
  LEFT: 1,
  RIGHT: 2,
} as const;

export const CONTENT_WARNING_LEVEL = {
  INHERIT: 0,
  CONTENT_WARNING: 1,
} as const;

export const SYSTEM_CHANNEL_FLAGS = {
  SUPPRESS_JOIN_NOTIFICATIONS: 1 << 0,
} as const;

export const GUILD_OPERATIONS = {
  PUSH_NOTIFICATIONS: 1 << 0,
  EVERYONE_MENTIONS: 1 << 1,
  TYPING_EVENTS: 1 << 2,
  INSTANT_INVITES: 1 << 3,
  SEND_MESSAGE: 1 << 4,
  REACTIONS: 1 << 5,
  MEMBER_LIST_UPDATES: 1 << 6,
} as const;

export const MESSAGE_FLAGS = {
  CROSSPOSTED: 1 << 0,
  IS_CROSSPOST: 1 << 1,
  SUPPRESS_EMBEDS: 1 << 2,
  SOURCE_MESSAGE_DELETED: 1 << 3,
  SUPPRESS_NOTIFICATIONS: 1 << 12,
  VOICE_MESSAGE: 1 << 13,
} as const;

export const JOIN_SOURCE_TYPES = {
  CREATOR: 0,
  INSTANT_INVITE: 1,
  VANITY_URL: 2,
  BOT_INVITE: 3,
  ADMIN_FORCE_ADD: 4,
  DISCOVERY: 6,
} as const;

/** Exact Fluxer AuditLogActionType values from fluxerapp/fluxer */
export const AUDIT_LOG_ACTION_TYPE = {
  GUILD_UPDATE: 1,
  CHANNEL_CREATE: 10,
  CHANNEL_UPDATE: 11,
  CHANNEL_DELETE: 12,
  CHANNEL_OVERWRITE_CREATE: 13,
  CHANNEL_OVERWRITE_UPDATE: 14,
  CHANNEL_OVERWRITE_DELETE: 15,
  MEMBER_KICK: 20,
  MEMBER_PRUNE: 21,
  MEMBER_BAN_ADD: 22,
  MEMBER_BAN_REMOVE: 23,
  MEMBER_UPDATE: 24,
  MEMBER_ROLE_UPDATE: 25,
  MEMBER_MOVE: 26,
  MEMBER_DISCONNECT: 27,
  BOT_ADD: 28,
  ROLE_CREATE: 30,
  ROLE_UPDATE: 31,
  ROLE_DELETE: 32,
  INVITE_CREATE: 40,
  INVITE_UPDATE: 41,
  INVITE_DELETE: 42,
  WEBHOOK_CREATE: 50,
  WEBHOOK_UPDATE: 51,
  WEBHOOK_DELETE: 52,
  EMOJI_CREATE: 60,
  EMOJI_UPDATE: 61,
  EMOJI_DELETE: 62,
  MESSAGE_DELETE: 72,
  MESSAGE_BULK_DELETE: 73,
  MESSAGE_PIN: 74,
  MESSAGE_UNPIN: 75,
  STICKER_CREATE: 90,
  STICKER_UPDATE: 91,
  STICKER_DELETE: 92,
  THREAD_CREATE: 110,
  THREAD_UPDATE: 111,
  THREAD_DELETE: 112,
} as const;

export const AUDIT_LOG_ACTION_NAMES: Readonly<Record<number, string>> = Object.fromEntries(
  Object.entries(AUDIT_LOG_ACTION_TYPE).map(([k, v]) => [v, k]),
);

export const GATEWAY_OPCODES = {
  DISPATCH: 0,
  HEARTBEAT: 1,
  IDENTIFY: 2,
  PRESENCE_UPDATE: 3,
  VOICE_STATE_UPDATE: 4,
  VOICE_SERVER_PING: 5,
  RESUME: 6,
  RECONNECT: 7,
  REQUEST_GUILD_MEMBERS: 8,
  INVALID_SESSION: 9,
  HELLO: 10,
  HEARTBEAT_ACK: 11,
  GATEWAY_ERROR: 12,
  VOICE_SIGNAL: 13,
  LAZY_REQUEST: 14,
  REQUEST_GUILD_COUNTS: 15,
  REQUEST_CHANNEL_MEMBER_COUNTS: 16,
  REQUEST_FORUM_UNREADS: 28,
} as const;

export const GATEWAY_IDENTIFY_FLAGS = {
  DEBOUNCE_MESSAGE_REACTIONS: 1 << 1,
  CHANNEL_THREADS: 1 << 2,
  GUILD_VISITS: 1 << 3,
} as const;

export const THREAD_AUTO_ARCHIVE_DURATIONS = [60, 1440, 4320, 10080] as const;

/**
 * Complete verified Fluxer API v1 REST route builders.
 * Every route matches https://api.fluxer.app/v1/openapi.json.
 */
export const FluxerRoutes = {
  // Instance & Gateway
  instanceDiscovery: () => '/.well-known/fluxer' as const,
  instanceBadges: () => '/instance/badges' as const,
  gatewayBot: () => '/gateway/bot' as const,

  // Applications / OAuth2
  currentApplication: () => '/applications/@me' as const,
  publicApplication: (id: string) => `/oauth2/applications/${id}/public` as const,

  // Guilds
  guild: (guildId: string) => `/guilds/${guildId}` as const,
  guildDelete: (guildId: string) => `/guilds/${guildId}/delete` as const,
  guildAuditLogs: (guildId: string) => `/guilds/${guildId}/audit-logs` as const,
  guildBans: (guildId: string) => `/guilds/${guildId}/bans` as const,
  guildBan: (guildId: string, userId: string) => `/guilds/${guildId}/bans/${userId}` as const,
  guildChannels: (guildId: string) => `/guilds/${guildId}/channels` as const,
  guildInvites: (guildId: string) => `/guilds/${guildId}/invites` as const,
  guildVanityUrl: (guildId: string) => `/guilds/${guildId}/vanity-url` as const,
  guildWebhooks: (guildId: string) => `/guilds/${guildId}/webhooks` as const,
  guildActiveThreads: (guildId: string) => `/guilds/${guildId}/threads/active` as const,

  // Guild Roles
  guildRoles: (guildId: string) => `/guilds/${guildId}/roles` as const,
  guildRole: (guildId: string, roleId: string) => `/guilds/${guildId}/roles/${roleId}` as const,
  guildRoleHoistPositions: (guildId: string) => `/guilds/${guildId}/roles/hoist-positions` as const,

  // Guild Members
  guildMembers: (guildId: string) => `/guilds/${guildId}/members` as const,
  guildMembersSearch: (guildId: string) => `/guilds/${guildId}/members-search` as const,
  guildMemberMe: (guildId: string) => `/guilds/${guildId}/members/@me` as const,
  guildMember: (guildId: string, userId: string) => `/guilds/${guildId}/members/${userId}` as const,
  guildMemberRole: (guildId: string, userId: string, roleId: string) =>
    `/guilds/${guildId}/members/${userId}/roles/${roleId}` as const,

  // Guild Emojis & Stickers
  guildEmojis: (guildId: string) => `/guilds/${guildId}/emojis` as const,
  guildEmojisBulk: (guildId: string) => `/guilds/${guildId}/emojis/bulk` as const,
  guildEmojisClone: (guildId: string) => `/guilds/${guildId}/emojis/clone` as const,
  guildEmoji: (guildId: string, emojiId: string) => `/guilds/${guildId}/emojis/${emojiId}` as const,
  emojiMetadata: (emojiId: string) => `/emojis/${emojiId}/metadata` as const,
  emojiSource: (emojiId: string) => `/emojis/${emojiId}/source` as const,

  guildStickers: (guildId: string) => `/guilds/${guildId}/stickers` as const,
  guildStickersBulk: (guildId: string) => `/guilds/${guildId}/stickers/bulk` as const,
  guildStickersClone: (guildId: string) => `/guilds/${guildId}/stickers/clone` as const,
  guildSticker: (guildId: string, stickerId: string) =>
    `/guilds/${guildId}/stickers/${stickerId}` as const,
  stickerMetadata: (stickerId: string) => `/stickers/${stickerId}/metadata` as const,
  stickerSource: (stickerId: string) => `/stickers/${stickerId}/source` as const,

  // Guild Discovery
  discoveryCategories: () => '/discovery/categories' as const,
  discoveryGuilds: () => '/discovery/guilds' as const,
  guildDiscovery: (guildId: string) => `/guilds/${guildId}/discovery` as const,

  // Channels
  channel: (channelId: string) => `/channels/${channelId}` as const,
  channelPermission: (channelId: string, overwriteId: string) =>
    `/channels/${channelId}/permissions/${overwriteId}` as const,
  channelTyping: (channelId: string) => `/channels/${channelId}/typing` as const,
  channelSlowmode: (channelId: string) => `/channels/${channelId}/slowmode` as const,
  channelFollowers: (channelId: string) => `/channels/${channelId}/followers` as const,
  channelFollowerStats: (channelId: string) => `/channels/${channelId}/follower-stats` as const,
  channelInvites: (channelId: string) => `/channels/${channelId}/invites` as const,
  channelWebhooks: (channelId: string) => `/channels/${channelId}/webhooks` as const,

  // Forum Tags & Posts
  channelTags: (channelId: string) => `/channels/${channelId}/tags` as const,
  channelTag: (channelId: string, tagId: string) => `/channels/${channelId}/tags/${tagId}` as const,
  channelPostData: (channelId: string) => `/channels/${channelId}/post-data` as const,

  // Threads
  channelThreads: (channelId: string) => `/channels/${channelId}/threads` as const,
  channelMessageThreads: (channelId: string, messageId: string) =>
    `/channels/${channelId}/messages/${messageId}/threads` as const,
  channelArchivedPublicThreads: (channelId: string) =>
    `/channels/${channelId}/threads/archived/public` as const,
  channelArchivedPrivateThreads: (channelId: string) =>
    `/channels/${channelId}/threads/archived/private` as const,
  channelJoinedArchivedPrivateThreads: (channelId: string) =>
    `/channels/${channelId}/users/@me/threads/archived/private` as const,
  channelThreadSearch: (channelId: string) => `/channels/${channelId}/threads/search` as const,
  channelThreadMembers: (channelId: string) => `/channels/${channelId}/thread-members` as const,
  channelThreadMemberMe: (channelId: string) =>
    `/channels/${channelId}/thread-members/@me` as const,
  channelThreadMember: (channelId: string, userId: string) =>
    `/channels/${channelId}/thread-members/${userId}` as const,

  // Messages, Pins, Reactions & Search
  channelMessages: (channelId: string) => `/channels/${channelId}/messages` as const,
  channelMessage: (channelId: string, messageId: string) =>
    `/channels/${channelId}/messages/${messageId}` as const,
  channelBulkDelete: (channelId: string) => `/channels/${channelId}/messages/bulk-delete` as const,
  channelPins: (channelId: string) => `/channels/${channelId}/messages/pins` as const,
  channelPinMessage: (channelId: string, messageId: string) =>
    `/channels/${channelId}/pins/${messageId}` as const,
  channelMessageCrosspost: (channelId: string, messageId: string) =>
    `/channels/${channelId}/messages/${messageId}/crosspost` as const,
  channelMessageCrosspostSource: (channelId: string, messageId: string) =>
    `/channels/${channelId}/messages/${messageId}/crosspost-source` as const,
  channelMessageAttachment: (channelId: string, messageId: string, attachmentId: string) =>
    `/channels/${channelId}/messages/${messageId}/attachments/${attachmentId}` as const,
  attachmentsRefreshUrls: () => '/attachments/refresh-urls' as const,
  searchMessages: () => '/search/messages' as const,

  // Reactions
  channelMessageReactions: (channelId: string, messageId: string) =>
    `/channels/${channelId}/messages/${messageId}/reactions` as const,
  channelMessageReaction: (channelId: string, messageId: string, emoji: string) =>
    `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}` as const,
  channelMessageReactionMe: (channelId: string, messageId: string, emoji: string) =>
    `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me` as const,
  channelMessageReactionUser: (
    channelId: string,
    messageId: string,
    emoji: string,
    userId: string,
  ) =>
    `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/${userId}` as const,

  // Invites
  invite: (code: string) => `/invites/${encodeURIComponent(code)}` as const,

  // Users
  currentUser: () => '/users/@me' as const,
  currentUserGuilds: () => '/users/@me/guilds' as const,
  currentUserGuild: (guildId: string) => `/users/@me/guilds/${guildId}` as const,
  currentUserChannels: () => '/users/@me/channels' as const,
  user: (userId: string) => `/users/${userId}` as const,
  userProfile: (userId: string) => `/users/${userId}/profile` as const,

  // Webhooks
  webhook: (webhookId: string) => `/webhooks/${webhookId}` as const,
  webhookWithToken: (webhookId: string, token: string) =>
    `/webhooks/${webhookId}/${encodeURIComponent(token)}` as const,
  webhookMessage: (webhookId: string, token: string, messageId: string) =>
    `/webhooks/${webhookId}/${encodeURIComponent(token)}/messages/${messageId}` as const,
  webhookGithub: (webhookId: string, token: string) =>
    `/webhooks/${webhookId}/${encodeURIComponent(token)}/github` as const,
  webhookSlack: (webhookId: string, token: string) =>
    `/webhooks/${webhookId}/${encodeURIComponent(token)}/slack` as const,
  webhookInstatus: (webhookId: string, token: string) =>
    `/webhooks/${webhookId}/${encodeURIComponent(token)}/instatus` as const,
  webhookLibredesk: (webhookId: string, token: string) =>
    `/webhooks/${webhookId}/${encodeURIComponent(token)}/libredesk` as const,
} as const;
