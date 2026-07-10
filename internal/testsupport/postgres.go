package testsupport

import (
	"context"
	"testing"
	"time"

	"github.com/mholtzscher/agent-artifacts/migrations"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
)

func StartPostgres(t testing.TB) string {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	t.Cleanup(cancel)

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
	if err := migrations.Apply(ctx, databaseURL); err != nil {
		t.Fatalf("apply migrations: %v", err)
	}
	return databaseURL
}
