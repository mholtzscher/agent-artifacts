-- name: CreateArtifact :exec
INSERT INTO artifacts (
    id,
    slug,
    title,
    description,
    source_type,
    source_filename,
    sha256,
    size_bytes,
    project,
    repo_full_name,
    branch,
    commit_sha,
    dirty,
    agent,
    generator,
    created_at,
    updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
);

-- name: GetArtifactBySlug :one
SELECT *
FROM artifacts
WHERE slug = $1
LIMIT 1;

-- name: ListRecentArtifacts :many
SELECT *
FROM artifacts
ORDER BY created_at DESC
LIMIT $1;
