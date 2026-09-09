-- client-avatars bucket (0025_client_avatars.sql) was created with no
-- file_size_limit/allowed_mime_types, so validation existed only client-side
-- (avatar-validation.ts) and could be bypassed by calling the upload function
-- directly. App-layer validation was tightened in avatar-upload.ts; this adds
-- the matching server-side bucket constraints as defense-in-depth — matches
-- ALLOWED_AVATAR_TYPES/MAX_AVATAR_BYTES in avatar-validation.ts.

update storage.buckets
set file_size_limit = 5 * 1024 * 1024,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
where id = 'client-avatars';
