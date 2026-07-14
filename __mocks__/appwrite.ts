import { vi } from 'vitest';

// Mock Models
export const Models = {
  Compression: {
    NONE: 'none',
    GZIP: 'gzip',
  },
};

// Mock Account class
export class Account {
  get = vi.fn().mockResolvedValue({
    $id: 'user123',
    email: 'test@example.com',
    name: 'Test User',
    emailVerification: true,
  });

  create = vi.fn().mockResolvedValue({
    $id: 'user123',
    email: 'test@example.com',
    name: 'Test User',
  });

  createEmailPasswordSession = vi.fn().mockResolvedValue({
    $id: 'session123',
    userId: 'user123',
    provider: 'email',
  });

  deleteSession = vi.fn().mockResolvedValue({});
  deleteSessions = vi.fn().mockResolvedValue({});

  updateName = vi.fn().mockImplementation((name: string) => Promise.resolve({
    $id: 'user123',
    email: 'test@example.com',
    name,
    emailVerification: true,
  }));

  updatePassword = vi.fn().mockResolvedValue({
    $id: 'user123',
    email: 'test@example.com',
    name: 'Test User',
    emailVerification: true,
    prefs: {},
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updatePrefs = vi.fn().mockImplementation((prefs: any) => Promise.resolve({
    $id: 'user123',
    email: 'test@example.com',
    name: 'Test User',
    emailVerification: true,
    prefs,
  }));

  createRecovery = vi.fn().mockResolvedValue({});

  listSessions = vi.fn().mockResolvedValue({
    sessions: [{
      $id: 'session123',
      userId: 'user123',
      provider: 'email',
      expire: '2099-01-01T00:00:00.000Z',
      current: true,
    }],
  });

  createJWT = vi.fn().mockResolvedValue({ jwt: 'jwt-token' });

  getSession = vi.fn().mockResolvedValue({
    $id: 'session123',
    userId: 'user123',
  });

  createVerification = vi.fn().mockResolvedValue({});

  updateVerification = vi.fn().mockResolvedValue({});
}

// Mock Databases class
export class Databases {
  listDocuments = vi.fn().mockResolvedValue({
    total: 0,
    documents: [],
  });

  createDocument = vi.fn().mockImplementation((databaseId, collectionId, documentId, data) => {
    return Promise.resolve({
      $id: documentId || 'doc123',
      $collectionId: collectionId,
      $databaseId: databaseId,
      $createdAt: new Date().toISOString(),
      $updatedAt: new Date().toISOString(),
      ...data,
    });
  });

  getDocument = vi.fn().mockImplementation((databaseId, collectionId, documentId) => {
    return Promise.resolve({
      $id: documentId,
      $collectionId: collectionId,
      $databaseId: databaseId,
      $createdAt: new Date().toISOString(),
      $updatedAt: new Date().toISOString(),
    });
  });

  updateDocument = vi.fn().mockImplementation((databaseId, collectionId, documentId, data) => {
    return Promise.resolve({
      $id: documentId,
      $collectionId: collectionId,
      $databaseId: databaseId,
      $updatedAt: new Date().toISOString(),
      ...data,
    });
  });

  deleteDocument = vi.fn().mockResolvedValue({});
}

// Mock Storage class
export class Storage {
  createFile = vi.fn().mockImplementation((bucketId, fileId, file) => {
    return Promise.resolve({
      $id: fileId || 'file123',
      $createdAt: new Date().toISOString(),
      name: file.name || 'test-file.pdf',
      sizeOriginal: file.size || 1024,
      mimeType: file.type || 'application/pdf',
    });
  });

  getFileView = vi.fn().mockImplementation((bucketId, fileId) => {
    return `https://mock-appwrite.io/storage/buckets/${bucketId}/files/${fileId}/view`;
  });

  getFileDownload = vi.fn().mockImplementation((bucketId, fileId) => {
    return `https://mock-appwrite.io/storage/buckets/${bucketId}/files/${fileId}/download`;
  });

  deleteFile = vi.fn().mockResolvedValue({});

  listFiles = vi.fn().mockResolvedValue({
    total: 0,
    files: [],
  });
}

// Mock Functions class
export class Functions {
  createExecution = vi.fn().mockImplementation((functionId, _body, _asyncExecution) => {
    return Promise.resolve({
      $id: 'execution123',
      functionId,
      status: 'completed',
      responseStatusCode: 200,
      responseBody: JSON.stringify({ success: true }),
      duration: 0.5,
    });
  });

  getExecution = vi.fn().mockResolvedValue({
    $id: 'execution123',
    status: 'completed',
    responseStatusCode: 200,
    responseBody: JSON.stringify({ success: true }),
  });
}

// Mock Client class
export class Client {
  private config: {
    endpoint?: string;
    project?: string;
    key?: string;
  } = {};

  setEndpoint = vi.fn().mockImplementation((endpoint: string) => {
    this.config.endpoint = endpoint;
    return this;
  });

  setProject = vi.fn().mockImplementation((project: string) => {
    this.config.project = project;
    return this;
  });

  setKey = vi.fn().mockImplementation((key: string) => {
    this.config.key = key;
    return this;
  });

  getConfig = () => this.config;
}

// Mock Query class
export class Query {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static equal = vi.fn((attribute: string, value: any) => `equal("${attribute}", ${JSON.stringify(value)})`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static notEqual = vi.fn((attribute: string, value: any) => `notEqual("${attribute}", ${JSON.stringify(value)})`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static lessThan = vi.fn((attribute: string, value: any) => `lessThan("${attribute}", ${value})`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static greaterThan = vi.fn((attribute: string, value: any) => `greaterThan("${attribute}", ${value})`);
  static search = vi.fn((attribute: string, value: string) => `search("${attribute}", "${value}")`);
  static orderDesc = vi.fn((attribute: string) => `orderDesc("${attribute}")`);
  static orderAsc = vi.fn((attribute: string) => `orderAsc("${attribute}")`);
  static limit = vi.fn((limit: number) => `limit(${limit})`);
  static offset = vi.fn((offset: number) => `offset(${offset})`);
  static cursorAfter = vi.fn((id: string) => `cursorAfter("${id}")`);
  static isNull = vi.fn((attribute: string) => `isNull("${attribute}")`);
}

// Mock ID class
export class ID {
  static unique = vi.fn(() => `unique_${Date.now()}_${Math.random().toString(36).substring(7)}`);
  static custom = vi.fn((id: string) => id);
}

// Mock Permission class
export class Permission {
  static read = vi.fn((role: string) => `read("${role}")`);
  static write = vi.fn((role: string) => `write("${role}")`);
  static create = vi.fn((role: string) => `create("${role}")`);
  static update = vi.fn((role: string) => `update("${role}")`);
  static delete = vi.fn((role: string) => `delete("${role}")`);
}

// Mock Role class
export class Role {
  static any = () => 'any';
  static user = (id: string) => `user:${id}`;
  static users = () => 'users';
  static guests = () => 'guests';
}

// Mock AppwriteException
export class AppwriteException extends Error {
  code: number;
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  response: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(message: string, code: number = 500, type: string = '', response: any = {}) {
    super(message);
    this.name = 'AppwriteException';
    this.code = code;
    this.type = type;
    this.response = response;
  }
}

export default {
  Client,
  Account,
  Databases,
  Storage,
  Functions,
  Query,
  ID,
  Permission,
  Role,
  AppwriteException,
  Models,
};
