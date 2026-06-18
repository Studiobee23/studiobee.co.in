-- Run this in Supabase SQL editor to create the atomic document number incrementer.
-- This prevents duplicate numbers when two requests arrive simultaneously.

create or replace function increment_doc_series(series_type text)
returns int
language plpgsql
as $$
declare
  new_number int;
begin
  update document_series
    set last_number = last_number + 1
    where type = series_type
    returning last_number into new_number;
  if new_number is null then
    raise exception 'Unknown series type: %', series_type;
  end if;
  return new_number;
end;
$$;
