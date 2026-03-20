/**
 * DropdownMenu - Reusable dropdown menu component
 *
 * Smooth scale/opacity animation, closes on outside click or Escape.
 * Supports icons, labels, descriptions, dividers, and danger states.
 */

import { useState, useRef, useEffect, type ReactNode } from "react";

export interface DropdownMenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  description?: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export interface DropdownMenuDivider {
  type: "divider";
}

export type DropdownMenuOption = DropdownMenuItem | DropdownMenuDivider;

interface DropdownMenuProps {
  options: DropdownMenuOption[];
  /** Custom trigger element. If not provided, uses a 3-dot icon */
  trigger?: ReactNode;
  /** Alignment of the dropdown relative to trigger */
  align?: "left" | "right";
}

function isDivider(option: DropdownMenuOption): option is DropdownMenuDivider {
  return "type" in option && option.type === "divider";
}

export function DropdownMenu({
  options,
  trigger,
  align = "right",
}: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const handleOptionClick = (option: DropdownMenuItem) => {
    if (option.disabled) return;
    option.onClick();
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative inline-block">
      {/* Trigger */}
      <div onClick={() => setIsOpen(!isOpen)} className="cursor-pointer">
        {trigger ?? (
          <button className="p-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="6" r="1.5" fill="#52525B" />
              <circle cx="12" cy="12" r="1.5" fill="#52525B" />
              <circle cx="12" cy="18" r="1.5" fill="#52525B" />
            </svg>
          </button>
        )}
      </div>

      {/* Menu */}
      {isOpen && (
        <div
          className={`absolute top-full mt-1.5 z-50 min-w-44 bg-[#FAFAF9] border border-[#E7E5E4] rounded-xl py-1 ${
            align === "right" ? "right-0" : "left-0"
          }`}
          style={{
            boxShadow: "0px 4px 16px rgba(0,0,0,0.08)",
            animation: "dropdown-in 0.15s ease-out",
          }}
        >
          <style>{`
            @keyframes dropdown-in {
              from { opacity: 0; transform: scale(0.95) translateY(-4px); }
              to { opacity: 1; transform: scale(1) translateY(0); }
            }
          `}</style>
          {options.map((option, index) => {
            if (isDivider(option)) {
              return <div key={`divider-${index}`} className="my-1 mx-3 border-t border-[#F5F5F4]" />;
            }

            return (
              <button
                key={option.id}
                onClick={() => handleOptionClick(option)}
                disabled={option.disabled}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-[14px] leading-[18px] font-red-hat font-medium transition-colors ${
                  option.disabled
                    ? "text-[#D6D3D1] cursor-not-allowed"
                    : option.danger
                      ? "text-[#DC2626] active:bg-[#FEE2E2]"
                      : "text-[#1C1917] active:bg-[#F5F5F4]"
                }`}
              >
                {option.icon && <span className="shrink-0">{option.icon}</span>}
                <div className="flex-1 min-w-0">
                  <span className="block">{option.label}</span>
                  {option.description && (
                    <span className="block text-[12px] leading-4 text-[#A8A29E] font-normal truncate">
                      {option.description}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
