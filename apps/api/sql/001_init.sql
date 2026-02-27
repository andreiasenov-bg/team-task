create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  password_hash text not null,
  whatsapp_phone text unique,
  avatar_url text,
  role text not null check (role in ('admin', 'manager', 'employee')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table users add column if not exists whatsapp_phone text;

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  owner_id uuid not null references users(id),
  status text not null default 'active',
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists project_members (
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  assigned_to uuid references users(id),
  title text not null,
  description text not null default '',
  priority text not null default 'low' check (priority in ('low', 'medium', 'high')),
  due_date timestamptz,
  recurrence_type text not null default 'none' check (recurrence_type in ('none', 'daily', 'weekly', 'monthly')),
  recurrence_interval integer not null default 1 check (recurrence_interval >= 1 and recurrence_interval <= 365),
  recurrence_weekdays text[] not null default '{}',
  recurrence_day_of_month integer,
  recurrence_monthly_mode text not null default 'day_of_month' check (recurrence_monthly_mode in ('day_of_month', 'last_business_day')),
  recurrence_end_at timestamptz,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  position integer not null default 1000,
  review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'rejected')),
  review_comment text,
  reviewed_at timestamptz,
  reviewed_by uuid references users(id),
  sla_due_at timestamptz,
  sla_reminded_at timestamptz,
  sla_last_reminded_at timestamptz,
  sla_reminder_count integer not null default 0,
  sla_escalated_at timestamptz,
  archived_at timestamptz,
  archived_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table tasks add column if not exists reviewed_at timestamptz;
alter table tasks add column if not exists reviewed_by uuid references users(id);
alter table tasks add column if not exists review_status text not null default 'pending';
alter table tasks add column if not exists review_comment text;
alter table tasks add column if not exists sla_due_at timestamptz;
alter table tasks add column if not exists sla_reminded_at timestamptz;
alter table tasks add column if not exists sla_last_reminded_at timestamptz;
alter table tasks add column if not exists sla_reminder_count integer not null default 0;
alter table tasks add column if not exists sla_escalated_at timestamptz;
alter table tasks add column if not exists archived_at timestamptz;
alter table tasks add column if not exists archived_by uuid references users(id);
alter table tasks add column if not exists recurrence_type text not null default 'none';
alter table tasks add column if not exists recurrence_interval integer not null default 1;
alter table tasks add column if not exists recurrence_weekdays text[] not null default '{}';
alter table tasks add column if not exists recurrence_day_of_month integer;
alter table tasks add column if not exists recurrence_monthly_mode text not null default 'day_of_month';
alter table tasks add column if not exists recurrence_end_at timestamptz;

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  user_id uuid not null references users(id),
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references users(id),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  meta_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  file_name text not null,
  file_url text not null,
  mime_type text,
  size_bytes bigint,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  task_id uuid references tasks(id) on delete cascade,
  type text not null,
  dedupe_key text,
  title text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  remind_at timestamptz
);

alter table notifications add column if not exists dedupe_key text;

create table if not exists notification_preferences (
  user_id uuid primary key references users(id) on delete cascade,
  in_app_enabled boolean not null default true,
  whatsapp_enabled boolean not null default true,
  quiet_hours_enabled boolean not null default false,
  quiet_hours_start integer not null default 22 check (quiet_hours_start >= 0 and quiet_hours_start <= 23),
  quiet_hours_end integer not null default 8 check (quiet_hours_end >= 0 and quiet_hours_end <= 23),
  timezone_offset_minutes integer not null default 0 check (timezone_offset_minutes >= -840 and timezone_offset_minutes <= 840),
  updated_at timestamptz not null default now()
);

create table if not exists inbound_webhook_messages (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_message_id text not null,
  payload_json jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now(),
  unique (provider, external_message_id)
);

create table if not exists outbound_message_queue (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('whatsapp')),
  recipient text not null,
  body text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists assistant_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists assistant_dynamic_skills (
  id uuid primary key default gen_random_uuid(),
  skill_key text not null unique,
  title text not null,
  description text not null default '',
  roles text[] not null default '{employee,manager,admin}',
  query_sql text not null,
  enabled boolean not null default true,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists assistant_skill_approvals (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null references assistant_dynamic_skills(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  note text,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references users(id),
  unique (skill_id, user_id)
);

create table if not exists system_settings (
  setting_key text primary key,
  value_json jsonb not null default '{}'::jsonb,
  updated_by uuid references users(id),
  updated_at timestamptz not null default now()
);

create index if not exists idx_projects_owner_id on projects(owner_id);
create unique index if not exists idx_users_whatsapp_phone on users(whatsapp_phone) where whatsapp_phone is not null;
create index if not exists idx_tasks_project_id on tasks(project_id);
create index if not exists idx_tasks_assigned_to on tasks(assigned_to);
create index if not exists idx_tasks_status on tasks(status);
create index if not exists idx_tasks_archived_at on tasks(archived_at);
create index if not exists idx_tasks_review_status on tasks(review_status);
create index if not exists idx_tasks_due_date on tasks(due_date);
create index if not exists idx_tasks_sla_due_at on tasks(sla_due_at);
create index if not exists idx_tasks_sla_last_reminded_at on tasks(sla_last_reminded_at);
create index if not exists idx_activity_logs_entity on activity_logs(entity_type, entity_id);
create index if not exists idx_notifications_user_id on notifications(user_id, is_read, created_at desc);
create index if not exists idx_notifications_dedupe_key on notifications(user_id, type, dedupe_key, created_at desc);
create index if not exists idx_inbound_webhook_messages_provider_external on inbound_webhook_messages(provider, external_message_id);
create index if not exists idx_outbound_message_queue_pending on outbound_message_queue(status, next_attempt_at);
create index if not exists idx_assistant_memories_user_created on assistant_memories(user_id, created_at desc);
create index if not exists idx_assistant_dynamic_skills_key on assistant_dynamic_skills(skill_key);
create index if not exists idx_assistant_skill_approvals_status on assistant_skill_approvals(status, requested_at desc);
create index if not exists idx_system_settings_updated_at on system_settings(updated_at desc);
