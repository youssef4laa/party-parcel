import type { RoomRole } from './rooms';
import { LIMITS } from '@/config/limits';

export type DecorateLevel = 'off' | 'own' | 'any';

export type RoomPermissions = {
  contributors: {
    canDecorate: DecorateLevel;
    canImport: boolean;
    canDraw: boolean;
    canMoveOwnPresents: boolean;
    maxItemsPerContributor: number;
  };
  celebrant: {
    /** Only effective once the room is actually unlocked — checked separately, never trust this
     * flag alone. */
    canRearrange: boolean;
  };
  /** Only the host can change anything while this is on — overrides every other flag below. */
  freezeLayout: boolean;
};

export const DEFAULT_PERMISSIONS: RoomPermissions = {
  contributors: {
    canDecorate: 'off',
    canImport: false,
    canDraw: false,
    canMoveOwnPresents: false,
    maxItemsPerContributor: LIMITS.defaultMaxItemsPerContributor,
  },
  celebrant: {
    canRearrange: false,
  },
  freezeLayout: false,
};

/** Never trusts a malformed/partial stored value — always merges over the full default shape. */
export function parsePermissions(json: string): RoomPermissions {
  let parsed: Partial<RoomPermissions> = {};
  try {
    parsed = JSON.parse(json) ?? {};
  } catch {
    parsed = {};
  }
  return {
    contributors: { ...DEFAULT_PERMISSIONS.contributors, ...(parsed.contributors ?? {}) },
    celebrant: { ...DEFAULT_PERMISSIONS.celebrant, ...(parsed.celebrant ?? {}) },
    freezeLayout: typeof parsed.freezeLayout === 'boolean' ? parsed.freezeLayout : DEFAULT_PERMISSIONS.freezeLayout,
  };
}

export type ObjectAction = 'create' | 'update' | 'delete' | 'reset';

/**
 * The single source of truth for "can this request touch room objects" — every mutation route
 * calls this, never just the client's rendered UI state. Ownership (`isOwner`) is by contributor
 * session hash, not accounts (see contributorSession.ts) — the host is never subject to it.
 */
export function canMutateObjects(input: {
  role: RoomRole;
  permissions: RoomPermissions;
  unlocked: boolean;
  action: ObjectAction;
  /** Only meaningful for update/delete of an existing object. */
  isOwner?: boolean;
}): boolean {
  const { role, permissions, unlocked, action, isOwner } = input;

  if (role === 'admin') return true; // host always has full rights, freeze included
  if (permissions.freezeLayout) return false; // freeze blocks everyone but the host, full stop

  if (role === 'contribute') {
    const level = permissions.contributors.canDecorate;
    if (level === 'off') return false;
    if (action === 'reset') return false; // reset-to-default is host-only, unconditionally
    if (action === 'create') return true; // per-contributor count is checked separately (needs a DB query)
    // update/delete: 'any' can touch anything, 'own' only what they created
    return level === 'any' || Boolean(isOwner);
  }

  if (role === 'celebrate') {
    if (!unlocked) return false; // canRearrange is never effective before unlock
    if (!permissions.celebrant.canRearrange) return false;
    // "rearrange" — move/resize/rotate/flip existing objects, not create or delete new ones
    return action === 'update';
  }

  return false;
}

/**
 * A display hint only — the room payload's `capabilities` list, used to decide whether to show
 * the pencil icon and which tools/tabs to offer. Never the actual authorization boundary: every
 * mutation route re-checks `canMutateObjects` (and ownership, and freeze, and unlock) on its own,
 * so hiding the pencil in the UI is never what actually stops an unauthorized edit — see the
 * permissions tests in DECISIONS.md's Room Editor entry.
 */
export function computeCapabilities(role: RoomRole, permissions: RoomPermissions, unlocked: boolean): string[] {
  const caps: string[] = [];

  if (role === 'admin') {
    return [
      'objects:edit-mode',
      'decorate:create',
      'decorate:update:any',
      'decorate:delete:any',
      'decorate:reset',
      'permissions:manage',
      'items:import',
      'items:draw',
      'presents:move-any',
    ];
  }

  if (permissions.freezeLayout) return caps; // frozen: nobody but the host gets anything below

  if (role === 'contribute') {
    const level = permissions.contributors.canDecorate;
    if (level !== 'off') {
      caps.push('objects:edit-mode', 'decorate:create');
      caps.push(level === 'any' ? 'decorate:update:any' : 'decorate:update:own');
      caps.push(level === 'any' ? 'decorate:delete:any' : 'decorate:delete:own');
    }
    if (permissions.contributors.canImport) caps.push('items:import');
    if (permissions.contributors.canDraw) caps.push('items:draw');
    if (permissions.contributors.canMoveOwnPresents) caps.push('presents:move-own');
  }

  if (role === 'celebrate' && unlocked && permissions.celebrant.canRearrange) {
    caps.push('objects:edit-mode', 'decorate:update:any');
  }

  return caps;
}
