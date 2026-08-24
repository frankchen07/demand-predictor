"use client";

import { useRouter } from "next/navigation";

export function ViewSelect({ defaultValue }: { defaultValue: string }) {
  const router = useRouter();

  return (
    <select
      defaultValue={defaultValue}
      onChange={(e) => router.push(`/dashboard/trends?view=${e.target.value}`)}
      className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
    >
      <option value="overall">Overall trend (all time)</option>
      <option value="by-product">By product (all time)</option>
    </select>
  );
}
