import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { deletePhoto } from "@/lib/supabase-storage";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [submission] = await db.select().from(schema.submissions).where(eq(schema.submissions.id, id));
  if (!submission) {
    return NextResponse.json({ error: "submission not found" }, { status: 404 });
  }

  if (submission.photoUrl) {
    try {
      await deletePhoto(submission.photoUrl);
    } catch {
      return NextResponse.json({ error: "could not delete photo from storage" }, { status: 500 });
    }
  }

  // submissionLineItems and comparisonLineItems cascade-delete via FK constraints
  await db.delete(schema.submissions).where(eq(schema.submissions.id, id));

  return NextResponse.json({ ok: true });
}
