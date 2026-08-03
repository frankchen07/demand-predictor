"use client";

import { useState } from "react";

export function GenerateRecommendationForm({
  businessSlug,
  hasExisting,
}: {
  businessSlug: string;
  hasExisting: boolean;
}) {
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      action="/api/recommendations/compute"
      method="POST"
      onSubmit={() => setSubmitting(true)}
    >
      <input type="hidden" name="businessSlug" value={businessSlug} />
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      >
        {submitting
          ? "Generating…"
          : hasExisting
            ? "Regenerate recommendation"
            : "Generate recommendation"}
      </button>
    </form>
  );
}
