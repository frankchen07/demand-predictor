import { UploadForm } from "./upload-form";

const BUSINESS_SLUG = "midwife-and-baker";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function UploadSubmissionPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <h1 className="text-xl font-semibold text-zinc-900">Upload today&apos;s sheet</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Take a photo of the completed count sheet. We&apos;ll read it and show you
        the numbers to confirm before saving.
      </p>
      <UploadForm businessSlug={BUSINESS_SLUG} defaultDate={todayISO()} />
    </main>
  );
}
