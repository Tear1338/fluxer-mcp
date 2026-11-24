import {
  ALL_FLUXER_PERMISSIONS,
  CRITICAL_EVERYONE_PERMISSIONS,
  ELEVATED_FLUXER_PERMISSIONS,
  FLUXER_CHANNEL_TYPES,
  FLUXER_PERMISSIONS,
  FLUXER_PERMISSION_NAMES,
  type FluxerPermissionName,
} from './constants.js';

export interface RoleLike {
  readonly id: string;
  readonly name: string;
  readonly position: number;
  readonly hoist_position?: number | null;
  readonly permissions: string;
  readonly hoist?: boolean;
  readonly mentionable?: boolean;
  readonly managed?: boolean;
  readonly color?: number;
}

export interface OverwriteLike {
  readonly id: string;
  readonly type: number; // 0 = role, 1 = member
  readonly allow: string;
  readonly deny: string;
}

export interface ChannelLike {
  readonly id: string;
  readonly name?: string | null;
  readonly type: number;
  readonly guild_id?: string | null;
  readonly parent_id?: string | null;
  readonly permission_overwrites?: readonly OverwriteLike[];
}

export function parsePermissionBits(raw: string | bigint | undefined | null): bigint {
  if (raw === undefined || raw === null) return 0n;
  if (typeof raw === 'bigint') return raw;
  return /^\d+$/.test(raw) ? BigInt(raw) : 0n;
}

export function decodePermissionNames(bits: bigint): FluxerPermissionName[] {
  const names: FluxerPermissionName[] = [];
  for (const name of FLUXER_PERMISSION_NAMES) {
    const flag = FLUXER_PERMISSIONS[name];
    if ((bits & flag) === flag) names.push(name);
  }
  return names;
}

export function encodePermissionNames(names: readonly FluxerPermissionName[]): bigint {
  let bits = 0n;
  for (const name of names) {
    bits |= FLUXER_PERMISSIONS[name];
  }
  return bits;
}

export function hasPermissionBit(effective: bigint, perm: FluxerPermissionName): boolean {
  if ((effective & FLUXER_PERMISSIONS.ADMINISTRATOR) === FLUXER_PERMISSIONS.ADMINISTRATOR) {
    return true;
  }
  const flag = FLUXER_PERMISSIONS[perm];
  return (effective & flag) === flag;
}

export function applyOverwrite(bits: bigint, allow: bigint, deny: bigint): bigint {
  return (bits & ~deny) | allow;
}

/**
 * Compute base guild-level permissions for a member (owner gets ALL_FLUXER_PERMISSIONS).
 */
export function computeBaseGuildPermissions(options: {
  guildId: string;
  ownerId?: string;
  memberId: string;
  memberRoleIds: readonly string[];
  roles: readonly RoleLike[];
}): bigint {
  if (options.ownerId && options.memberId === options.ownerId) {
    return ALL_FLUXER_PERMISSIONS;
  }
  const roleMap = new Map(options.roles.map((r) => [r.id, r]));
  let permissions = parsePermissionBits(roleMap.get(options.guildId)?.permissions);
  for (const roleId of options.memberRoleIds) {
    const role = roleMap.get(roleId);
    if (role) permissions |= parsePermissionBits(role.permissions);
  }
  if ((permissions & FLUXER_PERMISSIONS.ADMINISTRATOR) === FLUXER_PERMISSIONS.ADMINISTRATOR) {
    return ALL_FLUXER_PERMISSIONS;
  }
  return permissions;
}

export interface PermissionTraceStep {
  readonly stage: 'owner' | 'everyone_role' | 'member_roles' | 'everyone_overwrite' | 'role_overwrites' | 'member_overwrite' | 'administrator_bypass' | 'timeout_restriction';
  readonly detail: string;
  readonly added: readonly FluxerPermissionName[];
  readonly removed: readonly FluxerPermissionName[];
}

export interface EffectivePermissionEvaluation {
  readonly effectiveBits: bigint;
  readonly permissions: readonly FluxerPermissionName[];
  readonly isOwner: boolean;
  readonly isAdministrator: boolean;
  readonly timedOut: boolean;
  readonly trace: readonly PermissionTraceStep[];
}

/**
 * Compute effective Fluxer permissions for a member in a channel, with a complete
 * step-by-step audit trace following Fluxer's exact precedence rules:
 * 1. Guild Owner → ALL permissions
 * 2. @everyone role base | member roles base
 * 3. ADMINISTRATOR → ALL permissions (bypasses overwrites & timeout)
 * 4. @everyone channel overwrite
 * 5. Combined member role channel overwrites (union of allows, union of denies)
 * 6. Member-specific channel overwrite
 * 7. Timeout restriction (if communication_disabled_until is in the future, limits to VIEW_CHANNEL + READ_MESSAGE_HISTORY)
 */
export function evaluateChannelPermissions(options: {
  guildId: string;
  ownerId?: string;
  memberId: string;
  memberRoleIds: readonly string[];
  roles: readonly RoleLike[];
  overwrites?: readonly OverwriteLike[];
  communicationDisabledUntil?: string | null;
}): EffectivePermissionEvaluation {
  const trace: PermissionTraceStep[] = [];
  const isOwner = Boolean(options.ownerId && options.memberId === options.ownerId);
  const timedOut =
    typeof options.communicationDisabledUntil === 'string' &&
    Date.parse(options.communicationDisabledUntil) > Date.now();

  if (isOwner) {
    trace.push({
      stage: 'owner',
      detail: 'Guild owner automatically holds all Fluxer permissions.',
      added: decodePermissionNames(ALL_FLUXER_PERMISSIONS),
      removed: [],
    });
    return {
      effectiveBits: ALL_FLUXER_PERMISSIONS,
      permissions: decodePermissionNames(ALL_FLUXER_PERMISSIONS),
      isOwner: true,
      isAdministrator: true,
      timedOut,
      trace,
    };
  }

  const roleMap = new Map(options.roles.map((r) => [r.id, r]));
  const everyoneBits = parsePermissionBits(roleMap.get(options.guildId)?.permissions);
  let current = everyoneBits;
  trace.push({
    stage: 'everyone_role',
    detail: '@everyone guild role baseline',
    added: decodePermissionNames(everyoneBits),
    removed: [],
  });

  let roleAdded = 0n;
  for (const roleId of options.memberRoleIds) {
    if (roleId === options.guildId) continue;
    const role = roleMap.get(roleId);
    if (!role) continue;
    const bits = parsePermissionBits(role.permissions);
    roleAdded |= bits & ~current;
    current |= bits;
  }
  trace.push({
    stage: 'member_roles',
    detail: `Applied ${options.memberRoleIds.length} member role(s)`,
    added: decodePermissionNames(roleAdded),
    removed: [],
  });

  if ((current & FLUXER_PERMISSIONS.ADMINISTRATOR) === FLUXER_PERMISSIONS.ADMINISTRATOR) {
    trace.push({
      stage: 'administrator_bypass',
      detail: 'ADMINISTRATOR grants all permissions and bypasses overwrites and timeouts.',
      added: decodePermissionNames(ALL_FLUXER_PERMISSIONS & ~current),
      removed: [],
    });
    return {
      effectiveBits: ALL_FLUXER_PERMISSIONS,
      permissions: decodePermissionNames(ALL_FLUXER_PERMISSIONS),
      isOwner: false,
      isAdministrator: true,
      timedOut,
      trace,
    };
  }

  const overwrites = options.overwrites ?? [];
  const everyoneOw = overwrites.find((o) => o.type === 0 && o.id === options.guildId);
  if (everyoneOw) {
    const allow = parsePermissionBits(everyoneOw.allow);
    const deny = parsePermissionBits(everyoneOw.deny);
    const next = applyOverwrite(current, allow, deny);
    trace.push({
      stage: 'everyone_overwrite',
      detail: '@everyone channel overwrite',
      added: decodePermissionNames(next & ~current),
      removed: decodePermissionNames(current & ~next),
    });
    current = next;
  }

  let combinedRoleAllow = 0n;
  let combinedRoleDeny = 0n;
  const memberRoleSet = new Set(options.memberRoleIds);
  for (const ow of overwrites) {
    if (ow.type === 0 && ow.id !== options.guildId && memberRoleSet.has(ow.id)) {
      combinedRoleAllow |= parsePermissionBits(ow.allow);
      combinedRoleDeny |= parsePermissionBits(ow.deny);
    }
  }
  if (combinedRoleAllow !== 0n || combinedRoleDeny !== 0n) {
    const next = applyOverwrite(current, combinedRoleAllow, combinedRoleDeny);
    trace.push({
      stage: 'role_overwrites',
      detail: 'Combined member role channel overwrites',
      added: decodePermissionNames(next & ~current),
      removed: decodePermissionNames(current & ~next),
    });
    current = next;
  }

  const memberOw = overwrites.find((o) => o.type === 1 && o.id === options.memberId);
  if (memberOw) {
    const allow = parsePermissionBits(memberOw.allow);
    const deny = parsePermissionBits(memberOw.deny);
    const next = applyOverwrite(current, allow, deny);
    trace.push({
      stage: 'member_overwrite',
      detail: `Member overwrite for ${options.memberId}`,
      added: decodePermissionNames(next & ~current),
      removed: decodePermissionNames(current & ~next),
    });
    current = next;
  }

  if (timedOut) {
    const allowedWhileTimedOut =
      FLUXER_PERMISSIONS.VIEW_CHANNEL | FLUXER_PERMISSIONS.READ_MESSAGE_HISTORY;
    const next = current & allowedWhileTimedOut;
    trace.push({
      stage: 'timeout_restriction',
      detail: 'Member is actively timed out; write/moderation permissions suspended.',
      added: [],
      removed: decodePermissionNames(current & ~next),
    });
    current = next;
  }

  return {
    effectiveBits: current,
    permissions: decodePermissionNames(current),
    isOwner: false,
    isAdministrator: false,
    timedOut,
    trace,
  };
}

export function isThreadChannelType(type: number): boolean {
  return (
    type === FLUXER_CHANNEL_TYPES.ANNOUNCEMENT_THREAD ||
    type === FLUXER_CHANNEL_TYPES.PUBLIC_THREAD ||
    type === FLUXER_CHANNEL_TYPES.PRIVATE_THREAD
  );
}

export function findDangerousPermissions(
  bits: bigint,
  isEveryone: boolean,
): FluxerPermissionName[] {
  const list = isEveryone ? CRITICAL_EVERYONE_PERMISSIONS : ELEVATED_FLUXER_PERMISSIONS;
  return list.filter((name) => (bits & FLUXER_PERMISSIONS[name]) === FLUXER_PERMISSIONS[name]);
}

export function compareRolesDesc(a: RoleLike, b: RoleLike): number {
  if (b.position !== a.position) return b.position - a.position;
  return a.id.localeCompare(b.id);
}

export function getHighestRolePosition(
  memberRoleIds: readonly string[],
  roles: readonly RoleLike[],
): number {
  const roleMap = new Map(roles.map((r) => [r.id, r]));
  let top = 0;
  for (const id of memberRoleIds) {
    const pos = roleMap.get(id)?.position ?? 0;
    if (pos > top) top = pos;
  }
  return top;
}
