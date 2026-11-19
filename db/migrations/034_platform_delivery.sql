-- Sokoni Hub handles delivery. Admin sets the fee and radius for every store.
-- Additive. Safe to run more than once. Vendor rows keep pickup flags/address;
-- fee and radius are overwritten from system_settings.delivery on admin save.

insert into system_settings (key, value) values (
  'delivery',
  '{"delivery_fee":0,"delivery_radius_km":null,"free_delivery_over":null}'::jsonb
) on conflict (key) do nothing;
