-- Row Level Security.
--
-- Model: the Node server authenticates the user (own auth, see src/lib/auth) and then runs every
-- user-scoped query inside a transaction that does
--     SET LOCAL ROLE soundsense_app;  set_config('app.user_id', …); set_config('app.role', …)
-- so PostgreSQL itself enforces "customers only see their own data". Credentials, sessions,
-- tokens, rate-limits and audit writes use the owner connection and are NOT granted to the app role.
-- On Supabase the built-in anon/authenticated roles get no policies => the REST API exposes nothing.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'soundsense_app') then
    create role soundsense_app nologin;
  end if;
end $$;

-- Let the connecting (owner) role switch into the restricted role (needed on Supabase's `postgres`).
do $$ begin
  execute format('grant soundsense_app to %I', current_user);
exception when others then null;
end $$;

create or replace function app_uid() returns uuid language sql stable as
$$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

create or replace function app_role() returns text language sql stable as
$$ select nullif(current_setting('app.role', true), '') $$;

grant usage on schema public to soundsense_app;

-- ── users: never expose password_hash / lockout columns to the app role ──────────────
grant select (id, email, name, phone, role, organisation_id, email_verified_at, consent_privacy_at,
              is_active, created_at, updated_at) on users to soundsense_app;
grant update (name, phone, organisation_id, consent_privacy_at, is_active, role, updated_at) on users to soundsense_app;
alter table users enable row level security;
create policy users_select on users for select to soundsense_app using (
  id = app_uid()
  or app_role() = 'admin'
  or exists (select 1 from assessments a where a.customer_id = users.id and a.consultant_id = app_uid())
  or (role = 'consultant' and is_active)
);
create policy users_update on users for update to soundsense_app
  using (id = app_uid() or app_role() = 'admin')
  with check (id = app_uid() or app_role() = 'admin');

-- ── organisations ────────────────────────────────────────────────────────────────────
grant select, insert, update on organisations to soundsense_app;
alter table organisations enable row level security;
create policy org_select on organisations for select to soundsense_app using (
  app_role() = 'admin'
  or id = (select organisation_id from users where id = app_uid())
  or exists (select 1 from assessments a where a.organisation_id = organisations.id)
);
create policy org_insert on organisations for insert to soundsense_app with check (app_uid() is not null);
create policy org_update on organisations for update to soundsense_app using (
  app_role() = 'admin' or id = (select organisation_id from users where id = app_uid())
);

-- ── profiles ─────────────────────────────────────────────────────────────────────────
grant select, insert, update on customer_profiles to soundsense_app;
alter table customer_profiles enable row level security;
create policy cp_all on customer_profiles for all to soundsense_app
  using (user_id = app_uid() or app_role() = 'admin'
         or exists (select 1 from assessments a where a.customer_id = customer_profiles.user_id and a.consultant_id = app_uid()))
  with check (user_id = app_uid() or app_role() = 'admin');

grant select, insert, update, delete on consultants to soundsense_app;
alter table consultants enable row level security;
create policy cons_select on consultants for select to soundsense_app using (app_uid() is not null);
create policy cons_write on consultants for all to soundsense_app
  using (app_role() = 'admin' or user_id = app_uid()) with check (app_role() = 'admin' or user_id = app_uid());

-- ── assessments & children ───────────────────────────────────────────────────────────
grant select, insert, update, delete on assessments to soundsense_app;
alter table assessments enable row level security;
create policy a_select on assessments for select to soundsense_app using (
  customer_id = app_uid() or consultant_id = app_uid() or app_role() = 'admin');
create policy a_insert on assessments for insert to soundsense_app with check (
  customer_id = app_uid() or app_role() = 'admin');
create policy a_update on assessments for update to soundsense_app using (
  customer_id = app_uid() or consultant_id = app_uid() or app_role() = 'admin')
  with check (customer_id = app_uid() or consultant_id = app_uid() or app_role() = 'admin');
create policy a_delete on assessments for delete to soundsense_app using (
  (customer_id = app_uid() and status = 'draft') or app_role() = 'admin');

do $$
declare t text;
begin
  foreach t in array array['questionnaire_responses','rooms','measurement_sessions','diagnostic_results','recommendations','reports'] loop
    execute format('grant select, insert, update, delete on %I to soundsense_app', t);
    execute format('alter table %I enable row level security', t);
    execute format($p$create policy %1$s_all on %1$I for all to soundsense_app
      using (exists (select 1 from assessments a where a.id = %1$I.assessment_id))
      with check (exists (select 1 from assessments a where a.id = %1$I.assessment_id))$p$, t);
  end loop;
end $$;

-- Reports and diagnostics are produced by the platform/consultants; customers read only.
drop policy reports_all on reports;
create policy reports_select on reports for select to soundsense_app using (
  exists (select 1 from assessments a where a.id = reports.assessment_id));
create policy reports_write on reports for insert to soundsense_app with check (
  exists (select 1 from assessments a where a.id = reports.assessment_id));
create policy reports_update on reports for update to soundsense_app using (
  app_role() in ('consultant','admin') and exists (select 1 from assessments a where a.id = reports.assessment_id));

-- ── notes (internal vs customer visible) & documents ─────────────────────────────────
grant select, insert, delete on case_notes to soundsense_app;
alter table case_notes enable row level security;
create policy notes_select on case_notes for select to soundsense_app using (
  exists (select 1 from assessments a where a.id = case_notes.assessment_id)
  and (app_role() in ('consultant','admin') or visibility = 'customer'));
create policy notes_insert on case_notes for insert to soundsense_app with check (
  app_role() in ('consultant','admin') and author_id = app_uid()
  and exists (select 1 from assessments a where a.id = case_notes.assessment_id));
create policy notes_delete on case_notes for delete to soundsense_app using (
  app_role() = 'admin' or author_id = app_uid());

grant select, insert, delete on case_documents to soundsense_app;
alter table case_documents enable row level security;
create policy docs_select on case_documents for select to soundsense_app using (
  exists (select 1 from assessments a where a.id = case_documents.assessment_id));
create policy docs_insert on case_documents for insert to soundsense_app with check (
  uploader_id = app_uid() and exists (select 1 from assessments a where a.id = case_documents.assessment_id));
create policy docs_delete on case_documents for delete to soundsense_app using (
  uploader_id = app_uid() or app_role() = 'admin');

-- ── products & settings ──────────────────────────────────────────────────────────────
grant select, insert, update, delete on products to soundsense_app;
alter table products enable row level security;
create policy prod_select on products for select to soundsense_app using (active or app_role() = 'admin');
create policy prod_write on products for all to soundsense_app using (app_role() = 'admin') with check (app_role() = 'admin');

grant select, insert, update on system_settings to soundsense_app;
alter table system_settings enable row level security;
create policy set_select on system_settings for select to soundsense_app using (app_uid() is not null);
create policy set_write on system_settings for all to soundsense_app using (app_role() = 'admin') with check (app_role() = 'admin');

grant select, insert, update, delete on availability_blocks to soundsense_app;
alter table availability_blocks enable row level security;
create policy blocks_select on availability_blocks for select to soundsense_app using (app_uid() is not null);
create policy blocks_write on availability_blocks for all to soundsense_app using (app_role() = 'admin') with check (app_role() = 'admin');

-- ── bookings ─────────────────────────────────────────────────────────────────────────
grant select, insert, update on bookings to soundsense_app;
alter table bookings enable row level security;
create policy b_select on bookings for select to soundsense_app using (
  customer_id = app_uid() or consultant_id = app_uid() or app_role() = 'admin');
create policy b_insert on bookings for insert to soundsense_app with check (
  customer_id = app_uid() or app_role() = 'admin');
create policy b_update on bookings for update to soundsense_app using (
  customer_id = app_uid() or consultant_id = app_uid() or app_role() = 'admin');

-- ── feedback ─────────────────────────────────────────────────────────────────────────
grant select, insert on feedback to soundsense_app;
alter table feedback enable row level security;
create policy f_select on feedback for select to soundsense_app using (
  customer_id = app_uid() or app_role() = 'admin'
  or exists (select 1 from assessments a where a.id = feedback.assessment_id and a.consultant_id = app_uid()));
create policy f_insert on feedback for insert to soundsense_app with check (customer_id = app_uid());

-- ── chat ─────────────────────────────────────────────────────────────────────────────
grant select, insert, update, delete on chat_conversations to soundsense_app;
alter table chat_conversations enable row level security;
create policy cc_select on chat_conversations for select to soundsense_app using (
  user_id = app_uid() or (escalated and app_role() in ('consultant','admin')));
create policy cc_insert on chat_conversations for insert to soundsense_app with check (user_id = app_uid());
create policy cc_update on chat_conversations for update to soundsense_app using (
  user_id = app_uid() or (escalated and app_role() in ('consultant','admin')));
create policy cc_delete on chat_conversations for delete to soundsense_app using (user_id = app_uid());

grant select, insert on chat_messages to soundsense_app;
alter table chat_messages enable row level security;
create policy cm_select on chat_messages for select to soundsense_app using (
  exists (select 1 from chat_conversations c where c.id = chat_messages.conversation_id));
create policy cm_insert on chat_messages for insert to soundsense_app with check (
  exists (select 1 from chat_conversations c where c.id = chat_messages.conversation_id));

-- ── notifications ────────────────────────────────────────────────────────────────────
grant select, update, delete on notifications to soundsense_app;
alter table notifications enable row level security;
create policy n_select on notifications for select to soundsense_app using (user_id = app_uid());
create policy n_update on notifications for update to soundsense_app using (user_id = app_uid());
create policy n_delete on notifications for delete to soundsense_app using (user_id = app_uid());

-- ── audit logs: admins read; writes happen through the owner connection only ─────────
grant select on audit_logs to soundsense_app;
alter table audit_logs enable row level security;
create policy audit_select on audit_logs for select to soundsense_app using (app_role() = 'admin');

-- ── Credentials & infrastructure tables: RLS on, no grants, no policies (owner only) ──
alter table sessions enable row level security;
alter table auth_tokens enable row level security;
alter table rate_limits enable row level security;

-- Sequence used when creating assessments as the app role.
grant usage, select on sequence assessment_ref_seq to soundsense_app;
