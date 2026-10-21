import { RESTRICTED_PREFIXES } from '../../shared/constants/index.js';

export function isRestricted(url: string): boolean {
  if (!url) return true;
  return (RESTRICTED_PREFIXES as readonly string[]).some((prefix) => url.startsWith(prefix));
}
