/**
 * R2 Storage Service
 * Wraps existing R2 upload/fetch services with StorageService interface
 */

import type {
  StorageService,
  StorageSegment,
  StorageBatchData,
  UploadResult,
} from "./types";
import {
  uploadBatchToR2,
  uploadPhotoToR2,
  deleteFromR2,
  type R2TranscriptSegment,
  type R2BatchData,
} from "../r2Upload.service";
import {
  fetchTranscriptFromR2,
  listR2TranscriptDates,
} from "../r2Fetch.service";

/**
 * Check if R2 credentials are configured
 */
function isR2Configured(): boolean {
  return !!(
    process.env.CLOUDFLARE_R2_ENDPOINT &&
    process.env.CLOUDFLARE_R2_ACCESS_KEY_ID &&
    process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
  );
}

/**
 * Convert StorageSegment to R2TranscriptSegment format
 */
function toR2Segment(segment: StorageSegment): R2TranscriptSegment {
  return {
    text: segment.text,
    timestamp: segment.timestamp,
    isFinal: segment.isFinal,
    speakerId: segment.speakerId,
    index: segment.index,
    type: segment.type,
    photoUrl: segment.photoUrl,
    photoMimeType: segment.photoMimeType,
    photoDescription: segment.photoDescription,
    timezone: segment.timezone,
  };
}

/**
 * Convert R2BatchData to StorageBatchData format
 */
function fromR2BatchData(r2Data: R2BatchData): StorageBatchData {
  return {
    userId: r2Data.userId,
    date: r2Data.date,
    timezone: r2Data.timezone,
    batchedAt: r2Data.batchedAt,
    segmentCount: r2Data.segmentCount,
    segments: r2Data.segments.map((s) => ({
      text: s.text,
      timestamp: s.timestamp,
      isFinal: s.isFinal,
      speakerId: s.speakerId,
      index: s.index,
      type: s.type,
      photoUrl: s.photoUrl,
      photoMimeType: s.photoMimeType,
      photoDescription: s.photoDescription,
      timezone: s.timezone,
    })),
  };
}

export class R2StorageService implements StorageService {
  isAvailable(): boolean {
    return isR2Configured();
  }

  async uploadBatch(params: {
    userId: string;
    date: string;
    segments: StorageSegment[];
    timezone: string;
  }): Promise<UploadResult> {
    const r2Segments = params.segments.map(toR2Segment);
    return uploadBatchToR2({
      userId: params.userId,
      date: params.date,
      segments: r2Segments,
      timezone: params.timezone,
    });
  }

  async uploadPhoto(params: {
    userId: string;
    date: string;
    buffer: Buffer;
    mimeType: string;
    timestamp: Date;
    timezone?: string;
  }): Promise<UploadResult> {
    return uploadPhotoToR2(params);
  }

  async fetchTranscript(userId: string, date: string): Promise<StorageBatchData | null> {
    const result = await fetchTranscriptFromR2({ userId, date });
    if (result.success && result.data) {
      return fromR2BatchData(result.data);
    }
    return null;
  }

  async listDates(userId: string): Promise<string[]> {
    const result = await listR2TranscriptDates(userId);
    return result.success ? result.dates : [];
  }

  async deleteTranscript(userId: string, date: string): Promise<{ success: boolean; error?: Error }> {
    return deleteFromR2({ userId, date });
  }
}

export function createR2StorageService(): StorageService {
  return new R2StorageService();
}
