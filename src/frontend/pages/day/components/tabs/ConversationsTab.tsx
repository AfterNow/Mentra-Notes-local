/**
 * ConversationsTab - Displays auto-detected conversations for a specific day
 *
 * Shows:
 * - List of conversation cards with status badges (Live/Paused/Ended)
 * - Expandable cards showing summary + transcript
 * - Empty state when no conversations detected
 */

import { useState } from "react";
import { clsx } from "clsx";
import {
  MessagesSquare,
  ChevronDown,
  ChevronUp,
  Trash2,
  Loader2,
} from "lucide-react";
import type { Conversation, ConversationChunk } from "../../../../../shared/types";

interface ConversationsTabProps {
  conversations: Conversation[];
  isLoading?: boolean;
  onDeleteConversation?: (conversationId: string) => void;
}

export function ConversationsTab({
  conversations,
  isLoading = false,
  onDeleteConversation,
}: ConversationsTabProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Loading state
  if (isLoading) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-4 pt-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-xl space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="h-4 w-1/2 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
                <div className="h-5 w-16 bg-zinc-200 dark:bg-zinc-800 rounded-full animate-pulse" />
              </div>
              <div className="h-3 w-3/4 bg-zinc-100 dark:bg-zinc-800/60 rounded animate-pulse" />
              <div className="h-3 w-1/3 bg-zinc-100 dark:bg-zinc-800/60 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (conversations.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-6">
        <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center mb-4">
          <MessagesSquare
            size={24}
            className="text-zinc-400 dark:text-zinc-500"
          />
        </div>
        <h3 className="text-base font-medium text-zinc-900 dark:text-white mb-1">
          No conversations detected yet
        </h3>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-xs">
          Conversations will appear here as they're automatically detected from
          your transcript.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 pt-4 space-y-3">
        {/* Conversation cards */}
        {conversations.map((conversation) => (
          <ConversationCard
            key={conversation.id}
            conversation={conversation}
            isExpanded={expandedId === conversation.id}
            onToggle={() =>
              setExpandedId(
                expandedId === conversation.id ? null : conversation.id,
              )
            }
            onDelete={onDeleteConversation}
          />
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// ConversationCard
// =============================================================================

interface ConversationCardProps {
  conversation: Conversation;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete?: (conversationId: string) => void;
}

function ConversationCard({
  conversation,
  isExpanded,
  onToggle,
  onDelete,
}: ConversationCardProps) {
  const [activeSection, setActiveSection] = useState<"summary" | "transcript">(
    "summary",
  );

  const timeRange = formatTimeRange(
    conversation.startTime,
    conversation.endTime,
  );

  const previewText = conversation.runningSummary || "";
  const preview =
    previewText.length > 120
      ? previewText.substring(0, 120) + "..."
      : previewText;

  return (
    <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900 overflow-hidden">
      {/* Card header — always visible */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
        className="w-full text-left p-4 flex flex-col gap-2 cursor-pointer"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-zinc-900 dark:text-white truncate flex items-center gap-1.5">
              {conversation.title || (
                conversation.status === "ended" && !conversation.generatingSummary
                  ? "Untitled Conversation"
                  : <>
                      <Loader2 size={12} className="animate-spin text-zinc-400 shrink-0" />
                      <span className="text-zinc-400">Generating...</span>
                    </>
              )}
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              {timeRange}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge conversation={conversation} />
            {onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(conversation.id);
                }}
                className="p-1 rounded-md text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                title="Delete conversation"
              >
                <Trash2 size={13} />
              </button>
            )}
            {isExpanded ? (
              <ChevronUp size={14} className="text-zinc-400" />
            ) : (
              <ChevronDown size={14} className="text-zinc-400" />
            )}
          </div>
        </div>

        {/* Preview — only when collapsed */}
        {!isExpanded && preview && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
            {preview}
          </p>
        )}
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-zinc-200 dark:border-zinc-800">
          {/* Section toggle */}
          <div className="flex border-b border-zinc-200 dark:border-zinc-800">
            <button
              onClick={() => setActiveSection("summary")}
              className={clsx(
                "flex-1 py-2.5 text-xs font-medium transition-colors",
                activeSection === "summary"
                  ? "text-zinc-900 dark:text-white bg-white dark:bg-zinc-800"
                  : "text-zinc-500 dark:text-zinc-400",
              )}
            >
              Summary
            </button>
            <button
              onClick={() => setActiveSection("transcript")}
              className={clsx(
                "flex-1 py-2.5 text-xs font-medium transition-colors",
                activeSection === "transcript"
                  ? "text-zinc-900 dark:text-white bg-white dark:bg-zinc-800"
                  : "text-zinc-500 dark:text-zinc-400",
              )}
            >
              Transcript
            </button>
          </div>

          <div className="p-4 max-h-[400px] overflow-y-auto">
            {activeSection === "summary" ? (
              <SummarySection conversation={conversation} />
            ) : (
              <TranscriptSection chunks={conversation.chunks} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// StatusBadge
// =============================================================================

function StatusBadge({ conversation }: { conversation: Conversation }) {
  switch (conversation.status) {
    case "active":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Live
        </span>
      );
    case "paused":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
          Paused
        </span>
      );
    case "ended":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300">
          Ended
        </span>
      );
  }
}

// =============================================================================
// SummarySection
// =============================================================================

function SummarySection({
  conversation,
}: {
  conversation: Conversation;
}) {
  // AI summary available — render with basic markdown
  if (conversation.aiSummary) {
    return (
      <div
        className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed prose prose-sm dark:prose-invert max-w-none"
        dangerouslySetInnerHTML={{ __html: simpleMarkdown(conversation.aiSummary) }}
      />
    );
  }

  // Generating AI summary
  if (conversation.generatingSummary) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
        <Loader2 size={14} className="animate-spin" />
        Generating summary...
      </div>
    );
  }

  // Fallback to running summary (live/paused conversations)
  if (conversation.runningSummary) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
        {conversation.runningSummary}
      </p>
    );
  }

  return (
    <p className="text-sm text-zinc-500 dark:text-zinc-400">
      Summary will be available once the conversation ends.
    </p>
  );
}

/**
 * Minimal markdown → HTML for AI summaries (bold, bullets, paragraphs)
 */
function simpleMarkdown(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^[-•]\s+(.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul class="list-disc pl-4 my-1">${match}</ul>`)
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br>")
    .replace(/^/, "<p>")
    .replace(/$/, "</p>");
}

// =============================================================================
// TranscriptSection
// =============================================================================

function TranscriptSection({ chunks }: { chunks: ConversationChunk[] }) {
  if (chunks.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        No transcript chunks yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {chunks.map((chunk) => (
        <div key={chunk.id} className="flex gap-3">
          <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono shrink-0 pt-0.5 w-12">
            {formatTime(chunk.startTime)}
          </span>
          <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
            {chunk.text}
          </p>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function formatTime(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTimeRange(
  start: Date | string,
  end: Date | string | null,
): string {
  const startStr = formatTime(start);
  if (!end) return `${startStr} – now`;
  return `${startStr} – ${formatTime(end)}`;
}

