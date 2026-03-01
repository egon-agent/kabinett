import type React from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

type Suggestion = {
  count?: number;
  value: string;
  type: string;
};

type AutocompleteInputProps = {
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onFocus: () => void;
  onBlur: () => void;
  autoComplete: "off";
  role: "combobox";
  "aria-autocomplete": "list";
  "aria-expanded": boolean;
  "aria-controls": string | undefined;
};

type AutocompleteProps = {
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (value: string) => void;
  children: (props: { inputProps: AutocompleteInputProps }) => React.ReactNode;
  dropdownClassName?: string;
  minLength?: number;
};

const TYPE_LABELS: Record<string, string> = {
  artist: "Konstnär",
  clip: "Prova",
};

export default function Autocomplete({
  query,
  onQueryChange,
  onSelect,
  children,
  dropdownClassName,
  minLength = 2,
}: AutocompleteProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Track whether the user is actively typing (vs programmatic query changes)
  const userTypingRef = useRef(false);
  const listboxId = useId();

  const killPending = useCallback(() => {
    if (fetchTimer.current) { clearTimeout(fetchTimer.current); fetchTimer.current = null; }
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
  }, []);

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setActiveIndex(-1);
  }, []);

  const dismiss = useCallback(() => {
    killPending();
    setSuggestions([]);
    closeDropdown();
  }, [killPending, closeDropdown]);

  const selectSuggestion = useCallback((value: string) => {
    userTypingRef.current = false;
    dismiss();
    onQueryChange(value);
    onSelect(value);
  }, [dismiss, onQueryChange, onSelect]);

  // Fetch suggestions only when user is typing
  useEffect(() => {
    killPending();

    const trimmed = query.trim();
    if (!userTypingRef.current || trimmed.length < minLength) {
      if (trimmed.length < minLength) {
        setSuggestions([]);
        closeDropdown();
      }
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    fetchTimer.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/autocomplete?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Autocomplete request failed");
        const data = await response.json() as Suggestion[];
        if (controller.signal.aborted || !userTypingRef.current) return;
        setSuggestions(data);
        if (data.length > 0) {
          setIsOpen(true);
          setActiveIndex(-1);
        } else {
          closeDropdown();
        }
      } catch (error: unknown) {
        if ((error as { name?: string }).name === "AbortError") return;
        setSuggestions([]);
        closeDropdown();
      }
    }, 200);

    return () => {
      controller.abort();
      if (fetchTimer.current) { clearTimeout(fetchTimer.current); fetchTimer.current = null; }
    };
  }, [closeDropdown, killPending, minLength, query]);

  useEffect(() => {
    return () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
      if (fetchTimer.current) clearTimeout(fetchTimer.current);
    };
  }, []);

  const inputProps: AutocompleteInputProps = {
    value: query,
    onChange: (event) => {
      userTypingRef.current = true;
      onQueryChange(event.target.value);
    },
    onKeyDown: (event) => {
      if (event.key === "ArrowDown" && suggestions.length > 0) {
        event.preventDefault();
        setIsOpen(true);
        setActiveIndex((prev) => prev < 0 ? 0 : (prev + 1) % suggestions.length);
        return;
      }
      if (event.key === "ArrowUp" && suggestions.length > 0) {
        event.preventDefault();
        setIsOpen(true);
        setActiveIndex((prev) => prev < 0 ? suggestions.length - 1 : (prev - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === "Enter") {
        if (isOpen && activeIndex >= 0) {
          event.preventDefault();
          selectSuggestion(suggestions[activeIndex].value);
        } else {
          userTypingRef.current = false;
          dismiss();
        }
        return;
      }
      if (event.key === "Escape") {
        dismiss();
      }
    },
    onFocus: () => {
      if (suggestions.length > 0 && userTypingRef.current) {
        setIsOpen(true);
      }
    },
    onBlur: () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
      blurTimer.current = setTimeout(() => {
        closeDropdown();
      }, 120);
    },
    autoComplete: "off",
    role: "combobox",
    "aria-autocomplete": "list",
    "aria-expanded": isOpen && suggestions.length > 0,
    "aria-controls": isOpen && suggestions.length > 0 ? listboxId : undefined,
  };

  return (
    <div className="relative">
      {children({ inputProps })}
      {isOpen && suggestions.length > 0 ? (
        <div
          id={listboxId}
          role="listbox"
          className={dropdownClassName || "absolute left-0 right-0 top-full mt-1 z-50 bg-[#1C1916] rounded-xl shadow-lg border border-[rgba(245,240,232,0.1)] overflow-hidden"}
        >
          {(() => {
            const artists = suggestions.filter(s => s.type === "artist");
            const clips = suggestions.filter(s => s.type === "clip");
            let globalIndex = 0;
            return (
              <>
                {artists.map((suggestion) => {
                  const idx = globalIndex++;
                  const isActive = idx === activeIndex;
                  return (
                    <button
                      key={`${suggestion.type}-${suggestion.value}`}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        selectSuggestion(suggestion.value);
                      }}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={[
                        "w-full text-left px-4 py-3 text-sm flex justify-between items-center cursor-pointer",
                        "hover:bg-[#2E2820] focus-ring",
                        isActive ? "bg-[#2E2820]" : "",
                        idx > 0 ? "border-t border-[rgba(245,240,232,0.05)]" : "",
                      ].join(" ")}
                    >
                      <span className="text-[#F5F0E8] truncate">{suggestion.value}</span>
                      <span className="text-xs text-[rgba(245,240,232,0.35)] ml-2 shrink-0">
                        {suggestion.count ? `${suggestion.count} verk` : "Konstnär"}
                      </span>
                    </button>
                  );
                })}
                {clips.length > 0 && (
                  <>
                    {artists.length > 0 && (
                      <div className="border-t border-[rgba(245,240,232,0.08)] px-4 pt-2.5 pb-1">
                        <span className="text-[0.65rem] uppercase tracking-[0.15em] text-[rgba(245,240,232,0.3)]">Prova att söka på</span>
                      </div>
                    )}
                    <div className={`flex flex-wrap gap-1.5 px-4 ${artists.length > 0 ? "pb-3 pt-1" : "py-3"}`}>
                      {clips.map((suggestion) => {
                        const idx = globalIndex++;
                        const isActive = idx === activeIndex;
                        return (
                          <button
                            key={`clip-${suggestion.value}`}
                            type="button"
                            role="option"
                            aria-selected={isActive}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              selectSuggestion(suggestion.value);
                            }}
                            onMouseEnter={() => setActiveIndex(idx)}
                            className={[
                              "px-3 py-1.5 rounded-full text-sm cursor-pointer transition-colors",
                              "hover:bg-[#2E2820] focus-ring",
                              isActive
                                ? "bg-[#2E2820] text-[#F5F0E8]"
                                : "bg-[rgba(245,240,232,0.06)] text-[rgba(245,240,232,0.55)]",
                            ].join(" ")}
                          >
                            {suggestion.value}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            );
          })()}
        </div>
      ) : null}
    </div>
  );
}
