/**
 * SearchPage - Semantic search across notes and conversations
 *
 * Features:
 * - Search bar with debounced input
 * - AI quick answer (Phase 3)
 * - Results list with type badges and click-through navigation
 */

import { useState, useCallback, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "motion/react";
import { Search, FileText, MessagesSquare, ChevronLeft, Sparkles, Loader2 } from "lucide-react";

interface SearchResult {
  id: string;
  type: "note" | "conversation";
  title: string;
  summary: string;
  date: string;
  score: number;
  content?: string;
}

function ResultCard({
  result,
  index,
  onClick,
  truncate,
  formatDate,
}: {
  result: SearchResult;
  index: number;
  onClick: (r: SearchResult) => void;
  truncate: (text: string, max: number) => string;
  formatDate: (date: string) => string;
}) {
  return (
    <motion.button
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15, delay: index * 0.03 }}
      onClick={() => onClick(result)}
      className="w-full text-left p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
    >
      <div className="min-w-0">
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate block">
          {result.title || "Untitled"}
        </span>
        <p className="text-xs text-zinc-500 dark:text-zinc-500 line-clamp-2 leading-relaxed mt-1">
          {truncate(result.summary || result.content || "", 150)}
        </p>
        <span className="text-[11px] text-zinc-400 mt-1 block">
          {formatDate(result.date)}
        </span>
      </div>
    </motion.button>
  );
}

export function SearchPage() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isAnswering, setIsAnswering] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setAiAnswer(null);
      setHasSearched(false);
      return;
    }

    setIsSearching(true);
    setHasSearched(true);
    setAiAnswer(null);

    try {
      // Get results first (fast)
      const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}&limit=10`, { credentials: "include" });
      const data = await res.json();
      setResults(data.results || []);
      setIsSearching(false);

      // Fire AI answer in background (don't block results)
      if (data.results?.length > 0) {
        setIsAnswering(true);
        fetch(`/api/search?q=${encodeURIComponent(q.trim())}&limit=10&ai=true`, { credentials: "include" })
          .then((r) => r.json())
          .then((d) => setAiAnswer(d.answer || null))
          .catch(() => setAiAnswer(null))
          .finally(() => setIsAnswering(false));
      }
    } catch {
      setResults([]);
      setAiAnswer(null);
      setIsSearching(false);
      setIsAnswering(false);
    }
  }, []);

  const handleInputChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => doSearch(value), 400);
    },
    [doSearch],
  );

  const handleResultClick = (result: SearchResult) => {
    if (result.type === "note") {
      setLocation(`/note/${result.id}`);
    } else {
      setLocation(`/day/${result.date}?tab=conversations&conversationId=${result.id}`);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr + "T00:00:00");
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return dateStr;
    }
  };

  const noteResults = useMemo(() => results.filter((r) => r.type === "note"), [results]);
  const conversationResults = useMemo(() => results.filter((r) => r.type === "conversation"), [results]);

  const truncate = (text: string, max: number) => {
    if (!text) return "";
    // Strip HTML for display
    const plain = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    return plain.length > max ? plain.slice(0, max) + "..." : plain;
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-black">
      {/* Header */}
      <div className="shrink-0 px-4 pt-4 pb-3">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => setLocation("/")}
            className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Search</h1>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="Search notes & conversations..."
            autoFocus
            className="w-full pl-10 pr-4 py-2.5 bg-zinc-100 dark:bg-zinc-900 rounded-xl border-0 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-700 transition-shadow"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {/* Loading */}
        {isSearching && (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-zinc-400" />
          </div>
        )}

        {/* AI Answer */}
        <AnimatePresence>
          {(aiAnswer || isAnswering) && !isSearching && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="mb-4"
            >
              <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800">
                <div className="flex items-center gap-1.5 mb-2">
                  <Sparkles size={14} className="text-zinc-400" />
                  <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">AI Answer</span>
                </div>
                {isAnswering ? (
                  <div className="space-y-2">
                    <div className="h-3 w-3/4 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
                    <div className="h-3 w-1/2 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
                  </div>
                ) : (
                  <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{aiAnswer}</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results */}
        {!isSearching && results.length > 0 && (
          <div className="space-y-5">
            {noteResults.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2.5 px-1">
                  <FileText size={14} className="text-zinc-400" />
                  <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Notes</span>
                  <span className="text-xs text-zinc-300 dark:text-zinc-600">({noteResults.length})</span>
                </div>
                <div className="space-y-2">
                  {noteResults.map((result, i) => (
                    <ResultCard key={result.id} result={result} index={i} onClick={handleResultClick} truncate={truncate} formatDate={formatDate} />
                  ))}
                </div>
              </div>
            )}

            {noteResults.length > 0 && conversationResults.length > 0 && (
              <div className="border-t border-zinc-100 dark:border-zinc-800" />
            )}

            {conversationResults.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2.5 px-1">
                  <MessagesSquare size={14} className="text-zinc-400" />
                  <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Conversations</span>
                  <span className="text-xs text-zinc-300 dark:text-zinc-600">({conversationResults.length})</span>
                </div>
                <div className="space-y-2">
                  {conversationResults.map((result, i) => (
                    <ResultCard key={result.id} result={result} index={i} onClick={handleResultClick} truncate={truncate} formatDate={formatDate} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Empty State */}
        {!isSearching && hasSearched && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Search size={32} className="text-zinc-300 dark:text-zinc-700 mb-3" />
            <p className="text-sm text-zinc-500 dark:text-zinc-500">No results found</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-1">Try a different search term</p>
          </div>
        )}

        {/* Initial State */}
        {!isSearching && !hasSearched && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Search size={32} className="text-zinc-300 dark:text-zinc-700 mb-3" />
            <p className="text-sm text-zinc-500 dark:text-zinc-500">Search across all your notes and conversations</p>
          </div>
        )}
      </div>
    </div>
  );
}
