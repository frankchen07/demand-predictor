"use client";

import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useState } from "react";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

type Status = "idle" | "uploading" | "processing" | "error";

export function UploadForm({
  businessSlug,
  defaultDate,
}: {
  businessSlug: string;
  defaultDate: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = e.currentTarget;
    const bakeDate = (form.elements.namedItem("bakeDate") as HTMLInputElement).value;
    const file = (form.elements.namedItem("photo") as HTMLInputElement).files?.[0];
    if (!file) return;

    try {
      setStatus("uploading");
      const urlRes = await fetch("/api/submissions/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessSlug, bakeDate, contentType: file.type }),
      });
      if (!urlRes.ok) {
        throw new Error((await urlRes.json()).error ?? "could not prepare upload");
      }
      const { token, path, publicUrl } = await urlRes.json();

      const { error: uploadError } = await supabase.storage
        .from("submission-photos")
        .uploadToSignedUrl(path, token, file, { contentType: file.type });
      if (uploadError) throw uploadError;

      setStatus("processing");
      const submitRes = await fetch("/api/submissions/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessSlug, bakeDate, publicUrl, contentType: file.type }),
      });
      if (!submitRes.ok) {
        throw new Error((await submitRes.json()).error ?? "could not process sheet");
      }
      const { submissionId } = await submitRes.json();
      router.push(`/submissions/${submissionId}/confirm`);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-zinc-700">Date of bake</span>
        <input
          type="date"
          name="bakeDate"
          defaultValue={defaultDate}
          required
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-zinc-700">Photo</span>
        <input
          type="file"
          name="photo"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          required
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white"
        />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={status === "uploading" || status === "processing"}
        className="mt-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        {status === "uploading"
          ? "Uploading photo…"
          : status === "processing"
            ? "Reading sheet…"
            : "Upload & read sheet"}
      </button>
    </form>
  );
}
