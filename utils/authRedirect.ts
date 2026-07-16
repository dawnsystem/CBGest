/** Allowlist for Appwrite auth redirect URLs (SEC-014). */

export function getAllowedAuthRedirectOrigins(): string[] {
  const origins = new Set<string>();
  if (typeof window !== 'undefined' && window.location?.origin) {
    origins.add(window.location.origin);
  }
  const fromEnv = (import.meta.env.VITE_AUTH_REDIRECT_ORIGINS as string | undefined) ?? '';
  for (const raw of fromEnv.split(',')) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    try { origins.add(new URL(trimmed).origin); } catch { /* ignore */ }
  }
  return [...origins];
}

export function isAllowedAuthRedirectUrl(
  url: string,
  allowedOrigins: string[] = getAllowedAuthRedirectOrigins()
): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    if (parsed.username || parsed.password) return false;
    return allowedOrigins.some((origin) => origin === parsed.origin);
  } catch {
    return false;
  }
}
