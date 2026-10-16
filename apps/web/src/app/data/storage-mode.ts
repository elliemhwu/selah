/**
 * Where this build keeps the data (ADR 0029). The release build keeps it on
 * the device; the development build swaps in `storage-mode.api.ts`.
 */
export const STORAGE_MODE: 'device' | 'api' = 'device';
