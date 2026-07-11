package app

import (
	"context"
	"log/slog"
	"net/http"
	"net/url"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humachi"
	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/mholtzscher/agent-artifacts/internal/modules/artifacts"
	artifactsapi "github.com/mholtzscher/agent-artifacts/internal/modules/artifacts/api"
)

type ServerDeps struct {
	Artifacts      *artifacts.Service
	WriteKey       string
	PublicBaseURL  *url.URL
	MaxUploadBytes int64
	Ready          func(context.Context) bool
	Logger         *slog.Logger
}

func NewServer(deps ServerDeps) http.Handler {
	if deps.Logger == nil {
		deps.Logger = slog.Default()
	}
	if deps.Ready == nil {
		deps.Ready = func(context.Context) bool { return true }
	}
	router := chi.NewRouter()
	router.Use(chimiddleware.RequestID, requestLog(deps.Logger), chimiddleware.Recoverer)
	artifactsapi.RegisterBrowserRoutes(router, deps.Artifacts, deps.Ready, deps.Logger)
	api := humachi.New(router, huma.DefaultConfig("Agent Artifacts API", "1.0.0"))
	artifactsapi.Register(api, deps.Artifacts, artifactsapi.Options{WriteKey: deps.WriteKey, PublicBaseURL: deps.PublicBaseURL, MaxUploadBytes: deps.MaxUploadBytes, Logger: deps.Logger})
	return router
}
func requestLog(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
			start := time.Now()
			recorder := &statusRecorder{ResponseWriter: response, status: http.StatusOK}
			next.ServeHTTP(recorder, request)
			logger.InfoContext(request.Context(), "http request", "method", request.Method, "path", request.URL.Path, "status", recorder.status, "duration_ms", time.Since(start).Milliseconds())
		})
	}
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}
