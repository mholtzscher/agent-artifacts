package publication

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime"
	"path/filepath"
	"strings"
	"time"
	"unicode"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/mholtzscher/agent-artifacts/internal/artifact"
	"github.com/mholtzscher/agent-artifacts/internal/postgres"
	"github.com/mholtzscher/agent-artifacts/internal/sourcefs"
)

var (
	ErrUnsupportedSourceType = errors.New("unsupported source type")
	ErrSlugGeneration        = errors.New("could not generate a unique slug")
)

type Input struct {
	Source         io.Reader
	SourceFilename string
	ContentType    string
	Title          string
	Description    *string
	Project        *string
	RepoFullName   *string
	Branch         *string
	CommitSHA      *string
	Dirty          bool
	Agent          *string
	Generator      *string
}

type artifactCreator interface {
	CreateArtifact(context.Context, postgres.CreateArtifactParams) error
}

type Publisher struct {
	queries artifactCreator
	sources *sourcefs.Store
}

func New(queries artifactCreator, sources *sourcefs.Store) *Publisher {
	return &Publisher{queries: queries, sources: sources}
}

func (p *Publisher) Publish(ctx context.Context, input Input) (artifact.Artifact, error) {
	sourceType, err := detectSourceType(input.SourceFilename, input.ContentType)
	if err != nil {
		return artifact.Artifact{}, err
	}

	id := uuid.New()
	now := time.Now().UTC()
	value := artifact.Artifact{
		ID:             id,
		Title:          inferTitle(input.SourceFilename, input.Title),
		Description:    cleanOptional(input.Description),
		SourceType:     sourceType,
		SourceFilename: filepath.Base(input.SourceFilename),
		Project:        cleanOptional(input.Project),
		RepoFullName:   cleanOptional(input.RepoFullName),
		Branch:         cleanOptional(input.Branch),
		CommitSHA:      cleanOptional(input.CommitSHA),
		Dirty:          input.Dirty,
		Agent:          cleanOptional(input.Agent),
		Generator:      cleanOptional(input.Generator),
		CreatedAt:      now,
		UpdatedAt:      now,
	}

	info, err := p.sources.Write(ctx, id, sourceType, input.Source)
	if err != nil {
		return artifact.Artifact{}, fmt.Errorf("persist source: %w", err)
	}
	value.SHA256 = info.SHA256
	value.SizeBytes = info.SizeBytes

	for range 8 {
		value.Slug, err = makeSlug(value.Title)
		if err != nil {
			return artifact.Artifact{}, p.failAfterSource(value, err)
		}
		createErr := p.queries.CreateArtifact(ctx, postgres.CreateArtifactParamsFromDomain(value))
		if createErr == nil {
			return value, nil
		}
		if isSlugCollision(createErr) {
			continue
		}
		return artifact.Artifact{}, p.failAfterSource(value, fmt.Errorf("insert artifact metadata: %w", createErr))
	}

	return artifact.Artifact{}, p.failAfterSource(value, ErrSlugGeneration)
}

func (p *Publisher) failAfterSource(value artifact.Artifact, cause error) error {
	if cleanupErr := p.sources.Remove(value.ID, value.SourceType); cleanupErr != nil {
		return errors.Join(cause, fmt.Errorf("remove source after publication failure: %w", cleanupErr))
	}
	return cause
}

func detectSourceType(filename, contentType string) (artifact.SourceType, error) {
	extension := strings.ToLower(filepath.Ext(filename))
	mediaType, _, _ := mime.ParseMediaType(contentType)
	switch {
	case extension == ".md", extension == ".markdown", mediaType == "text/markdown":
		return artifact.SourceTypeMarkdown, nil
	case extension == ".html", extension == ".htm", mediaType == "text/html":
		return artifact.SourceTypeHTML, nil
	default:
		return "", fmt.Errorf("%w: %s", ErrUnsupportedSourceType, filepath.Base(filename))
	}
}

func inferTitle(filename, provided string) string {
	if title := strings.TrimSpace(provided); title != "" {
		return title
	}
	base := strings.TrimSuffix(filepath.Base(filename), filepath.Ext(filename))
	base = strings.Join(strings.Fields(strings.NewReplacer("-", " ", "_", " ").Replace(base)), " ")
	if base == "" {
		return "Untitled artifact"
	}
	return base
}

func cleanOptional(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func makeSlug(title string) (string, error) {
	var base strings.Builder
	separator := false
	for _, value := range strings.ToLower(title) {
		if value >= 'a' && value <= 'z' || value >= '0' && value <= '9' {
			if separator && base.Len() > 0 {
				base.WriteByte('-')
			}
			base.WriteRune(value)
			separator = false
		} else if unicode.IsSpace(value) || unicode.IsPunct(value) || unicode.IsSymbol(value) {
			separator = true
		}
	}
	if base.Len() == 0 {
		base.WriteString("artifact")
	}

	random := make([]byte, 4)
	if _, err := rand.Read(random); err != nil {
		return "", fmt.Errorf("generate slug suffix: %w", err)
	}
	return base.String() + "-" + hex.EncodeToString(random), nil
}

func isSlugCollision(err error) bool {
	var postgresError *pgconn.PgError
	return errors.As(err, &postgresError) && postgresError.Code == "23505" && postgresError.ConstraintName == "artifacts_slug_key"
}
