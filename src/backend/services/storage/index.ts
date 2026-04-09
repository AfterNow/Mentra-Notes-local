/**
 * Storage Service Factory
 * Auto-selects between R2 and local storage based on configuration
 */

export type {
  StorageService,
  StorageSegment,
  StorageBatchData,
  UploadResult,
  StorageProvider,
} from "./types";

export { LocalStorageService, createLocalStorageService } from "./local";
export { R2StorageService, createR2StorageService } from "./r2";

import type { StorageService, StorageProvider } from "./types";
import { createLocalStorageService } from "./local";
import { createR2StorageService } from "./r2";

let _storageService: StorageService | null = null;

/**
 * Get the configured storage provider type
 */
export function getStorageProvider(): StorageProvider {
  const explicit = process.env.STORAGE_PROVIDER?.toLowerCase();
  if (explicit === "local") return "local";
  if (explicit === "r2") return "r2";

  // Auto-detect: use R2 if configured, otherwise local
  const hasR2 = !!(
    process.env.CLOUDFLARE_R2_ENDPOINT &&
    process.env.CLOUDFLARE_R2_ACCESS_KEY_ID &&
    process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
  );

  return hasR2 ? "r2" : "local";
}

/**
 * Get or create the storage service singleton
 */
export function getStorageService(): StorageService {
  if (!_storageService) {
    const provider = getStorageProvider();
    console.log(`[Storage] Using ${provider} storage provider`);

    if (provider === "r2") {
      _storageService = createR2StorageService();
    } else {
      _storageService = createLocalStorageService();
    }
  }
  return _storageService;
}

/**
 * Check if storage is available
 */
export function isStorageAvailable(): boolean {
  return getStorageService().isAvailable();
}

/**
 * Reset the storage service singleton (for testing)
 */
export function resetStorageService(): void {
  _storageService = null;
}
