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

      <form
        action="/api/submissions/upload"
        method="POST"
        encType="multipart/form-data"
        className="mt-6 flex flex-col gap-4"
      >
        <input type="hidden" name="businessSlug" value={BUSINESS_SLUG} />

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700">Count date</span>
          <input
            type="date"
            name="countDate"
            defaultValue={todayISO()}
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

        <button
          type="submit"
          className="mt-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          Upload &amp; read sheet
        </button>
      </form>
    </main>
  );
}
