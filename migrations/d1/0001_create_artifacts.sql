create table if not exists artifacts (
  id text primary key,
  slug text not null unique,
  title text not null,
  description text,
  source_type text not null,
  source_filename text not null,
  sha256 text not null,
  size_bytes integer not null,
  project text,
  repo_full_name text,
  branch text,
  commit_sha text,
  dirty integer not null default 0,
  agent text,
  generator text,
  state text not null default 'active',
  created_at text not null,
  updated_at text not null
);

create index if not exists artifacts_created_at_idx on artifacts(created_at desc);
create index if not exists artifacts_state_idx on artifacts(state);
