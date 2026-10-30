// Who sees what. Owners can do everything. Managers do what their account allows: media
// on/off, schedule rules on/off, accounting on/off, and the teams they run (all, or e.g.
// only security).
// Tasks are for everyone with an account. The database enforces the same (row level
// security); this only decides what the app shows.
import type { Access, Role } from '@/types';

export type Area = 'media' | 'staff' | 'rules' | 'tasks' | 'payments' | 'accounting' | 'accounts' | 'activity';

const runsTeams = (a: Access) => a.role === 'owner' || a.teams === null || a.teams.length > 0;

export function can(access: Access | null | undefined, area: Area) {
  if (!access) return false;
  if (access.role === 'owner') return true;
  switch (area) {
    case 'media': return access.media;
    case 'staff': return runsTeams(access);
    case 'rules': return access.rules && runsTeams(access);
    case 'tasks': return true;
    case 'payments': return true; // anyone can ask for a payment and see their own
    case 'accounting': return access.accounting;
    default: return false;
  }
}

/** Runs every team (the venue-wide bits: who opens, adding teams). */
export const allTeams = (access: Access | null | undefined) => !!access && (access.role === 'owner' || access.teams === null);

export const roleLabel: Record<Role, string> = { owner: 'Owner', manager: 'Manager' };
