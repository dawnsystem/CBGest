type PlainObject = Record<string, unknown>;

const isPlainObject = (value: unknown): value is PlainObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const mergeWithDefaults = <T>(defaults: T, persisted: unknown): T => {
  if (Array.isArray(defaults)) {
    return (Array.isArray(persisted) ? persisted : defaults) as T;
  }

  if (!isPlainObject(defaults) || !isPlainObject(persisted)) {
    return (persisted ?? defaults) as T;
  }

  const result: PlainObject = { ...defaults };

  for (const [key, value] of Object.entries(persisted)) {
    const current = result[key];
    result[key] = isPlainObject(current) && isPlainObject(value)
      ? mergeWithDefaults(current, value)
      : value;
  }

  return result as T;
};

export const loadPersistedState = <T>(key: string, defaults: T): T => {
  const saved = localStorage.getItem(key);
  if (!saved) {
    return defaults;
  }

  try {
    return mergeWithDefaults(defaults, JSON.parse(saved));
  } catch (error) {
    console.error(`Error parsing persisted state for ${key}`, error);
    return defaults;
  }
};
