import { describe, expect, it } from 'vitest';
import { decodeHtmlEntities, isSafeString, sanitizeString } from '../validators';
import { parseSpanishNumber } from '../../components/ReservationManager';
import { isAllowedAuthRedirectUrl } from '../authRedirect';
import { isAllowedGeminiMimeType } from '../mimeAllowlist';
import { redactSettingsForLocalStorage } from '../settingsLocalStorage';
import type { AppSettings } from '../../types';

describe('SEC-005 parseSpanishNumber', () => {
  it('rejects Infinity', () => {
    expect(parseSpanishNumber('1.234,56')).toBe(1234.56);
    expect(parseSpanishNumber('1e999')).toBe(0);
  });
});

describe('SEC-006 HTML entity XSS', () => {
  it('detects encoded payloads', () => {
    expect(isSafeString('&#60;script&#62;')).toBe(false);
    expect(decodeHtmlEntities('&#60;script&#62;')).toBe('<script>');
    expect(sanitizeString('&#60;img&#62;')).toContain('&lt;');
  });
});

describe('SEC-011 mime allowlist', () => {
  it('allows pdf and rejects exe', () => {
    expect(isAllowedGeminiMimeType('application/pdf', 'a.pdf')).toBe(true);
    expect(isAllowedGeminiMimeType('application/x-msdownload', 'a.exe')).toBe(false);
  });
});

describe('SEC-014 auth redirect', () => {
  it('allowlists same origin only', () => {
    const origin = window.location.origin;
    expect(isAllowedAuthRedirectUrl(`${origin}/reset`)).toBe(true);
    expect(isAllowedAuthRedirectUrl('https://evil.example/x')).toBe(false);
  });
});

describe('SEC-015 settings redaction', () => {
  it('clears NIF fields', () => {
    const s: AppSettings = { cbName: 'X', nif: 'B1', fiscalRegime: 'GENERAL', vatObligation: true, partners: [{ id: '1', name: 'A', nif: '12345678Z', participation: 50 }] };
    expect(redactSettingsForLocalStorage(s).nif).toBe('');
  });
});
