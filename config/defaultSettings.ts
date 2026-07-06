import type { AppSettings } from '../types';
import { APPWRITE_CONFIG } from './appwrite';

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
