-- supabase/migrations/20250721120000_create_products_table.sql
-- Migration: Create products table with barcode scan details
-- Date: 2025-07-21 12:00:00 UTC

create table if not exists public.products (
  id bigint primary key generated always as identity,
  user_id uuid not null references auth.users(id),
  barcode text not null,
  product_name text,
  manufacturer text,
  size text,
  weight text,
  sds_url text,
  created_at timestamptz not null default now()
);

-- enable row-level security
alter table public.products enable row level security;

-- allow authenticated users to insert their own records
create policy "authenticated_insert_own"
  on public.products for insert
  with check (auth.uid() = user_id);

-- allow authenticated users to select their own records
create policy "authenticated_select_own"
  on public.products for select
  using (auth.uid() = user_id);
