"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Status = "idle" | "working" | "error";

export function DeleteSubmissionForm({
  submissionId,
  bakeDate,
}: {
  submissionId: string;
  bakeDate: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (
      !window.confirm(
        `Delete the ${bakeDate} submission? This permanently removes its baked/waste ` +
          `data, photo, and any comparison history. This can't be undone.`,
      )
    ) {
      return;
    }
    setError(null);

    try {
      setStatus("working");
      const res = await fetch(`/api/submissions/${submissionId}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error((await res.json()).error ?? "could not delete submission");
      }
      router.refresh();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleDelete}
        disabled={status === "working"}
        className="text-xs font-medium text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === "working" ? "Deleting…" : "Delete"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
