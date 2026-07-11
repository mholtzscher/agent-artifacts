package artifacts

import (
	"context"
	"io"
	"time"

	"github.com/google/uuid"
)

type SourceType string

const (
	SourceTypeMarkdown SourceType = "markdown"
	SourceTypeHTML     SourceType = "html"
)

type Artifact struct {
	ID             uuid.UUID
	Slug           string
	Title          string
	Description    *string
	SourceType     SourceType
	SourceFilename string
	SHA256         string
	SizeBytes      int64
	Project        *string
	RepoFullName   *string
	Branch         *string
	CommitSHA      *string
	Dirty          bool
	Agent          *string
	Generator      *string
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

type SourceInfo struct {
	SHA256    string
	SizeBytes int64
}

type SourceStore interface {
	Write(context.Context, uuid.UUID, SourceType, io.Reader) (SourceInfo, error)
	Read(context.Context, uuid.UUID, SourceType) (io.ReadCloser, error)
	Remove(uuid.UUID, SourceType) error
}
