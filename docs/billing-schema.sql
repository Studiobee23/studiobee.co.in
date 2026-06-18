-- StudioBee Billing System — Supabase Schema
-- Run this in the Supabase SQL Editor

-- Clients
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_person text default '',
  email text default '',
  phone text default '',
  gstin text default '',
  address text default '',
  city text default '',
  state text default '',
  created_at timestamptz default now()
);

-- Auto-numbering series
create table if not exists document_series (
  type text primary key,
  last_number int not null default 0
);
insert into document_series (type, last_number) values
  ('quote', 0), ('invoice', 0), ('receipt', 0)
on conflict (type) do nothing;

-- Documents (quotes, invoices, receipts)
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('quote', 'invoice', 'receipt')),
  number text not null,
  client_id uuid references clients(id) on delete set null,
  status text not null default 'draft',
  project_name text default '',
  category text default '',
  line_items jsonb default '[]',
  subtotal numeric(12,2) default 0,
  gst_enabled boolean default true,
  gst_type text default 'cgst_sgst',
  gst_rate numeric(5,2) default 18,
  gst_amount numeric(12,2) default 0,
  discount numeric(12,2) default 0,
  total numeric(12,2) default 0,
  notes text default '',
  validity_days int default 15,
  converted_from uuid references documents(id) on delete set null,
  created_at timestamptz default now()
);

-- Enable Row Level Security (optional but recommended)
alter table clients enable row level security;
alter table documents enable row level security;
alter table document_series enable row level security;

-- Allow full access via service role key (used by serve.mjs)
create policy "service role full access" on clients for all using (true);
create policy "service role full access" on documents for all using (true);
create policy "service role full access" on document_series for all using (true);
