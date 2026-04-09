/**
 * Local Filesystem Storage Service
 * Stores transcripts and photos on the local filesystem
 */

import { mkdir, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type {
  StorageService,
  StorageSegment,
  StorageBatchData,
  UploadResult,
} from "./types";

const DEFAULT_STORAGE_PATH = "./data/storage";

export class LocalStorageService implements StorageService {
  private basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath || process.env.LOCAL_STORAGE_PATH || DEFAULT_STORAGE_PATH;
  }

  private getTranscriptPath(userId: string, date: string): string {
    return path.join(this.basePath, "transcripts", userId, date, "transcript.json");
  }

  private getPhotosDir(userId: string, date: string): string {
    return path.join(this.basePath, "transcripts", userId, date, "photos");
  }

  private getUserDir(userId: string): string {
    return path.join(this.basePath, "transcripts", userId);
  }

  private async ensureDir(dirPath: string): Promise<void> {
    if (!existsSync(dirPath)) {
      await mkdir(dirPath, { recursive: true });
    }
  }

  isAvailable(): boolean {
    // Local storage is always available
    return true;
  }

  async uploadBatch(params: {
    userId: string;
    date: string;
    segments: StorageSegment[];
    timezone: string;
  }): Promise<UploadResult> {
    const { userId, date, segments, timezone } = params;

    console.log(`\n[LocalStorage] Starting batch upload for ${userId} (${date})`);
    console.log(`[LocalStorage] Segments count: ${segments.length}`);

    const transcriptPath = this.getTranscriptPath(userId, date);
    const transcriptDir = path.dirname(transcriptPath);

    try {
      // Ensure directory exists
      await this.ensureDir(transcriptDir);

      // Merge with existing file if it exists
      let allSegments = [...segments];
      const existingFile = Bun.file(transcriptPath);

      if (await existingFile.exists()) {
        try {
          const existingData = await existingFile.json() as StorageBatchData;
          if (existingData.segments && Array.isArray(existingData.segments)) {
            // Deduplicate by index
            const existingIndices = new Set(existingData.segments.map(s => s.index));
            const newSegments = segments.filter(s => !existingIndices.has(s.index));
            allSegments = [...existingData.segments, ...newSegments];

            console.log(
              `[LocalStorage] Merged with existing ${existingData.segments.length} segments, added ${newSegments.length} new ones`,
            );
          }
        } catch {
          console.log(`[LocalStorage] Could not parse existing file, starting fresh`);
        }
      }

      // Format batch data
      const batchData: StorageBatchData = {
        userId,
        date,
        timezone,
        batchedAt: new Date().toISOString(),
        segmentCount: allSegments.length,
        segments: allSegments,
      };

      const jsonContent = JSON.stringify(batchData, null, 2);
      await Bun.write(transcriptPath, jsonContent);

      console.log(`[LocalStorage] Successfully saved transcript to ${transcriptPath}`);
      return { success: true, url: transcriptPath };
    } catch (error) {
      console.error(`[LocalStorage] Error saving transcript:`, error);
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  async uploadPhoto(params: {
    userId: string;
    date: string;
    buffer: Buffer;
    mimeType: string;
    timestamp: Date;
    timezone?: string;
  }): Promise<UploadResult> {
    const { userId, date, buffer, mimeType, timestamp } = params;

    const extension = mimeType === "image/png" ? "png" : "jpg";
    const photoFilename = `photo-${timestamp.getTime()}.${extension}`;
    const photosDir = this.getPhotosDir(userId, date);
    const photoPath = path.join(photosDir, photoFilename);

    console.log(`[LocalStorage] Uploading photo ${photoFilename} for ${userId} (${date})`);

    try {
      // Ensure photos directory exists
      await this.ensureDir(photosDir);

      // Write photo file
      await Bun.write(photoPath, buffer);

      // Return relative URL for API access
      const publicUrl = `/api/photos/${date}/${photoFilename}`;
      console.log(`[LocalStorage] Successfully saved photo to ${photoPath}`);

      return { success: true, url: publicUrl };
    } catch (error) {
      console.error(`[LocalStorage] Error saving photo:`, error);
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  async fetchTranscript(userId: string, date: string): Promise<StorageBatchData | null> {
    const transcriptPath = this.getTranscriptPath(userId, date);

    console.log(`[LocalStorage] Fetching transcript for ${userId} on ${date}`);

    try {
      const file = Bun.file(transcriptPath);
      if (!(await file.exists())) {
        console.log(`[LocalStorage] No transcript found for ${date}`);
        return null;
      }

      const data = await file.json() as StorageBatchData;
      console.log(`[LocalStorage] Successfully fetched ${data.segmentCount} segments for ${date}`);

      return data;
    } catch (error) {
      console.error(`[LocalStorage] Error fetching transcript:`, error);
      return null;
    }
  }

  async listDates(userId: string): Promise<string[]> {
    const userDir = this.getUserDir(userId);

    console.log(`[LocalStorage] Listing dates for ${userId}`);

    try {
      if (!existsSync(userDir)) {
        console.log(`[LocalStorage] No data directory for ${userId}`);
        return [];
      }

      const entries = await readdir(userDir, { withFileTypes: true });
      const dates: string[] = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          // Check if it looks like a date (YYYY-MM-DD)
          if (/^\d{4}-\d{2}-\d{2}$/.test(entry.name)) {
            // Verify transcript.json exists
            const transcriptPath = path.join(userDir, entry.name, "transcript.json");
            if (existsSync(transcriptPath)) {
              dates.push(entry.name);
            }
          }
        }
      }

      // Sort descending (most recent first)
      dates.sort((a, b) => b.localeCompare(a));

      console.log(`[LocalStorage] Found ${dates.length} dates for ${userId}`);
      return dates;
    } catch (error) {
      console.error(`[LocalStorage] Error listing dates:`, error);
      return [];
    }
  }

  async deleteTranscript(userId: string, date: string): Promise<{ success: boolean; error?: Error }> {
    const dateDir = path.join(this.getUserDir(userId), date);

    console.log(`[LocalStorage] Deleting transcript for ${userId} (${date})`);

    try {
      if (!existsSync(dateDir)) {
        console.log(`[LocalStorage] Directory not found: ${dateDir}`);
        return { success: true }; // Already deleted
      }

      await rm(dateDir, { recursive: true, force: true });
      console.log(`[LocalStorage] Successfully deleted: ${dateDir}`);

      return { success: true };
    } catch (error) {
      console.error(`[LocalStorage] Error deleting transcript:`, error);
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }
}

export function createLocalStorageService(basePath?: string): StorageService {
  return new LocalStorageService(basePath);
}
