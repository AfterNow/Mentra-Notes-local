/**
 * Database Connection Management
 *
 * Handles MongoDB connection lifecycle.
 * Models are in backend/models/ folder.
 */

import mongoose from "mongoose";

let isConnected = false;
let connectionAttempted = false;

/**
 * Connect to MongoDB
 */
export async function connectDB(): Promise<void> {
  if (isConnected) {
    return;
  }

  connectionAttempted = true;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn("[DB] ⚠️  MONGODB_URI not set - database features disabled");
    console.warn("[DB]    App will work with reduced functionality (no persistence)");
    return;
  }

  try {
    // 15 minutes timeout - allows for slow MongoDB startup in Docker
    const timeoutMS = 15 * 60 * 1000; // 15 minutes
    
    await mongoose.connect(uri, {
      dbName: "notes",
      tlsAllowInvalidCertificates: true,
      tlsAllowInvalidHostnames: true,
      serverSelectionTimeoutMS: timeoutMS,
      connectTimeoutMS: timeoutMS,
    });
    isConnected = true;
    console.log("[DB] ✅ Connected to MongoDB");
  } catch (error) {
    console.error("[DB] ❌ Connection failed:", error instanceof Error ? error.message : error);
    console.warn("[DB]    App will work with reduced functionality (no persistence)");
    // Don't throw - let app continue without DB
  }
}

/**
 * Disconnect from MongoDB
 */
export async function disconnectDB(): Promise<void> {
  if (!isConnected) {
    return;
  }

  try {
    await mongoose.disconnect();
    isConnected = false;
    console.log("[DB] Disconnected from MongoDB");
  } catch (error) {
    console.error("[DB] Disconnect failed:", error);
  }
}

/**
 * Check if connected to database
 */
export function isDBConnected(): boolean {
  return isConnected;
}

/**
 * Check if database connection was attempted
 * (useful to know if we're still waiting for connection vs. no DB configured)
 */
export function isDBConfigured(): boolean {
  return !!process.env.MONGODB_URI;
}

/**
 * Check if database is ready for operations
 * Returns true only if connected and ready
 */
export function isDBReady(): boolean {
  return isConnected && mongoose.connection.readyState === 1;
}
