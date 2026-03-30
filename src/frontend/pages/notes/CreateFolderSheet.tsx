/**
 * CreateFolderSheet - Bottom sheet for creating a new folder
 *
 * Uses BottomDrawer for smooth vaul animation.
 * Text input for name + 3 color swatches (red, gray, blue) + Create button.
 */

import { useState, useEffect } from "react";
import type { FolderColor } from "../../../shared/types";
import { BottomDrawer } from "../../components/shared/BottomDrawer";

const COLORS: { value: FolderColor; hex: string }[] = [
  { value: "red", hex: "#DC2626" },
  { value: "gray", hex: "#78716C" },
  { value: "blue", hex: "#2563EB" },
];

interface CreateFolderSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, color: FolderColor) => void;
  existingNames?: string[];
}

export function CreateFolderSheet({ isOpen, onClose, onCreate, existingNames = [] }: CreateFolderSheetProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<FolderColor>("gray");

  // Reset state when drawer opens
  useEffect(() => {
    if (isOpen) {
      setName("");
      setColor("gray");
    }
  }, [isOpen]);

  const trimmed = name.trim();
  const isDuplicate = trimmed.length > 0 && existingNames.some(
    (n) => n.toLowerCase() === trimmed.toLowerCase()
  );

  const handleCreate = () => {
    if (!trimmed || isDuplicate) return;
    onCreate(trimmed, color);
    onClose();
  };

  return (
    <BottomDrawer isOpen={isOpen} onClose={onClose}>
      <div className="flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="text-[18px] leading-6 text-[#1C1917] font-red-hat font-bold">
            New Folder
          </div>
          <button onClick={onClose} className="text-[14px] leading-[18px] text-[#A8A29E] font-red-hat font-medium">
            Cancel
          </button>
        </div>

        {/* Name input */}
        <div className="flex flex-col gap-1.5">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Folder name"
            autoFocus
            className={`w-full rounded-xl py-3 px-4 bg-[#F5F5F4] text-[15px] leading-5 text-[#1C1917] font-red-hat font-medium placeholder:text-[#A8A29E] outline-none focus:ring-2 ${
              isDuplicate ? "focus:ring-[#DC2626]/40 ring-2 ring-[#DC2626]/40" : "focus:ring-[#DC2626]/20"
            }`}
          />
          {isDuplicate && (
            <span className="text-[12px] leading-4 text-[#DC2626] font-red-hat font-medium px-1">
              A folder named "{trimmed}" already exists
            </span>
          )}
        </div>

        {/* Color picker */}
        <div className="flex flex-col gap-2">
          <div className="text-[13px] leading-4 text-[#78716C] font-red-hat font-medium">
            Color
          </div>
          <div className="flex items-center gap-3">
            {COLORS.map((c) => (
              <button
                key={c.value}
                onClick={() => setColor(c.value)}
                className="flex items-center justify-center w-10 h-10 rounded-xl"
                style={{
                  backgroundColor: c.hex,
                  boxShadow: color === c.value ? `0 0 0 3px ${c.hex}33, 0 0 0 1.5px ${c.hex}` : "none",
                }}
              >
                {color === c.value && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Create button */}
        <button
          onClick={handleCreate}
          disabled={!trimmed || isDuplicate}
          className={`w-full py-3.5 rounded-xl text-[15px] leading-5 font-red-hat font-bold transition-opacity ${
            trimmed && !isDuplicate
              ? "bg-[#DC2626] text-white"
              : "bg-[#F5F5F4] text-[#A8A29E]"
          }`}
        >
          Create Folder
        </button>
      </div>
    </BottomDrawer>
  );
}
