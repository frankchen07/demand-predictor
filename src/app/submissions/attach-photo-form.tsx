"use client";

import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useState } from "react";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

type Status = "idle" | "uploading" | "error";

export function AttachPhotoForm({
  submissionId,
  businessSlug,
  countDate,
}: {
  submissionId: string;
  businessSlug: string;
  countDate: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    try {
      setStatus("uploading");
      const urlRes = await fetch("/api/submissions/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessSlug, countDate, contentType: file.type }),
      });
      if (!urlRes.ok) {
        throw new Error((await urlRes.json()).error ?? "could not prepare upload");
      }
      const { token, path, publicUrl } = await urlRes.json();

      const { error: uploadError } = await supabase.storage
        .from("submission-photos")
        .uploadToSignedUrl(path, token, file, { contentType: file.type });
      if (uploadError) throw uploadError;

      const attachRes = await fetch(`/api/submissions/${submissionId}/photo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicUrl }),
      });
      if (!attachRes.ok) {
        throw new Error((await attachRes.json()).error ?? "could not attach photo");
      }

      setStatus("idle");
      router.refresh();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="inline-flex w-fit cursor-pointer items-center rounded border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
        {status === "uploading" ? "Uploading…" : "Attach photo"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleChange}
          disabled={status === "uploading"}
          className="hidden"
        />
      </label>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
