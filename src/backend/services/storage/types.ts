/**
 * Storage Provider Types
 * Unified interface for transcript and photo storage
 */

export type StorageProvider = "r2" | "local";

export interface StorageSegment {
  text: string;
  timestamp: string; // UTC ISO string
  isFinal: boolean;
  speakerId?: string;
  index: number;
  type?: "transcript" | "photo";
  photoUrl?: string;
  photoMimeType?: string;
  photoDescription?: string;
  timezone?: string;
}

export interface StorageBatchData {
  userId: string;
  date: string; // YYYY-MM-DD
  timezone: string;
  batchedAt: string; // UTC ISO string
  segmentCount: number;
  segments: StorageSegment[];
}

export interface UploadResult {
  success: boolean;
  url?: string;
  error?: Error;
}

export interface StorageService {
  /**
   * Upload a batch of transcript segments
   */
  uploadBatch(params: {
    userId: string;
    date: string;
    segments: StorageSegment[];
    timezone: string;
  }): Promise<UploadResult>;

  /**
   * Upload a photo
   */
  uploadPhoto(params: {
    userId: string;
    date: string;
    buffer: Buffer;
    mimeType: string;
    timestamp: Date;
    timezone?: string;
  }): Promise<UploadResult>;

  /**
   * Fetch transcript for a date
   */
  fetchTranscript(userId: string, date: string): Promise<StorageBatchData | null>;

  /**
   * List available transcript dates
   */
  listDates(userId: string): Promise<string[]>;

  /**
   * Delete transcript for a date
   */
  deleteTranscript(userId: string, date: string): Promise<{ success: boolean; error?: Error }>;

  /**
   * Check if storage is configured and available
   */
  isAvailable(): boolean;
}
