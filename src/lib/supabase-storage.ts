import { createClient } from "@supabase/supabase-js";

const BUCKET = "submission-photos";

let client: ReturnType<typeof createClient> | null = null;

function getClient() {
  if (!client) {
    client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  }
  return client;
}

export async function uploadSubmissionPhoto(
  businessSlug: string,
  filename: string,
  bytes: Buffer,
  contentType: string,
): Promise<string> {
  const path = `${businessSlug}/${filename}`;
  const { error } = await getClient()
    .storage.from(BUCKET)
    .upload(path, bytes, { contentType, upsert: false });
  if (error) throw error;

  const {
    data: { publicUrl },
  } = getClient().storage.from(BUCKET).getPublicUrl(path);
  return publicUrl;
}
