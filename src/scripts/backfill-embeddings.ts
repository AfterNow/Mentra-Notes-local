/**
 * Backfill Embeddings Script
 *
 * One-time script to generate embeddings for all existing notes and conversations
 * that don't have embeddings yet. Safe to re-run.
 *
 * Usage: bun run src/scripts/backfill-embeddings.ts
 */

import mongoose from "mongoose";
import { Note } from "../backend/models/note.model";
import { Conversation } from "../backend/models/conversation.model";
import {
  generateEmbeddings,
  prepareNoteText,
  prepareConversationText,
} from "../backend/services/embedding.service";

const BATCH_SIZE = 20;
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || "";

async function backfillNotes() {
  const notes = await Note.find({ embedding: { $size: 0 } }).lean();
  console.log(`[Backfill] Found ${notes.length} notes without embeddings`);

  let processed = 0;
  let skipped = 0;

  for (let i = 0; i < notes.length; i += BATCH_SIZE) {
    const batch = notes.slice(i, i + BATCH_SIZE);

    // Prepare texts, filtering out notes with insufficient content
    const validNotes: { id: string; text: string }[] = [];
    for (const note of batch) {
      const text = prepareNoteText(note.title, note.content);
      if (text) {
        validNotes.push({ id: note._id.toString(), text });
      } else {
        skipped++;
      }
    }

    if (validNotes.length === 0) continue;

    try {
      const embeddings = await generateEmbeddings(
        validNotes.map((n) => n.text),
      );

      const ops = validNotes.map((note, idx) => ({
        updateOne: {
          filter: { _id: note.id },
          update: { $set: { embedding: embeddings[idx] } },
        },
      }));

      await Note.bulkWrite(ops);
      processed += validNotes.length;
      console.log(
        `[Backfill] Notes: ${processed}/${notes.length} processed, ${skipped} skipped`,
      );
    } catch (error) {
      console.error(`[Backfill] Failed batch at index ${i}:`, error);
    }
  }

  console.log(
    `[Backfill] Notes complete: ${processed} embedded, ${skipped} skipped`,
  );
}

async function backfillConversations() {
  const conversations = await Conversation.find({
    aiSummary: { $ne: "" },
    embedding: { $size: 0 },
  }).lean();
  console.log(
    `[Backfill] Found ${conversations.length} conversations without embeddings`,
  );

  let processed = 0;
  let skipped = 0;

  for (let i = 0; i < conversations.length; i += BATCH_SIZE) {
    const batch = conversations.slice(i, i + BATCH_SIZE);

    const validConvs: { id: string; text: string }[] = [];
    for (const conv of batch) {
      const text = prepareConversationText(conv.title, conv.aiSummary);
      if (text) {
        validConvs.push({ id: conv._id.toString(), text });
      } else {
        skipped++;
      }
    }

    if (validConvs.length === 0) continue;

    try {
      const embeddings = await generateEmbeddings(
        validConvs.map((c) => c.text),
      );

      const ops = validConvs.map((conv, idx) => ({
        updateOne: {
          filter: { _id: conv.id },
          update: { $set: { embedding: embeddings[idx] } },
        },
      }));

      await Conversation.bulkWrite(ops);
      processed += validConvs.length;
      console.log(
        `[Backfill] Conversations: ${processed}/${conversations.length} processed, ${skipped} skipped`,
      );
    } catch (error) {
      console.error(`[Backfill] Failed batch at index ${i}:`, error);
    }
  }

  console.log(
    `[Backfill] Conversations complete: ${processed} embedded, ${skipped} skipped`,
  );
}

async function main() {
  if (!MONGO_URI) {
    console.error("[Backfill] MONGODB_URI or MONGO_URI env var required");
    process.exit(1);
  }

  console.log("[Backfill] Connecting to MongoDB...");
  await mongoose.connect(MONGO_URI);
  console.log("[Backfill] Connected");

  await backfillNotes();
  await backfillConversations();

  await mongoose.disconnect();
  console.log("[Backfill] Done");
}

main().catch((err) => {
  console.error("[Backfill] Fatal error:", err);
  process.exit(1);
});
