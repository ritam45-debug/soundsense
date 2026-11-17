-- SoundSense – initial schema.  PostgreSQL 14+ (tested on PGlite/PG17 and Supabase).
-- Conventions: uuid PKs, timestamptz everywhere, text + CHECK instead of enum types
-- (easier to evolve with migrations), jsonb for flexible payloads.

create table organisations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(name) between 1 and 200),
  industry    text,
  city        text,
  created_at  timestamptz not null default now()
);

create table users (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  password_hash      text not null,
  name               text not null check (length(name) between 1 and 150),
  phone              text,
  role               text not null default 'customer' check (role in ('customer','consultant','admin')),
  organisation_id    uuid references organisations(id) on delete set null,
  email_verified_at  timestamptz,
  consent_privacy_at timestamptz,
  is_active          boolean not null default true,
  failed_logins      int not null default 0,
  locked_until       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index users_email_key on users (lower(email));
create index users_role_idx on users (role);
create index users_org_idx on users (organisation_id);

create table customer_profiles (
  user_id         uuid primary key references users(id) on delete cascade,
  designation     text,
  location        text,
  marketing_opt_in boolean not null default false
);

create table consultants (
  user_id        uuid primary key references users(id) on delete cascade,
  specialisation text,
  bio            text,
  active         boolean not null default true,
  max_cases      int not null default 20 check (max_cases > 0)
);

-- Server-side sessions so logout / admin deactivation can revoke access immediately.
create table sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  expires_at  timestamptz not null,
  user_agent  text,
  ip          text,
  created_at  timestamptz not null default now()
);
create index sessions_user_idx on sessions (user_id);

create table auth_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  kind        text not null check (kind in ('verify_email','reset_password')),
  token_hash  text not null unique,           -- SHA-256 of the emailed token; raw token never stored
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index auth_tokens_user_idx on auth_tokens (user_id, kind);

-- Fixed-window rate limiter that works across serverless instances.
create table rate_limits (
  key          text not null,
  window_start timestamptz not null,
  count        int not null default 0,
  primary key (key, window_start)
);

create sequence assessment_ref_seq start 1001;

create table assessments (
  id              uuid primary key default gen_random_uuid(),
  ref             text not null unique,                 -- human-friendly e.g. SS-2026-1001
  customer_id     uuid not null references users(id) on delete cascade,
  consultant_id   uuid references users(id) on delete set null,
  organisation_id uuid references organisations(id) on delete set null,
  title           text,
  environment_type text,
  status          text not null default 'draft' check (status in ('draft','submitted','in_review','completed')),
  step            int not null default 0,
  answers         jsonb not null default '{}'::jsonb,
  summary         jsonb,
  share_with_chat boolean not null default false,       -- explicit consent for chatbot access
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  submitted_at    timestamptz,
  completed_at    timestamptz
);
create index assessments_customer_idx on assessments (customer_id, created_at desc);
create index assessments_consultant_idx on assessments (consultant_id, status);
create index assessments_status_idx on assessments (status, created_at desc);

-- One row per answered question: powers issue analytics without parsing jsonb blobs.
create table questionnaire_responses (
  id             uuid primary key default gen_random_uuid(),
  assessment_id  uuid not null references assessments(id) on delete cascade,
  question_key   text not null,
  value          jsonb not null,
  created_at     timestamptz not null default now(),
  unique (assessment_id, question_key)
);
create index qr_key_idx on questionnaire_responses (question_key);

create table rooms (
  id             uuid primary key default gen_random_uuid(),
  assessment_id  uuid not null unique references assessments(id) on delete cascade,
  length_m       numeric(6,2) not null check (length_m > 0 and length_m <= 200),
  width_m        numeric(6,2) not null check (width_m > 0 and width_m <= 200),
  height_m       numeric(5,2) not null check (height_m > 0 and height_m <= 40),
  occupants      int not null default 0 check (occupants between 0 and 5000),
  floor_material text not null,
  wall_material  text not null,
  ceiling_material text not null,
  glass_share    text not null default 'none' check (glass_share in ('none','some','large')),
  soft_furnishings text not null default 'none' check (soft_furnishings in ('none','some','lots')),
  panels         text not null default 'none' check (panels in ('none','some','extensive')),
  computed       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table measurement_sessions (
  id              uuid primary key default gen_random_uuid(),
  assessment_id   uuid not null references assessments(id) on delete cascade,
  kind            text not null default 'ambient' check (kind in ('ambient','speech','other')),
  label           text,
  started_at      timestamptz not null default now(),
  duration_s      numeric(8,1) not null check (duration_s > 0),
  stats           jsonb not null,                       -- dBFS stats (relative!) – see lib/acoustics/measurement.ts
  samples         jsonb,                                -- down-sampled level trace for the chart
  calibration     jsonb not null default '{"status":"uncalibrated"}'::jsonb,
  device_note     text,
  notes           text,
  created_at      timestamptz not null default now()
);
create index ms_assessment_idx on measurement_sessions (assessment_id, started_at);

create table diagnostic_results (
  id               uuid primary key default gen_random_uuid(),
  assessment_id    uuid not null references assessments(id) on delete cascade,
  engine_version   text not null,
  primary_category text not null,
  scores           jsonb not null,
  confidence       numeric(4,3) not null check (confidence between 0 and 1),
  confidence_level text not null check (confidence_level in ('low','medium','high')),
  result           jsonb not null,                      -- full structured diagnosis (evidence, causes, tests…)
  expert_inspection boolean not null default false,
  created_at       timestamptz not null default now()
);
create index diag_assessment_idx on diagnostic_results (assessment_id, created_at desc);

create table products (
  id             uuid primary key default gen_random_uuid(),
  sku            text not null unique,
  name           text not null,
  solution_group text not null check (solution_group in ('equipment','room','software')),
  problem_category text not null,
  tier           text not null check (tier in ('budget','recommended','premium')),
  description    text not null,
  price_min      int not null check (price_min >= 0),
  price_max      int not null check (price_max >= price_min),
  currency       text not null default 'INR',
  price_basis    text not null default 'indicative_estimate' check (price_basis in ('indicative_estimate','vendor_quote','catalogue_price')),
  advantages     jsonb not null default '[]'::jsonb,
  limitations    jsonb not null default '[]'::jsonb,
  suitability    jsonb not null default '{}'::jsonb,    -- { minOccupants, maxOccupants, environments[] }
  maintenance    text,
  expected_improvement text,
  complexity     text not null default 'medium' check (complexity in ('low','medium','high')),
  active         boolean not null default true,
  updated_at     timestamptz not null default now()
);
create index products_cat_idx on products (problem_category, tier) where active;

create table recommendations (
  id             uuid primary key default gen_random_uuid(),
  assessment_id  uuid not null references assessments(id) on delete cascade,
  diagnostic_id  uuid references diagnostic_results(id) on delete set null,
  problem_category text not null,
  tier           text not null check (tier in ('budget','recommended','premium')),
  is_best_fit    boolean not null default false,
  product_id     uuid references products(id) on delete set null,
  title          text not null,
  detail         jsonb not null,                        -- snapshot of product + why text, so catalogue edits don't rewrite history
  price_min      int not null,
  price_max      int not null,
  currency       text not null default 'INR',
  consultant_modified boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index rec_assessment_idx on recommendations (assessment_id);

create table bookings (
  id             uuid primary key default gen_random_uuid(),
  ref            text not null unique,
  customer_id    uuid not null references users(id) on delete cascade,
  assessment_id  uuid references assessments(id) on delete set null,
  consultant_id  uuid references users(id) on delete set null,
  type           text not null check (type in ('room_acoustics','conference_room','equipment','noise_cancellation','temple_pa','general')),
  slot_start     timestamptz not null,
  slot_end       timestamptz not null,
  status         text not null default 'requested' check (status in
                   ('requested','confirmed','reschedule_requested','cancel_requested','cancelled','rejected','completed')),
  contact        jsonb not null default '{}'::jsonb,
  description    text,
  requested_slot_start timestamptz,                    -- pending reschedule target
  status_note    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (slot_end > slot_start)
);
create index bookings_customer_idx on bookings (customer_id, slot_start desc);
create index bookings_slot_idx on bookings (slot_start) where status in ('requested','confirmed','reschedule_requested','cancel_requested');
-- A customer cannot hold two live bookings in the same slot.
create unique index bookings_customer_slot_uq on bookings (customer_id, slot_start)
  where status in ('requested','confirmed','reschedule_requested','cancel_requested');

create table reports (
  id             uuid primary key default gen_random_uuid(),
  assessment_id  uuid not null references assessments(id) on delete cascade,
  version        int not null default 1,
  status         text not null default 'preliminary' check (status in ('preliminary','final')),
  consultant_remarks text,
  payload        jsonb not null,                        -- immutable snapshot used to render the PDF
  generated_by   uuid references users(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (assessment_id, version)
);

create table feedback (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references users(id) on delete cascade,
  assessment_id  uuid references assessments(id) on delete set null,
  booking_id     uuid references bookings(id) on delete set null,
  overall        smallint not null check (overall between 1 and 5),
  usefulness     smallint not null check (usefulness between 1 and 5),
  consultation   smallint check (consultation between 1 and 5),
  improvement    smallint check (improvement between 1 and 5),
  value_for_money smallint not null check (value_for_money between 1 and 5),
  improve_text   text check (length(improve_text) <= 2000),
  comments       text check (length(comments) <= 4000),
  created_at     timestamptz not null default now()
);
create index feedback_created_idx on feedback (created_at desc);

create table chat_conversations (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users(id) on delete cascade,
  assessment_id  uuid references assessments(id) on delete set null,
  title          text,
  share_assessment boolean not null default false,
  escalated      boolean not null default false,
  escalated_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index chat_conv_user_idx on chat_conversations (user_id, updated_at desc);

create table chat_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references chat_conversations(id) on delete cascade,
  role             text not null check (role in ('user','assistant','system')),
  content          text not null check (length(content) <= 8000),
  source           text check (source in ('llm','fallback','human')),
  created_at       timestamptz not null default now()
);
create index chat_msg_conv_idx on chat_messages (conversation_id, created_at);

create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  title       text not null,
  body        text,
  link        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notif_user_idx on notifications (user_id, created_at desc);

create table audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid,
  actor_role  text,
  action      text not null,
  entity      text,
  entity_id   text,
  meta        jsonb not null default '{}'::jsonb,
  ip          text,
  created_at  timestamptz not null default now()
);
create index audit_entity_idx on audit_logs (entity, entity_id);
create index audit_created_idx on audit_logs (created_at desc);

create table case_notes (
  id             uuid primary key default gen_random_uuid(),
  assessment_id  uuid not null references assessments(id) on delete cascade,
  author_id      uuid not null references users(id) on delete cascade,
  body           text not null check (length(body) between 1 and 5000),
  visibility     text not null default 'internal' check (visibility in ('internal','customer')),
  created_at     timestamptz not null default now()
);
create index notes_assessment_idx on case_notes (assessment_id, created_at);

create table case_documents (
  id             uuid primary key default gen_random_uuid(),
  assessment_id  uuid not null references assessments(id) on delete cascade,
  uploader_id    uuid not null references users(id) on delete cascade,
  filename       text not null,
  mime_type      text not null,
  size_bytes     int not null check (size_bytes between 1 and 5242880),
  data           bytea not null,
  created_at     timestamptz not null default now()
);
create index docs_assessment_idx on case_documents (assessment_id);

create table system_settings (
  key         text primary key,
  value       jsonb not null,
  updated_by  uuid,
  updated_at  timestamptz not null default now()
);

create table availability_blocks (
  id          uuid primary key default gen_random_uuid(),
  day         date not null,
  reason      text,
  created_at  timestamptz not null default now(),
  unique (day)
);
