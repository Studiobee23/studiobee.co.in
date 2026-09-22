-- The "documents" Storage bucket (created by hand pre-dating any migration —
-- see 0045_nda_agreements.sql's comment) was restricted to allowed_mime_types
-- = ['application/pdf'] only, since it had only ever stored quote/invoice
-- PDFs until now. The NDA signing flow also stores drawn-signature PNGs
-- there (nda-signatures/{token}.png) — add image/png so those uploads don't
-- fail with a 415. Discovered live: uploading a real signature PNG through
-- the actual signing flow returned "mime type image/png is not supported".
update storage.buckets
set allowed_mime_types = array['application/pdf', 'image/png']
where id = 'documents';
