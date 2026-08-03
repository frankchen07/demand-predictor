"use client";

import { useState } from "react";

export function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-block align-middle">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        aria-label="More info"
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-zinc-300 text-[10px] font-semibold leading-none text-zinc-700 hover:bg-zinc-400"
      >
        i
      </button>
      {open && (
        <span className="absolute left-1/2 top-6 z-10 w-48 -translate-x-1/2 rounded-md bg-zinc-900 px-2.5 py-2 text-left text-xs font-normal normal-case leading-snug text-white shadow-lg">
          {text}
        </span>
      )}
    </span>
  );
}
