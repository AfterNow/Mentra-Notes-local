import {
  DailyTranscript,
  type TranscriptSegmentI,
} from "../models/daily-transcript.model";
import {
  formatSegmentForR2,
  type R2TranscriptSegment,
} from "./r2Upload.service";
import { getStorageService, type StorageSegment } from "./storage";

// =============================================================================
// Interfaces
// =============================================================================

export interface TranscriptBatchResult {
  success: boolean;
  date: string; // Cutoff timestamp used for batching (UTC ISO string)
  segmentCount: number;
  batchedDates: string[]; // All dates (YYYY-MM-DD) that were batched to R2
  segmentsByDate: Record<string, number>; // Segment count per date
  r2Url?: string;
  error?: Error;
}

// =============================================================================
// Main Batch Function
// =============================================================================

/**
 * Batch all transcript segments for a given user where segment timestamp is BEFORE the cutoff timestamp.
 * Filters by ISO timestamp directly for precision.
 *
 * @param userId - User's ID
 * @param cutoffTimestamp - Cutoff as UTC ISO string (e.g. 2026-02-06T07:59:59.000Z)
 * @param timezone - User's timezone (e.g. "America/Los_Angeles") for R2 metadata
 * @returns Batch result with counts and all batched dates
 */
export async function batchTranscriptsToR2(params: {
  userId: string;
  cutoffTimestamp: string;
  timezone: string;
}): Promise<TranscriptBatchResult> {
  const { userId, cutoffTimestamp, timezone } = params;
  const cutoffDate = new Date(cutoffTimestamp);

  console.log(
    `\n[R2Batch] Starting batch for ${userId}`,
  );
  console.log(`[R2Batch] Cutoff timestamp (UTC): ${cutoffTimestamp}`);
  console.log(`[R2Batch] Timezone: ${timezone}`);
  console.log(`[R2Batch] Will batch all segments with timestamp < ${cutoffTimestamp}`);

  try {
    // Query all DailyTranscripts for this user that have segments
    const dailyTranscripts = await DailyTranscript.find({
      userId,
      totalSegments: { $gt: 0 },
    })
      .sort({ date: 1 })
      .exec();

    console.log(
      `[R2Batch] Found ${dailyTranscripts.length} daily transcripts to check`,
    );

    if (dailyTranscripts.length === 0) {
      console.log(`[R2Batch] No transcripts found for user`);
      return {
        success: true,
        date: cutoffTimestamp,
        segmentCount: 0,
        batchedDates: [],
        segmentsByDate: {},
      };
    }

    // Prepare segments by date - filter by ISO timestamp
    const segmentsByDateForR2: Record<string, R2TranscriptSegment[]> = {};
    const segmentCountByDate: Record<string, number> = {};
    let totalSegmentsFound = 0;

    for (const dailyTranscript of dailyTranscripts) {
      const { date, segments } = dailyTranscript;

      if (!segments || segments.length === 0) continue;

      // Filter segments where timestamp < cutoffTimestamp (ISO comparison)
      const segmentsToBatch = segments.filter((segment) => {
        const segmentTime = new Date(segment.timestamp);
        return segmentTime < cutoffDate;
      });

      if (segmentsToBatch.length === 0) {
        console.log(`[R2Batch] Date ${date}: 0 segments below cutoff (${segments.length} total)`);
        continue;
      }

      segmentsByDateForR2[date] = segmentsToBatch.map((segment) =>
        formatSegmentForR2(segment as TranscriptSegmentI),
      );
      segmentCountByDate[date] = segmentsToBatch.length;
      totalSegmentsFound += segmentsToBatch.length;

      console.log(
        `[R2Batch] Date ${date}: ${segmentsToBatch.length}/${segments.length} segments below cutoff`,
      );
    }

    // Log which dates will be batched
    const datesToBatch = Object.keys(segmentsByDateForR2);
    if (datesToBatch.length > 0) {
      console.log(`[R2Batch] Dates to batch: ${datesToBatch.join(", ")}`);
    }

    if (totalSegmentsFound === 0) {
      console.log(`[R2Batch] No segments found below cutoff timestamp`);
      return {
        success: true,
        date: cutoffTimestamp,
        segmentCount: 0,
        batchedDates: [],
        segmentsByDate: {},
      };
    }

    // Upload each day's segments using storage abstraction
    const storageService = getStorageService();
    let totalUploaded = 0;
    let lastUrl: string | undefined;
    const successfullyBatchedDates: string[] = [];

    for (const [date, r2Segments] of Object.entries(segmentsByDateForR2)) {
      console.log(
        `[Batch] Uploading ${r2Segments.length} segments for ${date}`,
      );

      // Convert R2TranscriptSegment to StorageSegment
      const storageSegments: StorageSegment[] = r2Segments.map((s) => ({
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
      }));

      const result = await storageService.uploadBatch({
        userId,
        date,
        segments: storageSegments,
        timezone,
      });

      if (!result.success) {
        console.error(
          `[Batch] Failed to upload batch for ${date}:`,
          result.error,
        );
        return {
          success: false,
          date: cutoffTimestamp,
          segmentCount: totalUploaded,
          batchedDates: successfullyBatchedDates,
          segmentsByDate: segmentCountByDate,
          error: result.error,
        };
      }

      totalUploaded += r2Segments.length;
      lastUrl = result.url;
      successfullyBatchedDates.push(date);
      console.log(
        `[Batch] ✓ Successfully uploaded ${r2Segments.length} segments for ${date}`,
      );
    }

    console.log(`[R2Batch] ✓ Batch complete! Total uploaded: ${totalUploaded} segments across ${successfullyBatchedDates.length} dates`);

    return {
      success: true,
      date: cutoffTimestamp,
      segmentCount: totalUploaded,
      batchedDates: successfullyBatchedDates,
      segmentsByDate: segmentCountByDate,
      r2Url: lastUrl,
    };
  } catch (error) {
    console.error(`[R2Batch] Error during batching:`, error);
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

/**
 * Delete processed segments from MongoDB after successful R2 upload.
 * Filters by ISO timestamp directly - deletes segments where timestamp < cutoffTimestamp.
 * Documents that become empty (all segments deleted) are removed entirely.
 *
 * @param userId - User's ID
 * @param cutoffTimestamp - Cutoff as UTC ISO string (e.g. 2026-02-07T07:59:59.000+00:00)
 * @returns Number of segments deleted
 */
export async function deleteProcessedSegments(params: {
  userId: string;
  cutoffTimestamp: string;
  timezone?: string;
}): Promise<number> {
  const { userId, cutoffTimestamp } = params;
  const cutoffDate = new Date(cutoffTimestamp);

  console.log(
    `[R2Batch] Deleting segments for ${userId} where timestamp < ${cutoffTimestamp}`,
  );

  try {
    // Find all daily transcripts for this user
    const dailyTranscripts = await DailyTranscript.find({
      userId,
    }).exec();

    let totalDeleted = 0;
    const affectedDates: string[] = [];

    for (const doc of dailyTranscripts) {
      if (!doc.segments || doc.segments.length === 0) continue;

      const originalCount = doc.segments.length;

      // Filter segments: keep only those with timestamp >= cutoffTimestamp
      const remainingSegments = doc.segments.filter((segment) => {
        const segmentTime = new Date(segment.timestamp);
        return segmentTime >= cutoffDate;
      });

      const deletedCount = originalCount - remainingSegments.length;

      if (deletedCount === 0) {
        console.log(`[R2Batch] Date ${doc.date}: 0 segments to delete (${originalCount} total)`);
        continue;
      }

      if (remainingSegments.length === 0) {
        // All segments deleted - remove entire document
        await DailyTranscript.deleteOne({ _id: doc._id }).exec();
        console.log(
          `[R2Batch] ✓ Deleted entire DailyTranscript for ${doc.date} (${deletedCount} segments)`,
        );
      } else {
        // Some segments remain - update document
        doc.segments = remainingSegments;
        doc.totalSegments = remainingSegments.length;
        await doc.save();
        console.log(
          `[R2Batch] ✓ Removed ${deletedCount} segments from ${doc.date} (${remainingSegments.length} remaining)`,
        );
      }

      totalDeleted += deletedCount;
      affectedDates.push(doc.date);
    }

    console.log(`[R2Batch] ✓ Cleanup complete: ${totalDeleted} segments deleted across ${affectedDates.length} dates`);
    return totalDeleted;
  } catch (error) {
    console.error(`[R2Batch] Error deleting segments:`, error);
    throw error;
  }
}

/**
 * Get dates that have been batched to R2 for a user
 * Useful for checking what's already been uploaded
 */
export async function getUnbatchedDates(userId: string): Promise<string[]> {
  const transcripts = await DailyTranscript.find(
    { userId, totalSegments: { $gt: 0 } },
    { date: 1 },
  ).sort({ date: 1 });

  return transcripts.map((t) => t.date);
}
