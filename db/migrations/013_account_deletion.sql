-- Reviewed deletion workflow; preserves relational/business records instead of cascading DELETE users.
alter table users add column if not exists deleted_at timestamptz;
create table account_deletion_requests (
 id uuid primary key default gen_random_uuid(), reference text not null unique,
 user_id uuid references users(id) on delete set null,
 access_hash text not null,
 status text not null default 'pending' check(status in ('pending','in_review','needs_action','processing','completed','withdrawn','declined')),
 reason text, public_message text, internal_note text,
 retention_summary text, retention_review_date date,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 processing_claim uuid, processing_claim_until timestamptz,
 completed_at timestamptz, reviewed_by uuid references users(id) on delete set null
);
create unique index deletion_one_open on account_deletion_requests(user_id)
 where status in ('pending','in_review','needs_action','processing');
alter table account_deletion_requests enable row level security;
revoke all on account_deletion_requests from public;
do $$ declare r text; begin foreach r in array array['anon','authenticated'] loop
 if exists(select 1 from pg_roles where rolname=r) then execute format('revoke all on account_deletion_requests from %I',r);end if;
end loop;end $$;
-- Serialize authenticated checkout/booking creation with account closure.
create function protect_deleted_buyer() returns trigger language plpgsql as $$
declare active boolean;
begin
 if new.buyer_id is not null then
  select is_active into active from users where id=new.buyer_id for share;
  if not coalesce(active,false) then raise exception 'Buyer account unavailable' using errcode='23514';end if;
 end if;
 return new;
end $$;
create trigger orders_active_buyer before insert on orders for each row execute function protect_deleted_buyer();
create trigger bookings_active_buyer before insert on service_bookings for each row execute function protect_deleted_buyer();
-- Do not let an in-flight profile edit or an admin enable button resurrect closed profiles.
create function protect_closing_profile() returns trigger language plpgsql as $$
begin
 if old.deleted_at is not null or exists(select 1 from account_deletion_requests where user_id=old.id and status='processing') then
  if new.is_active or (new.deleted_at is null and (new.full_name is distinct from old.full_name or new.phone is distinct from old.phone or new.email is distinct from old.email))
   or (new.deleted_at is not null and (new.full_name<>'Deleted account' or new.email is not null or new.phone<>'deleted-'||new.id::text)) then
   raise exception 'Account closure is irreversible; do not restore this profile' using errcode='23514';
  end if;
 end if;
 return new;
end $$;
create trigger users_closure_guard before update on users for each row execute function protect_closing_profile();
create function protect_closing_store() returns trigger language plpgsql as $$
declare owner_id uuid;
begin
 if tg_table_name='vendors' then owner_id:=new.user_id;
 else select user_id into owner_id from vendors where id=new.vendor_id;end if;
 if exists(select 1 from users where id=owner_id and deleted_at is not null) or exists(select 1 from account_deletion_requests where user_id=owner_id and status='processing') then
  if tg_table_name='vendors' then
   if new.status<>'suspended' or new.business_name<>'Closed store' or new.whatsapp<>'' or new.id_document_url is not null or new.logo_url is not null or new.description is not null or new.address is not null or new.bank_iban is not null then
    raise exception 'Store is being deleted or has been closed' using errcode='23514';end if;
  else
   if new.status<>'removed' or new.description is not null or new.supplier_note is not null or new.images<>'[]'::jsonb then
    raise exception 'Listings of closed accounts cannot be republished' using errcode='23514';end if;
  end if;
 end if;
 return new;
end $$;
create trigger vendors_closure_guard before insert or update on vendors for each row execute function protect_closing_store();
create trigger listings_closure_guard before insert or update on listings for each row execute function protect_closing_store();
