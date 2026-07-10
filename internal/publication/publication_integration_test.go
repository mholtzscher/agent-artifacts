package publication_test

import (
	"context"
	"io"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mholtzscher/agent-artifacts/internal/access"
	"github.com/mholtzscher/agent-artifacts/internal/artifact"
	"github.com/mholtzscher/agent-artifacts/internal/postgres"
	"github.com/mholtzscher/agent-artifacts/internal/publication"
	"github.com/mholtzscher/agent-artifacts/internal/sourcefs"
	"github.com/mholtzscher/agent-artifacts/internal/testsupport"
)

func TestPublishedArtifactCanBeListedAndRead(t *testing.T) {
	ctx := context.Background()
	databaseURL := testsupport.StartPostgres(t)
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatalf("open pool: %v", err)
	}
	t.Cleanup(pool.Close)

	sources, err := sourcefs.New(t.TempDir())
	if err != nil {
		t.Fatalf("create source store: %v", err)
	}
	queries := postgres.New(pool)
	publisher := publication.New(queries, sources)
	artifacts := access.New(queries, sources)

	published, err := publisher.Publish(ctx, publication.Input{
		Source:         strings.NewReader("# Hello\n\nWorld"),
		SourceFilename: "implementation-plan.md",
		ContentType:    "text/markdown",
		Title:          "Implementation Plan",
		RepoFullName:   stringPointer("mholtzscher/agent-artifacts"),
		Dirty:          true,
	})
	if err != nil {
		t.Fatalf("Publish() error = %v", err)
	}
	if published.SourceType != artifact.SourceTypeMarkdown {
		t.Errorf("SourceType = %q, want markdown", published.SourceType)
	}
	if !strings.HasPrefix(published.Slug, "implementation-plan-") || len(published.Slug) != len("implementation-plan-")+8 {
		t.Errorf("Slug = %q, want implementation-plan- plus 8 hex characters", published.Slug)
	}
	if published.SHA256 != "ad6e0bf888da964ab57992e86c6f894aaec3325d7b18355ab92c81babe81c4a3" {
		t.Errorf("SHA256 = %q, want known digest", published.SHA256)
	}

	recent, err := artifacts.ListRecent(ctx, 50)
	if err != nil {
		t.Fatalf("ListRecent() error = %v", err)
	}
	if len(recent) != 1 || recent[0].Slug != published.Slug {
		t.Fatalf("recent = %#v, want published artifact", recent)
	}

	found, source, err := artifacts.OpenSource(ctx, published.Slug)
	if err != nil {
		t.Fatalf("OpenSource() error = %v", err)
	}
	defer source.Close()
	bytes, err := io.ReadAll(source)
	if err != nil {
		t.Fatalf("read source: %v", err)
	}
	if found.ID != published.ID || string(bytes) != "# Hello\n\nWorld" {
		t.Errorf("found artifact/source = %#v, %q", found, bytes)
	}
}

func stringPointer(value string) *string {
	return &value
}
