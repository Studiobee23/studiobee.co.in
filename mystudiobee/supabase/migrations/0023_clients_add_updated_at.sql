-- Pre-existing bug found while building the client Bin feature: a
-- clients_set_updated_at trigger has always run BEFORE UPDATE on clients and
-- tried to set NEW.updated_at, but clients never had that column — so any
-- UPDATE on clients (including the existing "Edit client" save, and the new
-- soft_delete_client/restore_client functions) fails outright. Add the
-- column the trigger already expects.
alter table clients add column if not exists updated_at timestamptz not null default now();
