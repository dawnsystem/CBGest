/** Client MIME allowlist before Gemini (SEC-011). */

export const ALLOWED_GEMINI_MIME_TYPES = [
  'application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
] as const;

const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif'] as const;

export function normalizeMimeType(mimeType: string): string {
  const raw = (mimeType || '').trim().toLowerCase();
  return raw === 'image/jpg' ? 'image/jpeg' : raw;
}

export function isAllowedGeminiMimeType(mimeType: string, fileName = ''): boolean {
  const mime = normalizeMimeType(mimeType);
  if ((ALLOWED_GEMINI_MIME_TYPES as readonly string[]).includes(mime)) return true;
  if (!mime || mime === 'application/octet-stream') {
    const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.'));
    return (ALLOWED_EXTENSIONS as readonly string[]).includes(ext);
  }
  return false;
}
