package publication_test

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/mholtzscher/agent-artifacts/internal/artifact"
	"github.com/mholtzscher/agent-artifacts/internal/postgres"
	"github.com/mholtzscher/agent-artifacts/internal/publication"
	"github.com/mholtzscher/agent-artifacts/internal/sourcefs"
)

type failingArtifactCreator struct {
	params postgres.CreateArtifactParams
}

func (f *failingArtifactCreator) CreateArtifact(_ context.Context, params postgres.CreateArtifactParams) error {
	f.params = params
	return errors.New("database unavailable")
}

func TestPublishRemovesSourceWhenMetadataInsertFails(t *testing.T) {
	sources, err := sourcefs.New(t.TempDir())
	if err != nil {
		t.Fatalf("create source store: %v", err)
	}
	creator := &failingArtifactCreator{}
	publisher := publication.New(creator, sources)

	_, err = publisher.Publish(context.Background(), publication.Input{
		Source:         strings.NewReader("# Temporary"),
		SourceFilename: "temporary.md",
	})
	if err == nil {
		t.Fatal("Publish() error = nil, want metadata insert failure")
	}

	id := creator.params.ID.Bytes
	if _, err := sources.Read(context.Background(), uuid.UUID(id), artifact.SourceTypeMarkdown); err == nil {
		t.Fatal("source remains after metadata insert failure")
	}
}
