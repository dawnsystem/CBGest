import { describe, expect, it, beforeEach } from 'vitest';
import { loadPersistedState, mergeWithDefaults } from '../stateStorage';

describe('stateStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should deeply merge persisted objects with defaults', () => {
    const defaults = {
      name: 'default',
      nested: {
        enabled: true,
        endpoint: 'https://default.test',
      },
    };

    const merged = mergeWithDefaults(defaults, {
      nested: {
        endpoint: 'https://custom.test',
      },
    });

    expect(merged).toEqual({
      name: 'default',
      nested: {
        enabled: true,
        endpoint: 'https://custom.test',
      },
    });
  });

  it('should load and merge persisted state from localStorage', () => {
    localStorage.setItem('settings', JSON.stringify({
      nested: { enabled: false },
    }));

    const loaded = loadPersistedState('settings', {
      name: 'cbgest',
      nested: {
        enabled: true,
        endpoint: 'https://default.test',
      },
    });

    expect(loaded).toEqual({
      name: 'cbgest',
      nested: {
        enabled: false,
        endpoint: 'https://default.test',
      },
    });
  });

  it('should fall back to defaults when persisted state is invalid', () => {
    localStorage.setItem('settings', '{invalid-json');

    expect(loadPersistedState('settings', { safe: true })).toEqual({ safe: true });
  });

  it('should preserve default arrays when persisted value is not an array', () => {
    expect(mergeWithDefaults(['a', 'b'], 'invalid')).toEqual(['a', 'b']);
  });

  it('should return defaults when there is no persisted value', () => {
    expect(loadPersistedState('missing', { ready: true })).toEqual({ ready: true });
  });
});
