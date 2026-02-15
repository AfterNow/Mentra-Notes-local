/**
 * UserState Service
 *
 * Handles user state operations, particularly transcription batch end-of-day tracking.
 */

import { UserState, type UserStateI } from "../models/userState.model";

/**
 * Get or create user state
 * If user doesn't exist, creates a new record with the provided batch end time
 */
export async function createUserState(
  userEmail: string,
  transcriptionBatchEndOfDay: Date
): Promise<UserStateI> {
  let userState = await UserState.findOne({ userEmail });

  if (!userState) {
    userState = await UserState.create({
      userEmail,
      transcriptionBatchEndOfDay,
    });
    console.log( `[UserStateService] Created new UserState for ${userEmail} with EOD: ${transcriptionBatchEndOfDay.toISOString()}` );
  } else {
    console.log( `[UserStateService] Found existing UserState for ${userEmail} with EOD: ${userState.transcriptionBatchEndOfDay.toISOString()}` );
  }

  return userState;
}

/**
 * Get user state by email
 */
export async function getUserState(userEmail: string): Promise<UserStateI | null> {
  return UserState.findOne({ userEmail });
}

/**
 * Update transcription batch end time
 */
export async function updateTranscriptionBatchEndOfDay(
  userEmail: string,
  transcriptionBatchEndOfDay: Date
): Promise<UserStateI | null> {
  return UserState.findOneAndUpdate(
    { userEmail },
    { transcriptionBatchEndOfDay },
    { new: true }
  );
}
