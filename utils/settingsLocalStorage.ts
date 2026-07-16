import type { AppSettings, Partner } from '../types';

/** Redacts NIFs before localStorage persistence (SEC-015). */
export function redactSettingsForLocalStorage(settings: AppSettings): AppSettings {
  return {
    ...settings,
    nif: '',
    partners: (settings.partners ?? []).map((p: Partner) => ({ ...p, nif: '' })),
  };
}
