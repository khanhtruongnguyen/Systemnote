-- ==========================================================
-- SYSTEMNOTE - SUPABASE DATABASE & REALTIME SCHEMA
-- ==========================================================
-- Hướng dẫn: Mở Supabase Dashboard -> Vào mục SQL Editor -> Dán toàn bộ script này và bấm 'Run'.

-- 1. Bảng lưu trữ Bản Đồ (Maps)
create table if not exists public.maps (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  nodes jsonb not null default '[]'::jsonb,
  edges jsonb not null default '[]'::jsonb,
  context text default '',
  attachments jsonb default '{}'::jsonb,
  created_at bigint not null,
  updated_at bigint not null
);

-- 2. Kích hoạt Row Level Security (RLS) để bảo vệ dữ liệu cá nhân
alter table public.maps enable row level security;

-- Policies cho bảng maps:
-- Hỗ trợ cả đăng nhập tài khoản (auth.uid) hoặc dùng Anon Key cá nhân
drop policy if exists "Users can access their own maps" on public.maps;
create policy "Users can access their own maps" on public.maps
  for all using (
    auth.uid() = user_id or user_id is null
  )
  with check (
    auth.uid() = user_id or user_id is null
  );

-- 3. Bật Realtime cho bảng maps (Để điện thoại và máy tính tự nhảy thay đổi tức thì)
begin;
  do $$
  begin
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'maps'
    ) then
      alter publication supabase_realtime add table public.maps;
    end if;
  end $$;
commit;

-- 4. Tạo Storage Bucket 'note-images' để lưu ảnh ghi chú (đã nén WebP siêu nhẹ)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'note-images',
  'note-images',
  true,
  5242880,
  array['image/webp', 'image/jpeg', 'image/png', 'image/gif']
)
on conflict (id) do update
set public = true,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png', 'image/gif'];

drop policy if exists "Public read note-images" on storage.objects;
create policy "Public read note-images" on storage.objects
  for select using (bucket_id = 'note-images');

drop policy if exists "Users can upload note-images" on storage.objects;
create policy "Users can upload note-images" on storage.objects
  for insert with check (bucket_id = 'note-images');

drop policy if exists "Users can update note-images" on storage.objects;
create policy "Users can update note-images" on storage.objects
  for update using (bucket_id = 'note-images')
  with check (bucket_id = 'note-images');

drop policy if exists "Users can delete note-images" on storage.objects;
create policy "Users can delete note-images" on storage.objects
  for delete using (bucket_id = 'note-images');
