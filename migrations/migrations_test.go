package migrations

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
)

func TestApplyCreatesArtifactSchema(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	container, err := tcpostgres.Run(ctx, "postgres:17-alpine",
		tcpostgres.WithDatabase("agent_artifacts"),
		tcpostgres.WithUsername("postgres"),
		tcpostgres.WithPassword("postgres"),
		tcpostgres.BasicWaitStrategies(),
	)
	if err != nil {
		t.Fatalf("start postgres: %v", err)
	}
	t.Cleanup(func() {
		if err := container.Terminate(context.Background()); err != nil {
			t.Errorf("terminate postgres: %v", err)
		}
	})

	databaseURL, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("database connection string: %v", err)
	}
	if err := Apply(ctx, databaseURL); err != nil {
		t.Fatalf("Apply() error = %v", err)
	}

	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatalf("open pool: %v", err)
	}
	defer pool.Close()

	var sourceTypeExists bool
	if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT FROM pg_type WHERE typname = 'source_type')`).Scan(&sourceTypeExists); err != nil {
		t.Fatalf("query source_type: %v", err)
	}
	if !sourceTypeExists {
		t.Fatal("source_type enum does not exist")
	}

	var artifactsExists bool
	if err := pool.QueryRow(ctx, `SELECT to_regclass('public.artifacts') IS NOT NULL`).Scan(&artifactsExists); err != nil {
		t.Fatalf("query artifacts table: %v", err)
	}
	if !artifactsExists {
		t.Fatal("artifacts table does not exist")
	}
}
