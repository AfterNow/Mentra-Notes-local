/**
 * NotesFilterDrawer - Filter & sort options for notes
 *
 * Renders inside BottomDrawer with:
 * - Sort by (Most recent / Oldest first)
 * - Show filters (All notes / Favourites / Archived / Trash)
 */

import { useState, useEffect, type ReactNode } from "react";
import { BottomDrawer } from "./BottomDrawer";

export type NoteSortBy = "recent" | "oldest";
export type NoteShowFilter = "all" | "favourites" | "archived" | "trash";

export interface NoteFilters {
  sortBy: NoteSortBy;
  showFilter: NoteShowFilter;
}

interface NotesFilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  sortBy: NoteSortBy;
  showFilter: NoteShowFilter;
  onApply: (filters: NoteFilters) => void;
}

const SORT_OPTIONS: { value: NoteSortBy; label: string }[] = [
  { value: "recent", label: "Most recent" },
  { value: "oldest", label: "Oldest first" },
];

const SHOW_OPTIONS: { value: NoteShowFilter; label: string; icon: ReactNode }[] = [
  {
    value: "all",
    label: "All notes",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    value: "favourites",
    label: "Favourites",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" stroke="currentColor" strokeWidth="2" fill="none" />
      </svg>
    ),
  },
  {
    value: "archived",
    label: "Archived",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M21 8v13H3V8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="1" y="3" width="22" height="5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    value: "trash",
    label: "Trash",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export function NotesFilterDrawer({
  isOpen,
  onClose,
  sortBy: initialSortBy,
  showFilter: initialShowFilter,
  onApply,
}: NotesFilterDrawerProps) {
  const [sortBy, setSortBy] = useState<NoteSortBy>(initialSortBy);
  const [showFilter, setShowFilter] = useState<NoteShowFilter>(initialShowFilter);
  const [sortOpen, setSortOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSortBy(initialSortBy);
      setShowFilter(initialShowFilter);
      setSortOpen(false);
    }
  }, [isOpen]);

  const applySortBy = (value: NoteSortBy) => {
    setSortBy(value);
    setSortOpen(false);
    onApply({ sortBy: value, showFilter });
  };

  const applyShowFilter = (value: NoteShowFilter) => {
    setShowFilter(value);
    onApply({ sortBy, showFilter: value });
    onClose();
  };

  return (
    <BottomDrawer isOpen={isOpen} onClose={onClose}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="text-[20px] leading-[26px] text-[#1C1917] font-red-hat font-bold">
          Filter & sort
        </div>
        <button onClick={onClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M18 6 6 18M6 6l12 12" stroke="#78716C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Sort by */}
      <div className="border-b border-[#F5F5F4]">
        <button
          onClick={() => setSortOpen(!sortOpen)}
          className="flex items-center justify-between w-full py-3"
        >
          <span className="text-[15px] leading-5 text-[#1C1917] font-red-hat font-semibold">
            Sort by
          </span>
          <div className="flex items-center gap-1">
            <span className="text-[14px] leading-[18px] text-[#78716C] font-red-hat">
              {SORT_OPTIONS.find((o) => o.value === sortBy)?.label}
            </span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ transform: sortOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }}>
              <path d="m6 9 6 6 6-6" stroke="#78716C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </button>
        {sortOpen && (
          <div className="pb-2">
            {SORT_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => applySortBy(option.value)}
                className="flex items-center justify-between w-full py-2.5 pl-4"
              >
                <span className={`text-[14px] leading-[18px] font-red-hat font-medium ${sortBy === option.value ? "text-[#1C1917]" : "text-[#78716C]"}`}>
                  {option.label}
                </span>
                {sortBy === option.value && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M20 6 9 17l-5-5" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Show */}
      <div className="text-[11px] tracking-widest uppercase leading-3.5 text-[#A8A29E] font-red-hat font-bold mt-5 mb-3">
        Show
      </div>
      {SHOW_OPTIONS.map((option) => {
        const isSelected = showFilter === option.value;
        return (
          <button
            key={option.value}
            onClick={() => applyShowFilter(option.value)}
            className="flex items-center w-full py-2.5 gap-2.5"
          >
            <div className={isSelected ? "text-[#1C1917]" : "text-[#78716C]"}>
              {option.icon}
            </div>
            <span className={`grow text-left text-[14px] leading-[18px] font-red-hat font-medium ${isSelected ? "text-[#1C1917]" : "text-[#78716C]"}`}>
              {option.label}
            </span>
            {isSelected && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M20 6 9 17l-5-5" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        );
      })}
    </BottomDrawer>
  );
}
