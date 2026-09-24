export default async function OwnerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="text-xl font-semibold text-zinc-900">Owner access</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Enter the owner passphrase to view pricing &amp; cost data.
      </p>

      <form action="/api/owner-login" method="POST" className="mt-6 flex flex-col gap-3">
        <input type="hidden" name="next" value={next ?? "/products"} />
        <input
          type="password"
          name="passphrase"
          autoFocus
          required
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          placeholder="Owner passphrase"
        />
        {error && <p className="text-sm text-red-600">That passphrase didn&apos;t match.</p>}
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          Continue
        </button>
      </form>
    </main>
  );
}
