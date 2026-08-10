"use client";

import { useLayoutEffect, useRef, useState } from "react";

const BUBBLE_WIDTH = 192; // px, matches w-48
const VIEWPORT_MARGIN = 8;

export function InfoTooltip({ text }: { text: string }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  function toggle() {
    if (position) {
      setPosition(null);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const desiredLeft = rect.left + rect.width / 2 - BUBBLE_WIDTH / 2;
    // clientWidth excludes the scrollbar; innerWidth doesn't, which let the
    // bubble's right edge render past the actually visible content area.
    const maxLeft = document.documentElement.clientWidth - BUBBLE_WIDTH - VIEWPORT_MARGIN;
    const left = Math.min(Math.max(desiredLeft, VIEWPORT_MARGIN), maxLeft);
    setPosition({ top: rect.bottom + 6, left });
  }

  // Second pass once the bubble's real height is known: flip above the
  // trigger if it would otherwise run off the bottom of the viewport.
  useLayoutEffect(() => {
    if (!position || !buttonRef.current || !bubbleRef.current) return;
    const bubbleHeight = bubbleRef.current.getBoundingClientRect().height;
    const viewportHeight = document.documentElement.clientHeight;
    if (position.top + bubbleHeight <= viewportHeight - VIEWPORT_MARGIN) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const flippedTop = Math.max(rect.top - 6 - bubbleHeight, VIEWPORT_MARGIN);
    if (flippedTop !== position.top) {
      setPosition({ ...position, top: flippedTop });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position?.left, position?.top]);

  return (
    <span className="relative inline-block align-middle">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        onBlur={() => setPosition(null)}
        aria-label="More info"
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-zinc-300 text-[10px] font-semibold leading-none text-zinc-700 hover:bg-zinc-400"
      >
        i
      </button>
      {position && (
        // position: fixed (not absolute) so this escapes the table's overflow-x-auto
        // clipping — absolute descendants get clipped by a scrolling ancestor, fixed ones don't.
        <span
          ref={bubbleRef}
          style={{ position: "fixed", top: position.top, left: position.left, width: BUBBLE_WIDTH }}
          className="z-20 rounded-md bg-zinc-900 px-2.5 py-2 text-left text-xs font-normal normal-case leading-snug text-white shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  );
}
