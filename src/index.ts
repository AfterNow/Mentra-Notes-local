/**
 * Notes - All-day transcription and AI-powered note generation
 *
 * A MentraOS app that:
 * - Transcribes user speech throughout the day
 * - Generates AI-powered notes from transcripts
 * - Persists data to MongoDB
 * - Syncs state in real-time via WebSocket
 */

// Bun TLS workaround: disable cert verification for MongoDB Atlas connections
// See: https://github.com/oven-sh/bun/issues/TLS
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import { NotesApp } from "./backend/NotesApp";
import { api } from "./backend/api/router";
import { createMentraAuthRoutes } from "@mentra/sdk";
import indexDev from "./frontend/index.html";
import indexProd from "./frontend/index.prod.html";
import { sessions } from "./backend/session";
import { getStorageProvider, isStorageAvailable } from "./backend/services/storage";

// Configuration from environment
const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0"; // Default to 0.0.0.0 for Docker
const PACKAGE_NAME = process.env.PACKAGE_NAME;
const API_KEY = process.env.MENTRAOS_API_KEY;
const COOKIE_SECRET = process.env.COOKIE_SECRET || API_KEY;

// Validate required environment variables
if (!PACKAGE_NAME) {
  console.error("❌ PACKAGE_NAME environment variable is not set");
  process.exit(1);
}

if (!API_KEY) {
  console.error("❌ MENTRAOS_API_KEY environment variable is not set");
  process.exit(1);
}

// Check optional integrations
const agentProvider = process.env.AGENT_PROVIDER?.toLowerCase();
const hasGemini = !!process.env.GEMINI_API_KEY;
const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
const hasOpenAI = !!process.env.OPENAI_API_KEY;
const hasOllama = agentProvider === "ollama";
const hasLlamaCpp = agentProvider === "llamacpp" || agentProvider === "llama";
const hasLocalLLM = hasOllama || hasLlamaCpp;
const hasCloudLLM = hasGemini || hasAnthropic || hasOpenAI;
const hasAI = hasLocalLLM || hasCloudLLM;
const hasMongoDB = !!process.env.MONGODB_URI;

function getAIProviderStatus(): string {
  if (hasOllama) {
    const baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
    const model = process.env.OLLAMA_MODEL_FAST || "llama3.1";
    return `✅ Ollama (${model} @ ${baseUrl})`;
  }
  if (hasLlamaCpp) {
    const baseUrl = process.env.LLAMACPP_BASE_URL || "http://localhost:8080";
    const model = process.env.LLAMACPP_MODEL || "local-model";
    return `✅ llama.cpp (${model} @ ${baseUrl})`;
  }
  if (hasGemini) return "✅ Gemini";
  if (hasAnthropic) return "✅ Anthropic";
  if (hasOpenAI) return "✅ OpenAI";
  return "⚠️  (Optional - Set AGENT_PROVIDER or API keys for AI features)";
}

function getStorageStatus(): string {
  const storageProvider = getStorageProvider();
  const storageAvailable = isStorageAvailable();
  const storagePath = process.env.LOCAL_STORAGE_PATH || "./data/storage";

  if (!storageAvailable) {
    return "⚠️  Not configured";
  }

  if (storageProvider === "r2") {
    return "✅ Cloudflare R2";
  }

  return `✅ Local (${storagePath})`;
}

console.log("🚀 Starting Notes - All-day transcription app\n");
console.log(`   Package: ${PACKAGE_NAME}`);
console.log(`   Host: ${HOST}:${PORT}`);
console.log("");
console.log("   Integrations:");
console.log(`   • AI Provider: ${getAIProviderStatus()}`);
console.log(`   • Storage:     ${getStorageStatus()}`);
console.log(
  `   • MongoDB:     ${hasMongoDB ? "✅ MongoDB URI" : "⚠️  (Optional - Set MONGODB_URI for persistence)"}`,
);
console.log("");

// Initialize App (extends Hono via AppServer)
const app = new NotesApp({
  packageName: PACKAGE_NAME,
  apiKey: API_KEY,
  port: PORT,
  cookieSecret: COOKIE_SECRET,
});

// Mount Mentra auth routes for frontend token exchange
app.route(
  "/api/mentra/auth",
  createMentraAuthRoutes({
    apiKey: API_KEY,
    packageName: PACKAGE_NAME,
    cookieSecret: COOKIE_SECRET || "",
  }),
);

// Mount API routes
// @ts-ignore - Hono type compatibility
app.route("/api", api);

// Start the SDK app (registers SDK routes, checks version)
await app.start();

console.log(`✅ Notes app running at http://${HOST}:${PORT}`);
console.log(`   • Webview: http://${HOST}:${PORT}`);
console.log(`   • API: http://${HOST}:${PORT}/api/health`);
console.log("");

// Determine environment
const isDevelopment = process.env.NODE_ENV === "development";

// Start Bun server with HMR support and WebSocket
Bun.serve({
  port: PORT,
  hostname: HOST,
  idleTimeout: 120, // 2 minutes for SSE connections
  development: isDevelopment && {
    hmr: true,
    console: true,
  },
  routes: {
    // Serve webview at root and /app
    "/": isDevelopment ? indexDev : indexProd,
    "/app": isDevelopment ? indexDev : indexProd,
    "/day/*": isDevelopment ? indexDev : indexProd,
    "/note/*": isDevelopment ? indexDev : indexProd,
    "/transcript/*": isDevelopment ? indexDev : indexProd,
    "/search": isDevelopment ? indexDev : indexProd,
    "/settings": isDevelopment ? indexDev : indexProd,
    "/onboarding": isDevelopment ? indexDev : indexProd,
  },
  async fetch(request, server) {
    const url = new URL(request.url);

    // Serve static fonts
    if (url.pathname.startsWith("/fonts/")) {
      const fontFile = Bun.file(
        import.meta.dir + "/public" + url.pathname,
      );
      if (await fontFile.exists()) {
        return new Response(fontFile, {
          headers: { "Cache-Control": "public, max-age=31536000, immutable" },
        });
      }
      return new Response("Not found", { status: 404 });
    }

    // WebSocket upgrade for synced clients
    if (url.pathname === "/ws/sync") {
      const userId = url.searchParams.get("userId");
      if (!userId) {
        return new Response("userId required", { status: 400 });
      }

      const upgraded = server.upgrade(request, {
        data: { userId } as any,
      });

      if (!upgraded) {
        return new Response("WebSocket upgrade failed", { status: 400 });
      }

      return undefined;
    }

    // Handle all other requests through Hono app
    return app.fetch(request);
  },

  websocket: {
    async open(ws: any) {
      const { userId } = ws.data as { userId: string };
      console.log(`[WS/Sync] Client connecting for ${userId}`);

      // Get or create session - works with or without glasses
      const session = await sessions.getOrCreate(userId);
      session.addClient(ws);
    },

    async message(ws: any, message: any) {
      const { userId } = ws.data as { userId: string };
      const session = sessions.get(userId);

      if (session) {
        await session.handleMessage(ws, message.toString());
      }
    },

    async close(ws: any) {
      const { userId } = ws.data as { userId: string };
      console.log(`[WS/Sync] Client disconnected for ${userId}`);

      const session = sessions.get(userId);
      if (session) {
        session.removeClient(ws);
      }
    },
  },
});

if (isDevelopment) {
  console.log(`🔥 HMR enabled for development`);
}
console.log("");

// Graceful shutdown
const shutdown = async () => {
  console.log("\n🛑 Shutting down Notes...");
  await app.stop();
  console.log("👋 Goodbye!");
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
