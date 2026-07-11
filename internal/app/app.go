package app

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mholtzscher/agent-artifacts/internal/modules/artifacts"
	"github.com/mholtzscher/agent-artifacts/internal/modules/artifacts/sourcefs"
	"github.com/mholtzscher/agent-artifacts/internal/platform/db"
	"github.com/mholtzscher/agent-artifacts/internal/platform/db/sqlc"
)

func Run(ctx context.Context, config Config) error {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	sources, err := sourcefs.New(config.DataDir)
	if err != nil {
		return err
	}
	if err := db.Apply(ctx, config.DatabaseURL); err != nil {
		return err
	}
	pool, err := pgxpool.New(ctx, config.DatabaseURL)
	if err != nil {
		return fmt.Errorf("open PostgreSQL pool: %w", err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		return fmt.Errorf("ping PostgreSQL: %w", err)
	}
	service := artifacts.NewService(artifacts.NewSQLRepository(sqlc.New(pool)), sources)
	var ready atomic.Bool
	handler := NewServer(ServerDeps{Artifacts: service, WriteKey: config.WriteKey, PublicBaseURL: config.PublicBaseURL, MaxUploadBytes: config.MaxUploadBytes, Ready: func(ctx context.Context) bool {
		if !ready.Load() {
			return false
		}
		pingContext, cancel := context.WithTimeout(ctx, time.Second)
		defer cancel()
		return pool.Ping(pingContext) == nil
	}, Logger: logger})
	return serve(ctx, config.ListenAddr, handler, &ready, logger)
}
