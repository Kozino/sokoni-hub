-- Admin-editable site copy: legal documents, contact details, announcement banner.
-- Additive. Safe to run more than once. Public clients only read published rows.

create table if not exists content_pages (
  slug text primary key check (slug in ('terms', 'privacy', 'policy', 'faq')),
  published_title text,
  published_subtitle text not null default '',
  published_markdown text,
  published_version text not null default '',
  published_effective text not null default '',
  published_at timestamptz,
  draft_title text,
  draft_subtitle text,
  draft_markdown text,
  draft_version text,
  draft_effective text,
  draft_updated_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id)
);

insert into system_settings (key, value) values (
  'site_content',
  '{
    "operatorName": "Sokoni Hub Retail and Business Support Platforms",
    "operatorCR": "254111",
    "operatorAddress": "Doha, Qatar",
    "supportEmail": "support@sokonihub.qa",
    "supportWhatsApp": "97466046431",
    "supportDisplay": "+974 6604 6431",
    "supportHours": "24 hours a day, 7 days a week",
    "responseTime": "24 hours",
    "siteUrl": "https://sokonihub.qa",
    "announcementEnabled": false,
    "announcementText": "",
    "announcementHref": ""
  }'::jsonb
) on conflict (key) do nothing;
