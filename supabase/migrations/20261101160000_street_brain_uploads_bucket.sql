-- Bucket for Santiago's street photo pipeline. Public read; uploads need the secret (service role) key.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('street-brain-uploads', 'street-brain-uploads', true, 20971520, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/json'])
on conflict (id) do nothing;
