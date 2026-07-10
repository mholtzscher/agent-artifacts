package artifact

import (
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
