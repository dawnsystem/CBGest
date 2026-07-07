import type { AppSettings, TouristTaxConfig } from '../types';
import { APPWRITE_CONFIG } from './appwrite';

/** Shared default for the tourist-tax configuration (DEBT-005). */
export const DEFAULT_TAX_CONFIG: TouristTaxConfig = {
  rate: 1,
  maxNights: 7,
  minAge: 17,
  enabled: true,
};

export const createDefaultSettings = (): AppSettings => ({
  cbName: 'Nueva Comunidad de Bienes',
  nif: '',
  fiscalRegime: 'ALQUILER_EXENTO',
  vatObligation: false,
  partners: [{ id: '1', name: 'Socio Fundador', nif: '', participation: 100 }],
  dataConfig: {
    type: 'APPWRITE',
    autoBackup: false,
    appwriteProjectId: APPWRITE_CONFIG.projectId,
    appwriteDatabaseId: APPWRITE_CONFIG.databaseId,
    appwriteBucketId: APPWRITE_CONFIG.bucketId,
    appwriteEndpoint: APPWRITE_CONFIG.endpoint,
  },
});
