import Link from "next/link";
import { UploadForm } from "./upload-form";

const BUSINESS_SLUG = "midwife-and-baker";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function UploadSubmissionPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <div className="mb-6">
        <Link href="/" className="text-sm font-medium text-zinc-700 hover:underline">
          ← Back to home
        </Link>
      </div>

      <h1 className="text-xl font-semibold text-zinc-900">Upload today&apos;s bakery data</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Take a photo of the completed count sheet. The app will read it using optical character recognition and show you the numbers. Please review them for accuracy and save them.
      </p>
      <UploadForm businessSlug={BUSINESS_SLUG} defaultDate={todayISO()} />

      <div className="mt-8">
        <Link href="/" className="text-sm font-medium text-zinc-700 hover:underline">
          ← Back to home
        </Link>
      </div>
    </main>
  );
}
