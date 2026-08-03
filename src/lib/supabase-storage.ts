import { createClient } from "@supabase/supabase-js";

const BUCKET = "submission-photos";

let client: ReturnType<typeof createClient> | null = null;

function getClient() {
  if (!client) {
    client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  }
  return client;
}

// Vercel Functions cap request bodies at 4.5MB, well under a typical phone photo.
// The browser uploads directly to Supabase Storage using this signed URL, bypassing
// our function entirely; the server never receives the raw file bytes over HTTP.
export async function createSignedUploadUrl(businessSlug: string, filename: string) {
  const path = `${businessSlug}/${filename}`;
  const { data, error } = await getClient().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) throw error;

  const {
    data: { publicUrl },
  } = getClient().storage.from(BUCKET).getPublicUrl(path);

  return { signedUrl: data.signedUrl, token: data.token, path, publicUrl };
}
