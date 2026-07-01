// One-off script: copies every file in the "media" storage bucket from the OLD
// Supabase project to the NEW one. Run locally with both projects' service_role keys.
//
// Usage:
//   OLD_SUPABASE_URL=https://old-project.supabase.co \
//   OLD_SUPABASE_SERVICE_ROLE_KEY=old-key \
//   NEW_SUPABASE_URL=https://new-project.supabase.co \
//   NEW_SUPABASE_SERVICE_ROLE_KEY=new-key \
//   node migrate-storage.mjs
//
// Safe to re-run — uses upsert, so already-copied files just get overwritten with
// the same content rather than erroring or duplicating.

import { createClient } from '@supabase/supabase-js';

const BUCKET = 'media';

const oldUrl = process.env.OLD_SUPABASE_URL;
const oldKey = process.env.OLD_SUPABASE_SERVICE_ROLE_KEY;
const newUrl = process.env.NEW_SUPABASE_URL;
const newKey = process.env.NEW_SUPABASE_SERVICE_ROLE_KEY;

if (!oldUrl || !oldKey || !newUrl || !newKey) {
  console.error('Missing one of OLD_SUPABASE_URL, OLD_SUPABASE_SERVICE_ROLE_KEY, NEW_SUPABASE_URL, NEW_SUPABASE_SERVICE_ROLE_KEY env vars.');
  process.exit(1);
}

const oldClient = createClient(oldUrl, oldKey);
const newClient = createClient(newUrl, newKey);

async function listAllFiles() {
  const files = [];
  let offset = 0;
  const limit = 100;
  for (;;) {
    const { data, error } = await oldClient.storage.from(BUCKET).list('', { limit, offset });
    if (error) throw new Error(`List failed: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const f of data) {
      // Skip folder placeholders — list() can return pseudo-entries with id === null for "directories"
      if (f.id !== null) files.push(f.name);
    }
    if (data.length < limit) break;
    offset += limit;
  }
  return files;
}

async function migrate() {
  console.log('Listing files in old bucket...');
  const files = await listAllFiles();
  console.log(`Found ${files.length} files.`);

  let ok = 0;
  let failed = 0;

  for (const [i, name] of files.entries()) {
    process.stdout.write(`[${i + 1}/${files.length}] ${name} ... `);
    try {
      const { data: blob, error: dlError } = await oldClient.storage.from(BUCKET).download(name);
      if (dlError) throw new Error(`download: ${dlError.message}`);

      const arrayBuffer = await blob.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const { error: upError } = await newClient.storage
        .from(BUCKET)
        .upload(name, buffer, { contentType: blob.type || 'application/octet-stream', upsert: true });
      if (upError) throw new Error(`upload: ${upError.message}`);

      console.log('ok');
      ok++;
    } catch (e) {
      console.log('FAILED -', e.message);
      failed++;
    }
  }

  console.log(`\nDone. ${ok} succeeded, ${failed} failed out of ${files.length}.`);
  if (failed > 0) process.exitCode = 1;
}

migrate().catch((e) => {
  console.error('Migration crashed:', e);
  process.exit(1);
});
