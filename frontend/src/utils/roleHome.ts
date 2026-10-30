import type { Role } from '../types';

/** The page each kind of account lands on after signing in. Anything unknown gets the farmer dashboard. */
export function homePathFor(role: Role | undefined): string {
  if (role === 'ADMIN') return '/admin';
  if (role === 'SUPERVISOR') return '/supervisor';
  return '/farmer';
}
