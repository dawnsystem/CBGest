import { afterEach, vi } from 'vitest';
import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'util';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock environment variables
vi.stubEnv('VITE_GEMINI_API_KEY', 'test-gemini-key');
vi.stubEnv('API_KEY', 'test-api-key'); // For geminiService.ts (uses process.env.API_KEY)

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

// Mock sessionStorage
const sessionStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock,
  writable: true,
  configurable: true,
});

// Mock File API
if (typeof global.File === 'undefined') {
  // @ts-expect-error - Mock for testing environment
  global.File = class MockFile {
    name: string;
    size: number;
    type: string;
    lastModified: number;

    constructor(bits: BlobPart[], name: string, options?: FilePropertyBag) {
      this.name = name;
      this.size = bits.reduce((acc, bit) => acc + (typeof bit === 'string' ? bit.length : (bit as any).byteLength || 0), 0);
      this.type = options?.type || '';
      this.lastModified = options?.lastModified || Date.now();
    }
  };
}

// Mock FileReader API
if (typeof global.FileReader === 'undefined') {
  // @ts-expect-error - Mock for testing environment
  global.FileReader = class MockFileReader {
    result: string | ArrayBuffer | null = null;
    error: Error | null = null;
    readyState: number = 0;
    onload: ((event: any) => void) | null = null;
    onerror: ((event: any) => void) | null = null;
    onprogress: ((event: any) => void) | null = null;
    onloadend: ((event: any) => void) | null = null;

    readAsDataURL(_blob: Blob) {
      this.readyState = 2;
      this.result = 'data:text/plain;base64,dGVzdA==';
      setTimeout(() => {
        if (this.onload) {
          this.onload({ target: this });
        }
        if (this.onloadend) {
          this.onloadend({ target: this });
        }
      }, 0);
    }

    readAsText(_blob: Blob) {
      this.readyState = 2;
      this.result = 'test content';
      setTimeout(() => {
        if (this.onload) {
          this.onload({ target: this });
        }
        if (this.onloadend) {
          this.onloadend({ target: this });
        }
      }, 0);
    }

    readAsArrayBuffer(_blob: Blob) {
      this.readyState = 2;
      this.result = new ArrayBuffer(8);
      setTimeout(() => {
        if (this.onload) {
          this.onload({ target: this });
        }
        if (this.onloadend) {
          this.onloadend({ target: this });
        }
      }, 0);
    }

    abort() {
      this.readyState = 2;
    }
  };
}

// Mock Blob API (if needed)
if (typeof global.Blob === 'undefined') {
  // @ts-expect-error - Mock for testing environment
  global.Blob = class MockBlob {
    size: number;
    type: string;

    constructor(_parts?: BlobPart[], options?: BlobPropertyBag) {
      this.size = 0;
      this.type = options?.type || '';
    }
  };
}

// Mock atob and btoa
if (typeof global.atob === 'undefined') {
  global.atob = (str: string) => Buffer.from(str, 'base64').toString('binary');
}

if (typeof global.btoa === 'undefined') {
  global.btoa = (str: string) => Buffer.from(str, 'binary').toString('base64');
}

// Mock TextEncoder and TextDecoder
if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = NodeTextEncoder;
  global.TextDecoder = NodeTextDecoder as typeof TextDecoder;
}

// Note: setInterval and clearInterval are already available in Node.js - no mock needed

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver
class IntersectionObserverMock {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}

Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: IntersectionObserverMock,
});

// Mock ResizeObserver
class ResizeObserverMock {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  configurable: true,
  value: ResizeObserverMock,
});

// Suppress console warnings in tests (optional, uncomment if needed for cleaner test output)
// const originalWarn = console.warn;
// console.warn = (...args: any[]) => {
//   if (typeof args[0] === 'string' && args[0].includes('Warning: ReactDOM.render')) {
//     return;
//   }
//   originalWarn.apply(console, args);
// };
