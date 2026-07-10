package access

import (
	"context"
	"errors"
	"fmt"
	"io"

	"github.com/jackc/pgx/v5"
	"github.com/mholtzscher/agent-artifacts/internal/artifact"
	"github.com/mholtzscher/agent-artifacts/internal/postgres"
	"github.com/mholtzscher/agent-artifacts/internal/sourcefs"
)

var ErrNotFound = errors.New("artifact not found")

type Reader struct {
	queries *postgres.Queries
	sources *sourcefs.Store
}

func New(queries *postgres.Queries, sources *sourcefs.Store) *Reader {
	return &Reader{queries: queries, sources: sources}
}

func (r *Reader) ListRecent(ctx context.Context, limit int32) ([]artifact.Artifact, error) {
	rows, err := r.queries.ListRecentArtifacts(ctx, limit)
	if err != nil {
		return nil, fmt.Errorf("list recent artifacts: %w", err)
	}
	artifacts := make([]artifact.Artifact, 0, len(rows))
	for _, row := range rows {
		value, err := postgres.ArtifactToDomain(row)
		if err != nil {
			return nil, fmt.Errorf("decode recent artifact: %w", err)
		}
		artifacts = append(artifacts, value)
	}
	return artifacts, nil
}

func (r *Reader) FindBySlug(ctx context.Context, slug string) (artifact.Artifact, error) {
	row, err := r.queries.GetArtifactBySlug(ctx, slug)
	if errors.Is(err, pgx.ErrNoRows) {
		return artifact.Artifact{}, ErrNotFound
	}
	if err != nil {
		return artifact.Artifact{}, fmt.Errorf("find artifact: %w", err)
	}
	value, err := postgres.ArtifactToDomain(row)
	if err != nil {
		return artifact.Artifact{}, fmt.Errorf("decode artifact: %w", err)
	}
	return value, nil
}

func (r *Reader) OpenSource(ctx context.Context, slug string) (artifact.Artifact, io.ReadCloser, error) {
	value, err := r.FindBySlug(ctx, slug)
	if err != nil {
		return artifact.Artifact{}, nil, err
	}
	source, err := r.sources.Read(ctx, value.ID, value.SourceType)
	if err != nil {
		return artifact.Artifact{}, nil, fmt.Errorf("artifact source is unavailable: %w", err)
	}
	return value, source, nil
}
