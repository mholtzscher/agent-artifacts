package artifacts

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
)

var (
	ErrNotFound              = errors.New("artifact not found")
	ErrUnsupportedSourceType = errors.New("unsupported source type")
	ErrSlugGeneration        = errors.New("could not generate a unique slug")
	ErrSlugTaken             = errors.New("artifact slug is already taken")
)

type PublishInput struct {
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

type Service struct {
	repo    Repository
	sources SourceStore
}

func NewService(repo Repository, sources SourceStore) *Service {
	return &Service{repo: repo, sources: sources}
}

func (s *Service) Publish(ctx context.Context, input PublishInput) (Artifact, error) {
	sourceType, err := detectSourceType(input.SourceFilename, input.ContentType)
	if err != nil {
		return Artifact{}, err
	}

	value := Artifact{
		ID: uuid.New(), Title: inferTitle(input.SourceFilename, input.Title), Description: cleanOptional(input.Description),
		SourceType: sourceType, SourceFilename: filepath.Base(input.SourceFilename), Project: cleanOptional(input.Project),
		RepoFullName: cleanOptional(input.RepoFullName), Branch: cleanOptional(input.Branch), CommitSHA: cleanOptional(input.CommitSHA),
		Dirty: input.Dirty, Agent: cleanOptional(input.Agent), Generator: cleanOptional(input.Generator), CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC(),
	}
	info, err := s.sources.Write(ctx, value.ID, sourceType, input.Source)
	if err != nil {
		return Artifact{}, fmt.Errorf("persist source: %w", err)
	}
	value.SHA256, value.SizeBytes = info.SHA256, info.SizeBytes

	for range 8 {
		value.Slug, err = makeSlug(value.Title)
		if err != nil {
			return Artifact{}, s.failAfterSource(value, err)
		}
		err = s.repo.Create(ctx, value)
		if err == nil {
			return value, nil
		}
		if errors.Is(err, ErrSlugTaken) {
			continue
		}
		return Artifact{}, s.failAfterSource(value, fmt.Errorf("insert artifact metadata: %w", err))
	}
	return Artifact{}, s.failAfterSource(value, ErrSlugGeneration)
}

func (s *Service) ListRecent(ctx context.Context, limit int32) ([]Artifact, error) {
	return s.repo.ListRecent(ctx, limit)
}
func (s *Service) FindBySlug(ctx context.Context, slug string) (Artifact, error) {
	return s.repo.FindBySlug(ctx, slug)
}
func (s *Service) OpenSource(ctx context.Context, slug string) (Artifact, io.ReadCloser, error) {
	value, err := s.FindBySlug(ctx, slug)
	if err != nil {
		return Artifact{}, nil, err
	}
	source, err := s.sources.Read(ctx, value.ID, value.SourceType)
	if err != nil {
		return Artifact{}, nil, fmt.Errorf("artifact source is unavailable: %w", err)
	}
	return value, source, nil
}

func (s *Service) failAfterSource(value Artifact, cause error) error {
	if err := s.sources.Remove(value.ID, value.SourceType); err != nil {
		return errors.Join(cause, fmt.Errorf("remove source after publication failure: %w", err))
	}
	return cause
}

func detectSourceType(filename, contentType string) (SourceType, error) {
	extension := strings.ToLower(filepath.Ext(filename))
	mediaType, _, _ := mime.ParseMediaType(contentType)
	switch {
	case extension == ".md" || extension == ".markdown" || mediaType == "text/markdown":
		return SourceTypeMarkdown, nil
	case extension == ".html" || extension == ".htm" || mediaType == "text/html":
		return SourceTypeHTML, nil
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
