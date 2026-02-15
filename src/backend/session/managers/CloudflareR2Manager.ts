/**
 * CloudflareR2Manager
 *
 * Manages R2 cloud storage uploads for transcript batching.
 * Triggered when the batch cutoff date is crossed (end of day).
 */

import { SyncedManager, synced, rpc } from "../../../lib/sync";
import {
  batchTranscriptsToR2,
  deleteProcessedSegments,
  type TranscriptBatchResult,
} from "../../services/r2Batch.service";
import {
  fetchTranscriptFromR2,
  listR2TranscriptDates,
} from "../../services/r2Fetch.service";
import type { R2BatchData } from "../../services/r2Upload.service";
import type { FileManager } from "./FileManager";

// =============================================================================
// Types
// =============================================================================

export type BatchStatus = "none" | "in_progress" | "success" | "failed";

export interface BatchInfo {
  date: string;
  status: BatchStatus;
  segmentCount: number;
  r2Url?: string;
  error?: string;
  timestamp: string;
}

// =============================================================================
// Manager
// =============================================================================

export class CloudflareR2Manager extends SyncedManager {
  @synced isBatching = false;
  @synced lastBatchDate = "";
  @synced lastBatchStatus: BatchStatus = "none";
  @synced lastBatchSegmentCount = 0;
  @synced lastBatchUrl = "";
  @synced lastBatchError = "";
  @synced r2AvailableDates: string[] = [];

  // ===========================================================================
  // Batch Trigger
  // ===========================================================================

  /**
   * Trigger R2 batch upload for transcripts up to the cutoff timestamp
   * Called by TranscriptManager when batch cutoff is crossed
   *
   * @param userId - User's ID
   * @param cutoffTimestamp - Timestamp to batch up to (ISO string, e.g. 2026-02-05T16:54:59.000Z)
   * @param timezone - User's timezone for metadata
   * @returns Batch result
   */
  async triggerBatch(
    userId: string,
    cutoffTimestamp: string,
    timezone: string,
  ): Promise<TranscriptBatchResult> {
    if (this.isBatching) {
      console.log(`[R2Manager] Batch already in progress, skipping`);
      return {
        success: false,
        date: cutoffTimestamp,
        segmentCount: 0,
        batchedDates: [],
        segmentsByDate: {},
        error: new Error("Batch already in progress"),
      };
    }

    console.log(
      `[R2Manager] Triggering batch for ${userId} up to ${cutoffTimestamp}`,
    );

    this.isBatching = true;
    this.lastBatchStatus = "in_progress";
    this.lastBatchError = "";

    try {
      const result = await batchTranscriptsToR2({
        userId,
        cutoffTimestamp,
        timezone,
      });

      this.isBatching = false;
      this.lastBatchDate = cutoffTimestamp;
      this.lastBatchSegmentCount = result.segmentCount;

      if (result.success) {
        this.lastBatchStatus = "success";
        this.lastBatchUrl = result.r2Url || "";
        console.log(
          `[R2Manager] Batch successful: ${result.segmentCount} segments uploaded across ${result.batchedDates.length} dates`,
        );

        // Notify FileManager about each archived transcript date
        const fileManager = this.getFileManager();
        if (fileManager && result.batchedDates.length > 0) {
          for (const date of result.batchedDates) {
            const r2Key = `transcripts/${userId}/${date}.json`;
            const segmentCount = result.segmentsByDate[date] || 0;
            console.log(`[R2Manager] Notifying FileManager about ${date} (${segmentCount} segments)`);
            await fileManager.onTranscriptArchived(date, r2Key, segmentCount);
          }
        }
      } else {
        this.lastBatchStatus = "failed";
        this.lastBatchError = result.error?.message || "Unknown error";
        console.error(`[R2Manager] Batch failed:`, result.error);
      }

      return result;
    } catch (error) {
      this.isBatching = false;
      this.lastBatchStatus = "failed";
      this.lastBatchError =
        error instanceof Error ? error.message : String(error);

      console.error(`[R2Manager] Batch error:`, error);

      return {
        success: false,
        date: cutoffTimestamp,
        segmentCount: 0,
        batchedDates: [],
        segmentsByDate: {},
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  // ===========================================================================
  // RPC Methods (callable from frontend)
  // ===========================================================================

  /**
   * Manually trigger a batch upload (admin/debug feature)
   */
  @rpc
  async forceBatch(cutoffDate?: string): Promise<BatchInfo> {
    const userId = this._session?.userId;
    if (!userId) {
      return {
        date: cutoffDate || "",
        status: "failed",
        segmentCount: 0,
        error: "No user session",
        timestamp: new Date().toISOString(),
      };
    }

    // Get timezone from settings manager
    const settingsManager = this.getSettingsManager();
    const timezone = settingsManager?.timezone || "UTC";

    // Get TimeManager for date if not provided
    const timeManager = this.getTimeManager();
    const batchDate = cutoffDate || timeManager?.today() || "";

    const result = await this.triggerBatch(userId, batchDate, timezone);

    return {
      date: batchDate,
      status: result.success ? "success" : "failed",
      segmentCount: result.segmentCount,
      r2Url: result.r2Url,
      error: result.error?.message,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get current batch status
   */
  @rpc
  async getBatchStatus(): Promise<BatchInfo> {
    return {
      date: this.lastBatchDate,
      status: this.lastBatchStatus,
      segmentCount: this.lastBatchSegmentCount,
      r2Url: this.lastBatchUrl || undefined,
      error: this.lastBatchError || undefined,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Delete processed segments from MongoDB after confirming R2 upload
   * This is a separate step to allow verification before deletion
   */
  @rpc
  async cleanupProcessedSegments(cutoffTimestamp: string, timezone?: string): Promise<number> {
    const userId = this._session?.userId;
    if (!userId) {
      console.error(`[R2Manager] No user session for cleanup`);
      return 0;
    }

    // Pass timezone through - r2Batch.service will use system default if undefined
    const tz = timezone || this.getSettingsManager()?.timezone || undefined;

    return deleteProcessedSegments({ userId, cutoffTimestamp, timezone: tz });
  }

  // ===========================================================================
  // R2 Fetch Methods
  // ===========================================================================

  /**
   * Fetch transcript data from R2 for a specific date
   * Returns the R2BatchData if found, null otherwise
   */
  async fetchTranscript(date: string): Promise<R2BatchData | null> {
    const userId = this._session?.userId;
    if (!userId) {
      console.error(`[R2Manager] No user session for fetch`);
      return null;
    }

    console.log(`[R2Manager] fetchTranscript(${date}) for user ${userId}`);
    const result = await fetchTranscriptFromR2({ userId, date });

    if (result.success && result.data) {
      console.log(`[R2Manager] ✓ Found R2 transcript for ${date}: ${result.data.segments?.length || 0} segments`);
      return result.data;
    } else {
      console.log(`[R2Manager] ✗ No R2 transcript found for ${date}`, result.error || '');
      return null;
    }
  }

  /**
   * Get list of dates that have transcripts in R2
   * Called during hydrate to populate folder list
   */
  async loadR2AvailableDates(): Promise<string[]> {
    const userId = this._session?.userId;
    if (!userId) {
      console.log(`[R2Manager] loadR2AvailableDates: No userId`);
      return [];
    }

    console.log(`[R2Manager] Loading available R2 dates for ${userId}...`);
    const result = await listR2TranscriptDates(userId);
    if (result.success) {
      console.log(`[R2Manager] ✓ Found ${result.dates.length} R2 dates:`, result.dates);
      this.r2AvailableDates = result.dates;
      return result.dates;
    }
    console.log(`[R2Manager] ✗ Failed to list R2 dates:`, result.error || 'unknown error');
    return [];
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private getSettingsManager(): { timezone: string | null } | null {
    // Access settings manager through session
    const session = this._session as any;
    return session?.settings || null;
  }

  private getTimeManager(): { today: () => string } | null {
    // Access time manager through transcript manager
    const session = this._session as any;
    return session?.transcript?.getTimeManager?.() || null;
  }

  private getFileManager(): FileManager | null {
    return (this._session as any)?.file || null;
  }
}
