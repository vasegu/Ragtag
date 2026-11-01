-- Street brain pipeline webhook: when a photo lands in the live upload bucket, POST a
-- storage INSERT event to /api/street-brain/pipeline/webhook (see src/features/street-brain/jobs.ts).
-- The bearer token is read from Vault ('pipeline_webhook_secret'); it is never stored here.
-- To rotate: update the Vault secret and the PIPELINE_WEBHOOK_SECRET env var on Vercel together.

create extension if not exists pg_net with schema extensions;

create or replace function public.street_brain_upload_webhook()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  token text;
begin
  if new.bucket_id <> 'street-brain-uploads' then
    return new;
  end if;
  select decrypted_secret into token from vault.decrypted_secrets where name = 'pipeline_webhook_secret';
  if token is null then
    raise warning 'street_brain_upload_webhook: pipeline_webhook_secret missing from vault';
    return new;
  end if;
  perform net.http_post(
    url := 'https://ragtag-kappa.vercel.app/api/street-brain/pipeline/webhook',
    body := jsonb_build_object(
      'type', 'INSERT',
      'schema', 'storage',
      'table', 'objects',
      'record', jsonb_build_object('bucket_id', new.bucket_id, 'name', new.name, 'user_metadata', new.user_metadata)
    ),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || token),
    timeout_milliseconds := 10000
  );
  return new;
end;
$$;

revoke all on function public.street_brain_upload_webhook() from public, anon, authenticated;

drop trigger if exists street_brain_upload_webhook on storage.objects;
create trigger street_brain_upload_webhook
  after insert on storage.objects
  for each row
  when (new.bucket_id = 'street-brain-uploads')
  execute function public.street_brain_upload_webhook();
