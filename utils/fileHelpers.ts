export const sanitizeFileNameSegment = (value: string): string =>
  value.trim().replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_');
