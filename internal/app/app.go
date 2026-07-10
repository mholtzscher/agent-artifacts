package app

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mholtzscher/agent-artifacts/internal/access"
	"github.com/mholtzscher/agent-artifacts/internal/httpapi"
	"github.com/mholtzscher/agent-artifacts/internal/postgres"
	"github.com/mholtzscher/agent-artifacts/internal/publication"
	"github.com/mholtzscher/agent-artifacts/internal/sourcefs"
	"github.com/mholtzscher/agent-artifacts/migrations"
)

func Run(ctx context.Context, config Config) error {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	sources, err := sourcefs.New(config.DataDir)
	if err != nil {
		return err
	}
	if err := migrations.Apply(ctx, config.DatabaseURL); err != nil {
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

	queries := postgres.New(pool)
	var ready atomic.Bool
	handler := httpapi.New(httpapi.Dependencies{
		Publisher:      publication.New(queries, sources),
		Artifacts:      access.New(queries, sources),
		WriteKey:       config.WriteKey,
		PublicBaseURL:  config.PublicBaseURL,
		MaxUploadBytes: config.MaxUploadBytes,
		Ready: func(ctx context.Context) bool {
			if !ready.Load() {
				return false
			}
			pingContext, cancel := context.WithTimeout(ctx, time.Second)
			defer cancel()
			return pool.Ping(pingContext) == nil
		},
		Logger: logger,
	})

	listener, err := net.Listen("tcp", config.ListenAddr)
	if err != nil {
		return fmt.Errorf("listen on %s: %w", config.ListenAddr, err)
	}
	server := &http.Server{
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	serveErrors := make(chan error, 1)
	go func() {
		serveErrors <- server.Serve(listener)
	}()
	ready.Store(true)
	logger.Info("server started", "address", listener.Addr().String())

	select {
	case <-ctx.Done():
		ready.Store(false)
		shutdownContext, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownContext); err != nil {
			return fmt.Errorf("shut down HTTP server: %w", err)
		}
		if err := <-serveErrors; err != nil && !errors.Is(err, http.ErrServerClosed) {
			return fmt.Errorf("serve HTTP: %w", err)
		}
		logger.Info("server stopped")
		return nil
	case err := <-serveErrors:
		ready.Store(false)
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			return fmt.Errorf("serve HTTP: %w", err)
		}
		return nil
	}
}
