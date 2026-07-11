-- +goose Up
CREATE TYPE source_type AS ENUM ('markdown', 'html');

CREATE TABLE artifacts (
    id uuid PRIMARY KEY,
    slug text NOT NULL UNIQUE CHECK (slug <> ''),
    title text NOT NULL CHECK (title <> ''),
    description text,
    source_type source_type NOT NULL,
    source_filename text NOT NULL CHECK (source_filename <> ''),
    sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
    project text,
    repo_full_name text,
    branch text,
    commit_sha text,
    dirty boolean NOT NULL DEFAULT false,
    agent text,
    generator text,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);

CREATE INDEX artifacts_created_at_idx ON artifacts (created_at DESC);

-- +goose Down
DROP TABLE artifacts;
DROP TYPE source_type;
