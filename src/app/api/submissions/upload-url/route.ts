import { NextResponse } from "next/server";
import { createSignedUploadUrl } from "@/lib/supabase-storage";

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function POST(request: Request) {
  const { businessSlug, countDate, contentType } = await request.json();

  if (typeof businessSlug !== "string" || typeof countDate !== "string") {
    return NextResponse.json(
      { error: "businessSlug and countDate are required" },
      { status: 400 },
    );
  }
  const ext = EXTENSION_BY_TYPE[contentType];
  if (!ext) {
    return NextResponse.json({ error: `unsupported image type: ${contentType}` }, { status: 400 });
  }

  const filename = `${countDate}-${Date.now()}.${ext}`;
  const { signedUrl, token, path, publicUrl } = await createSignedUploadUrl(businessSlug, filename);

  return NextResponse.json({ signedUrl, token, path, publicUrl });
}
