-- 009_reviews.sql
--
-- Reviews for products, services and stores.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS ALREADY HERE, AND WHY IT NEEDED REPLACING RATHER THAN EXTENDING
-- ---------------------------------------------------------------------------
--
-- A `reviews` table existed: vendor_id, buyer_id, rating, comment, unique on
-- (vendor_id, buyer_id). A trigger kept vendors.rating_avg in sync, and the
-- store page rendered them. Three things were wrong with it:
--
--   1. ANY logged-in account could rate ANY store, with no transaction behind
--      it and no check that they were not rating themselves. A vendor could
--      five-star their own shop, and a competitor could one-star it, in one
--      request each. On a marketplace whose entire pitch is "verified sellers",
--      that is the most damaging thing on the site.
--
--   2. Only stores could be reviewed. Products and services — the things buyers
--      actually form opinions about — could not be.
--
--   3. There was no moderation, no reply, and no way to remove a review without
--      deleting the row, which silently rewrote the vendor's average.
--
-- Rows are preserved. Legacy reviews carry no order or booking, so they surface
-- as unverified rather than being deleted or quietly promoted.
--
-- ---------------------------------------------------------------------------
-- THE CENTRAL DECISION: A REVIEW REQUIRES A COMPLETED TRANSACTION
-- ---------------------------------------------------------------------------
--
-- Enforced in the API, keyed on data this schema already has:
--
--   product  -> a DELIVERED order belonging to the buyer containing that listing
--   service  -> a COMPLETED booking belonging to the buyer for that listing
--   store    -> either of the above with that vendor
--
-- This is the strongest single lever against fake reviews, and it is only
-- possible because bookings were built as real rows in 005 rather than as a
-- bare WhatsApp hand-off. The cost is fewer reviews early on. That is the right
-- trade for a marketplace selling trust; an unverified review is worth less
-- than no review, because it teaches buyers the ratings are decorative.

-- ---------------------------------------------------------------------------
-- status
-- ---------------------------------------------------------------------------

do $$ begin
  create type review_status as enum ('published', 'hidden');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- reviews
-- ---------------------------------------------------------------------------

-- NULL listing_id means the review is about the store as a whole. Kept on one
-- table rather than split into product_reviews / vendor_reviews: they share
-- every column, every moderation rule and every aggregate, and splitting them
-- would mean maintaining the same logic twice.
alter table reviews add column if not exists listing_id uuid references listings(id) on delete cascade;

-- Proof of transaction. Exactly one is set for a new review; both are null for
-- the legacy rows that predate this migration.
alter table reviews add column if not exists order_id   uuid references orders(id) on delete set null;
alter table reviews add column if not exists booking_id uuid references service_bookings(id) on delete set null;

alter table reviews add column if not exists title text;

-- Moderation. A hidden review stops counting toward the average but is not
-- deleted: removing a row loses the evidence for why it was removed.
alter table reviews add column if not exists status        review_status not null default 'published';
alter table reviews add column if not exists hidden_reason text;
alter table reviews add column if not exists hidden_by     uuid references users(id);
alter table reviews add column if not exists hidden_at     timestamptz;

-- One reply per review. The vendor's right of response is standard and it is
-- what stops a single bad review being the last word.
alter table reviews add column if not exists vendor_reply      text;
alter table reviews add column if not exists vendor_replied_at timestamptz;

alter table reviews add column if not exists helpful_count int not null default 0;
alter table reviews add column if not exists edited_at     timestamptz;
alter table reviews add column if not exists updated_at    timestamptz not null default now();

drop trigger if exists reviews_touch on reviews;
create trigger reviews_touch before update on reviews
  for each row execute function touch_updated_at();

-- The old constraint allowed one review per buyer per vendor, full stop, which
-- would stop a buyer reviewing both a product and the store it came from.
-- Replaced with two partial uniques: one store review and one review per
-- product, per buyer.
alter table reviews drop constraint if exists reviews_vendor_id_buyer_id_key;

create unique index if not exists reviews_one_per_store
  on reviews (vendor_id, buyer_id) where listing_id is null;
create unique index if not exists reviews_one_per_listing
  on reviews (listing_id, buyer_id) where listing_id is not null;

-- Detail pages read "published reviews for this target, newest or most helpful
-- first", so the indexes lead with the target and are partial on published.
create index if not exists reviews_listing_idx
  on reviews (listing_id, created_at desc) where status = 'published';
create index if not exists reviews_vendor_idx
  on reviews (vendor_id, created_at desc) where status = 'published';
create index if not exists reviews_buyer_idx on reviews (buyer_id, created_at desc);

-- ---------------------------------------------------------------------------
-- helpful votes
-- ---------------------------------------------------------------------------
--
-- A row per vote rather than a bare counter, so one account cannot vote twice
-- and a vote can be withdrawn. helpful_count on the review is a denormalised
-- cache of this table, maintained by trigger.

create table if not exists review_votes (
  review_id  uuid not null references reviews(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (review_id, user_id)
);

create or replace function sync_review_helpful() returns trigger as $$
declare r uuid;
begin
  r := coalesce(new.review_id, old.review_id);
  update reviews set helpful_count = (select count(*) from review_votes where review_id = r)
   where id = r;
  return null;
end $$ language plpgsql;

drop trigger if exists review_votes_sync on review_votes;
create trigger review_votes_sync after insert or delete on review_votes
  for each row execute function sync_review_helpful();

-- ---------------------------------------------------------------------------
-- ratings on listings
-- ---------------------------------------------------------------------------

alter table listings add column if not exists rating_avg   numeric(3,2) not null default 0;
alter table listings add column if not exists rating_count int not null default 0;

-- ---------------------------------------------------------------------------
-- aggregate maintenance
-- ---------------------------------------------------------------------------
--
-- Replaces sync_vendor_rating, which averaged every row regardless of status
-- and knew nothing about listings.
--
-- A store's rating rolls up EVERY published review for that vendor — the
-- store-level ones and the ones left on its products and services. The
-- alternative, rating stores only on store-level reviews, leaves two thinly
-- populated numbers that disagree with each other and confuse buyers. Etsy
-- works this way for the same reason: the shop score is the shop's items.
--
-- Hidden reviews are excluded from both averages, which is the entire point of
-- hiding rather than deleting.

create or replace function sync_review_aggregates() returns trigger as $$
declare
  v_id uuid;
  l_id uuid;
begin
  v_id := coalesce(new.vendor_id, old.vendor_id);
  -- On an UPDATE that moves a review between listings, both need recomputing.
  for l_id in select unnest(array_remove(array[new.listing_id, old.listing_id], null))
  loop
    update listings set
      rating_avg   = coalesce((select round(avg(rating)::numeric, 2) from reviews
                                where listing_id = l_id and status = 'published'), 0),
      rating_count = (select count(*) from reviews
                       where listing_id = l_id and status = 'published')
    where id = l_id;
  end loop;

  if v_id is not null then
    update vendors set
      rating_avg   = coalesce((select round(avg(rating)::numeric, 2) from reviews
                                where vendor_id = v_id and status = 'published'), 0),
      rating_count = (select count(*) from reviews
                       where vendor_id = v_id and status = 'published')
    where id = v_id;
  end if;
  return null;
end $$ language plpgsql;

drop trigger if exists reviews_sync on reviews;
drop function if exists sync_vendor_rating();

drop trigger if exists reviews_aggregate on reviews;
create trigger reviews_aggregate after insert or update or delete on reviews
  for each row execute function sync_review_aggregates();

-- Recompute everything once, so listings.rating_* is populated and any vendor
-- average that included a since-hidden row is corrected.
update listings l set
  rating_avg   = coalesce((select round(avg(r.rating)::numeric, 2) from reviews r
                            where r.listing_id = l.id and r.status = 'published'), 0),
  rating_count = (select count(*) from reviews r
                   where r.listing_id = l.id and r.status = 'published');

update vendors v set
  rating_avg   = coalesce((select round(avg(r.rating)::numeric, 2) from reviews r
                            where r.vendor_id = v.id and r.status = 'published'), 0),
  rating_count = (select count(*) from reviews r
                   where r.vendor_id = v.id and r.status = 'published');

-- ---------------------------------------------------------------------------
-- read model
-- ---------------------------------------------------------------------------
--
-- `verified` is derived, not stored: it is true exactly when the review is
-- attached to a real transaction. Legacy rows land on false, which is honest —
-- they were written when anyone could review anything.

create or replace view review_public as
select
  r.id, r.vendor_id, r.listing_id, r.buyer_id,
  r.rating, r.title, r.comment,
  r.helpful_count, r.created_at, r.edited_at,
  r.vendor_reply, r.vendor_replied_at,
  r.status,
  (r.order_id is not null or r.booking_id is not null) as verified,
  u.full_name as buyer_name,
  l.title as listing_title,
  l.slug  as listing_slug,
  l.kind  as listing_kind,
  v.business_name
from reviews r
join users u   on u.id = r.buyer_id
join vendors v on v.id = r.vendor_id
left join listings l on l.id = r.listing_id;

comment on view review_public is
  'Reviews with author, target and a derived verified flag. Callers must still filter on status; admin reads hidden rows too.';
