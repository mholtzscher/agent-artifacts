package postgres

import (
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/mholtzscher/agent-artifacts/internal/artifact"
)

func CreateArtifactParamsFromDomain(value artifact.Artifact) CreateArtifactParams {
	return CreateArtifactParams{
		ID:             pgtype.UUID{Bytes: [16]byte(value.ID), Valid: true},
		Slug:           value.Slug,
		Title:          value.Title,
		Description:    nullableText(value.Description),
		SourceType:     SourceType(value.SourceType),
		SourceFilename: value.SourceFilename,
		Sha256:         value.SHA256,
		SizeBytes:      value.SizeBytes,
		Project:        nullableText(value.Project),
		RepoFullName:   nullableText(value.RepoFullName),
		Branch:         nullableText(value.Branch),
		CommitSha:      nullableText(value.CommitSHA),
		Dirty:          value.Dirty,
		Agent:          nullableText(value.Agent),
		Generator:      nullableText(value.Generator),
		CreatedAt:      pgtype.Timestamptz{Time: value.CreatedAt, Valid: true},
		UpdatedAt:      pgtype.Timestamptz{Time: value.UpdatedAt, Valid: true},
	}
}

func ArtifactToDomain(row Artifact) (artifact.Artifact, error) {
	if !row.ID.Valid || !row.CreatedAt.Valid || !row.UpdatedAt.Valid {
		return artifact.Artifact{}, fmt.Errorf("artifact row contains null required values")
	}
	return artifact.Artifact{
		ID:             uuid.UUID(row.ID.Bytes),
		Slug:           row.Slug,
		Title:          row.Title,
		Description:    textPointer(row.Description),
		SourceType:     artifact.SourceType(row.SourceType),
		SourceFilename: row.SourceFilename,
		SHA256:         row.Sha256,
		SizeBytes:      row.SizeBytes,
		Project:        textPointer(row.Project),
		RepoFullName:   textPointer(row.RepoFullName),
		Branch:         textPointer(row.Branch),
		CommitSHA:      textPointer(row.CommitSha),
		Dirty:          row.Dirty,
		Agent:          textPointer(row.Agent),
		Generator:      textPointer(row.Generator),
		CreatedAt:      row.CreatedAt.Time,
		UpdatedAt:      row.UpdatedAt.Time,
	}, nil
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
