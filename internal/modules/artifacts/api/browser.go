package api

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/mholtzscher/agent-artifacts/internal/modules/artifacts"
	"github.com/mholtzscher/agent-artifacts/internal/modules/artifacts/render"
)

func RegisterBrowserRoutes(router chi.Router, service *artifacts.Service, ready func(context.Context) bool, logger *slog.Logger) {
	router.Get("/healthz", func(response http.ResponseWriter, _ *http.Request) {
		response.Header().Set("Content-Type", "text/plain; charset=utf-8")
		response.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(response, "ok\n")
	})
	router.Get("/readyz", func(response http.ResponseWriter, request *http.Request) {
		response.Header().Set("Content-Type", "text/plain; charset=utf-8")
		if !ready(request.Context()) {
			response.WriteHeader(http.StatusServiceUnavailable)
			_, _ = io.WriteString(response, "not ready\n")
			return
		}
		response.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(response, "ready\n")
	})
	router.Get("/", func(response http.ResponseWriter, request *http.Request) {
		values, err := service.ListRecent(request.Context(), 50)
		if err != nil {
			logger.ErrorContext(request.Context(), "render feed failed", "error", err)
			writeBrowserError(response, http.StatusInternalServerError)
			return
		}
		page, err := render.FeedPage(values)
		if err != nil {
			logger.ErrorContext(request.Context(), "render feed template failed", "error", err)
			writeBrowserError(response, http.StatusInternalServerError)
			return
		}
		writeHTML(response, http.StatusOK, page)
	})
	router.Get("/a/{slug}", func(response http.ResponseWriter, request *http.Request) {
		value, source, err := service.OpenSource(request.Context(), chi.URLParam(request, "slug"))
		if err != nil {
			writeAccessError(response, request, logger, err)
			return
		}
		defer source.Close()
		bytes, err := io.ReadAll(source)
		if err != nil {
			logger.ErrorContext(request.Context(), "read artifact source failed", "error", err)
			writeBrowserError(response, http.StatusInternalServerError)
			return
		}
		page, err := render.ArtifactPage(value, bytes)
		if err != nil {
			logger.ErrorContext(request.Context(), "render artifact failed", "error", err)
			writeBrowserError(response, http.StatusInternalServerError)
			return
		}
		writeHTML(response, http.StatusOK, page)
	})
	router.Get("/source/{slug}", func(response http.ResponseWriter, request *http.Request) {
		value, source, err := service.OpenSource(request.Context(), chi.URLParam(request, "slug"))
		if err != nil {
			writeAccessError(response, request, logger, err)
			return
		}
		defer source.Close()
		response.Header().Set("X-Content-Type-Options", "nosniff")
		if value.SourceType == artifacts.SourceTypeMarkdown {
			response.Header().Set("Content-Type", "text/markdown; charset=utf-8")
		} else {
			response.Header().Set("Content-Type", "text/plain; charset=utf-8")
		}
		if _, err := io.Copy(response, source); err != nil {
			logger.ErrorContext(request.Context(), "stream artifact source failed", "error", err)
		}
	})
}
func writeAccessError(response http.ResponseWriter, request *http.Request, logger *slog.Logger, err error) {
	if errors.Is(err, artifacts.ErrNotFound) {
		writeBrowserError(response, http.StatusNotFound)
		return
	}
	logger.ErrorContext(request.Context(), "artifact access failed", "error", err)
	writeBrowserError(response, http.StatusInternalServerError)
}
func writeHTML(response http.ResponseWriter, status int, body []byte) {
	response.Header().Set("Content-Type", "text/html; charset=utf-8")
	response.WriteHeader(status)
	_, _ = response.Write(body)
}
func writeBrowserError(response http.ResponseWriter, status int) {
	response.Header().Set("Content-Type", "text/html; charset=utf-8")
	response.WriteHeader(status)
	_, _ = io.WriteString(response, "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><title>"+http.StatusText(status)+"</title><h1>"+http.StatusText(status)+"</h1></html>")
}
