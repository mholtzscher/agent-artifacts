package artifacts_test

import (
	"context"
	"io"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mholtzscher/agent-artifacts/internal/modules/artifacts"
	"github.com/mholtzscher/agent-artifacts/internal/modules/artifacts/sourcefs"
	"github.com/mholtzscher/agent-artifacts/internal/platform/db/sqlc"
	"github.com/mholtzscher/agent-artifacts/internal/testsupport"
)

func TestPublishedArtifactCanBeListedAndRead(t *testing.T) {
	ctx := context.Background()
	databaseURL := testsupport.StartPostgres(t)
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	sources, err := sourcefs.New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	service := artifacts.NewService(artifacts.NewSQLRepository(sqlc.New(pool)), sources)
	published, err := service.Publish(ctx, artifacts.PublishInput{Source: strings.NewReader("# Hello\n\nWorld"), SourceFilename: "implementation-plan.md", ContentType: "text/markdown", Title: "Implementation Plan"})
	if err != nil {
		t.Fatalf("publish: %v", err)
	}
	values, err := service.ListRecent(ctx, 50)
	if err != nil || len(values) != 1 || values[0].Slug != published.Slug {
		t.Fatalf("ListRecent() = %#v, %v", values, err)
	}
	_, source, err := service.OpenSource(ctx, published.Slug)
	if err != nil {
		t.Fatalf("OpenSource(): %v", err)
	}
	defer source.Close()
	body, err := io.ReadAll(source)
	if err != nil || string(body) != "# Hello\n\nWorld" {
		t.Fatalf("source = %q, %v", body, err)
	}
}
