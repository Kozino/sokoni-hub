-- 010_review_policy.sql
--
-- Makes the "a review requires a completed transaction" rule a setting rather
-- than a decision baked into the code.
--
-- 009 enforces proof of purchase, which is the right default and the strongest
-- lever against fake reviews. But it has a real cost that only shows up once
-- the site is live: on a young marketplace almost nobody is eligible, so the
-- reviews section looks broken to buyers and to whoever is demonstrating it.
-- That is a commercial judgement about growth versus trust, and it belongs to
-- the operator, not to whoever wrote the endpoint.
--
-- Default is TRUE, so applying this migration changes nothing. Turning it off
-- lets any signed-in buyer review any listing or store. Those reviews are
-- still written without an order_id or booking_id, so `verified` is false and
-- the badge is absent — the distinction survives the policy change, and
-- switching back later does not retroactively bless anything.
--
-- Two rules are NOT configurable, because they are integrity rather than
-- policy: a vendor can never review their own store, and one buyer still gets
-- one review per target.

alter table platform_settings
  add column if not exists reviews_require_purchase boolean not null default true;

comment on column platform_settings.reviews_require_purchase is
  'When true (default) only buyers with a delivered order or completed booking may review. When false any signed-in buyer may, and their review is shown without the verified badge.';
