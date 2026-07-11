package artifacts_test

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/mholtzscher/agent-artifacts/internal/modules/artifacts"
	"github.com/mholtzscher/agent-artifacts/internal/modules/artifacts/sourcefs"
)

type failingRepository struct{}

func (failingRepository) Create(context.Context, artifacts.Artifact) error {
	return errors.New("database unavailable")
}
func (failingRepository) FindBySlug(context.Context, string) (artifacts.Artifact, error) {
	return artifacts.Artifact{}, artifacts.ErrNotFound
}
func (failingRepository) ListRecent(context.Context, int32) ([]artifacts.Artifact, error) {
	return nil, nil
}
func TestPublishRemovesSourceWhenMetadataInsertFails(t *testing.T) {
	sources, err := sourcefs.New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	service := artifacts.NewService(failingRepository{}, sources)
	_, err = service.Publish(context.Background(), artifacts.PublishInput{Source: strings.NewReader("# Temporary"), SourceFilename: "temporary.md"})
	if err == nil {
		t.Fatal("Publish() error = nil, want metadata insert failure")
	}
}
