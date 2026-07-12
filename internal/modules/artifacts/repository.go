package artifacts

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/mholtzscher/agent-artifacts/internal/platform/db/sqlc"
)

type Repository interface {
	Create(context.Context, Artifact) error
	FindBySlug(context.Context, string) (Artifact, error)
	ListRecent(context.Context, int32) ([]Artifact, error)
}

type SQLRepository struct{ queries *sqlc.Queries }

func NewSQLRepository(queries *sqlc.Queries) *SQLRepository { return &SQLRepository{queries: queries} }
func (r *SQLRepository) Create(ctx context.Context, value Artifact) error {
	err := r.queries.CreateArtifact(ctx, createArtifactParams(value))
	if isSlugCollision(err) {
		return ErrSlugTaken
	}
	return err
}
func (r *SQLRepository) FindBySlug(ctx context.Context, slug string) (Artifact, error) {
	row, err := r.queries.GetArtifactBySlug(ctx, sqlc.GetArtifactBySlugParams{Slug: slug})
	if errors.Is(err, pgx.ErrNoRows) {
		return Artifact{}, ErrNotFound
	}
	if err != nil {
		return Artifact{}, fmt.Errorf("find artifact: %w", err)
	}
	return artifactFromRow(row)
}
func (r *SQLRepository) ListRecent(ctx context.Context, limit int32) ([]Artifact, error) {
	rows, err := r.queries.ListRecentArtifacts(ctx, sqlc.ListRecentArtifactsParams{Limit: limit})
	if err != nil {
		return nil, fmt.Errorf("list recent artifacts: %w", err)
	}
	values := make([]Artifact, 0, len(rows))
	for _, row := range rows {
		value, err := artifactFromRow(row)
		if err != nil {
			return nil, fmt.Errorf("decode recent artifact: %w", err)
		}
		values = append(values, value)
	}
	return values, nil
}
func createArtifactParams(value Artifact) sqlc.CreateArtifactParams {
	return sqlc.CreateArtifactParams{ID: pgtype.UUID{Bytes: [16]byte(value.ID), Valid: true}, Slug: value.Slug, Title: value.Title, Description: nullableText(value.Description), SourceType: sqlc.SourceType(value.SourceType), SourceFilename: value.SourceFilename, Sha256: value.SHA256, SizeBytes: value.SizeBytes, Project: nullableText(value.Project), RepoFullName: nullableText(value.RepoFullName), Branch: nullableText(value.Branch), CommitSha: nullableText(value.CommitSHA), Dirty: value.Dirty, Agent: nullableText(value.Agent), Generator: nullableText(value.Generator), CreatedAt: pgtype.Timestamptz{Time: value.CreatedAt, Valid: true}, UpdatedAt: pgtype.Timestamptz{Time: value.UpdatedAt, Valid: true}}
}
func artifactFromRow(row sqlc.Artifact) (Artifact, error) {
	if !row.ID.Valid || !row.CreatedAt.Valid || !row.UpdatedAt.Valid {
		return Artifact{}, fmt.Errorf("artifact row contains null required values")
	}
	return Artifact{ID: uuid.UUID(row.ID.Bytes), Slug: row.Slug, Title: row.Title, Description: textPointer(row.Description), SourceType: SourceType(row.SourceType), SourceFilename: row.SourceFilename, SHA256: row.Sha256, SizeBytes: row.SizeBytes, Project: textPointer(row.Project), RepoFullName: textPointer(row.RepoFullName), Branch: textPointer(row.Branch), CommitSHA: textPointer(row.CommitSha), Dirty: row.Dirty, Agent: textPointer(row.Agent), Generator: textPointer(row.Generator), CreatedAt: row.CreatedAt.Time, UpdatedAt: row.UpdatedAt.Time}, nil
}
func nullableText(value *string) pgtype.Text {
	if value == nil {
		return pgtype.Text{}
	}
	return pgtype.Text{String: *value, Valid: true}
}
func textPointer(value pgtype.Text) *string {
	if !value.Valid {
		return nil
	}
	copy := value.String
	return &copy
}
func isSlugCollision(err error) bool {
	var postgresError *pgconn.PgError
	return errors.As(err, &postgresError) && postgresError.Code == "23505" && postgresError.ConstraintName == "artifacts_slug_key"
}
