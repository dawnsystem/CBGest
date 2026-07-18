/**
 * @fileoverview Tests settingsService — mapeo limpio y payload (BUG-027).
 */

import { describe, it, expect } from 'vitest';
import {
  mapSettingsDocument,
  buildSettingsPayload,
  SETTINGS_DOCUMENT_ID,
} from '../settingsService';
import type { AppSettings } from '../../../types';

describe('settingsService (BUG-027 / BUG-028)', () => {
  it('SETTINGS_DOCUMENT_ID is a stable singleton id', () => {
    expect(SETTINGS_DOCUMENT_ID).toBe('app_settings');
  });

  it('mapSettingsDocument strips Appwrite metadata ($id, $permissions, …)', () => {
    const mapped = mapSettingsDocument({
      $id: 'app_settings',
      $createdAt: '2026-01-01T00:00:00.000Z',
      $updatedAt: '2026-01-02T00:00:00.000Z',
      $permissions: ['read("any")'],
      $databaseId: 'db',
      $collectionId: 'settings',
      cbName: 'CB Test',
      nif: 'B12345678',
      fiscalRegime: 'ALQUILER_EXENTO',
      vatObligation: false,
      partners: '[{"id":"p1","name":"A","nif":"123","participation":100}]',
    } as never);

    expect(mapped.appwriteId).toBe('app_settings');
    expect(mapped.cbName).toBe('CB Test');
    expect(mapped.nif).toBe('B12345678');
    expect(mapped.fiscalRegime).toBe('ALQUILER_EXENTO');
    expect(mapped.partners).toHaveLength(1);
    expect(mapped.partners[0].name).toBe('A');
    expect(mapped).not.toHaveProperty('$id');
    expect(mapped).not.toHaveProperty('$permissions');
    expect(mapped).not.toHaveProperty('$createdAt');
  });

  it('mapSettingsDocument includes Modelo 184 fiscal fields', () => {
    const mapped = mapSettingsDocument({
      cbName: 'CB Test',
      nif: 'E56452543',
      fiscalRegime: 'ALQUILER_EXENTO',
      vatObligation: false,
      partners: '[]',
      address: 'C/ Example 1',
      postalCode: '08012',
      city: 'Barcelona',
      province: 'Barcelona',
      representativeNif: '12345678Z',
      representativeName: 'Representante Legal',
    } as never);

    expect(mapped.address).toBe('C/ Example 1');
    expect(mapped.postalCode).toBe('08012');
    expect(mapped.representativeNif).toBe('12345678Z');
  });

  it('buildSettingsPayload only includes business fields (no metadata, no dataConfig)', () => {
    const settings: AppSettings = {
      appwriteId: 'app_settings',
      cbName: 'CB',
      nif: 'X',
      fiscalRegime: 'GENERAL',
      vatObligation: true,
      partners: [{ id: '1', name: 'Socio', nif: '1', participation: 100 }],
      dataConfig: { type: 'APPWRITE', autoBackup: false },
      touristTaxConfig: { rate: 1, maxNights: 7, minAge: 17, enabled: true },
    };

    const payload = buildSettingsPayload(settings);
    expect(payload).toEqual({
      cbName: 'CB',
      nif: 'X',
      fiscalRegime: 'GENERAL',
      vatObligation: true,
      partners: JSON.stringify(settings.partners),
      touristTaxConfig: JSON.stringify(settings.touristTaxConfig),
      address: '',
      streetNumber: '',
      postalCode: '',
      city: '',
      province: '',
      phone: '',
      contactPerson: '',
      representativeNif: '',
      representativeName: '',
    });
    expect(payload).not.toHaveProperty('appwriteId');
    expect(payload).not.toHaveProperty('dataConfig');
    expect(payload).not.toHaveProperty('$id');
  });
});
