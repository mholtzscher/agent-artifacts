package httpapi

import (
	"errors"
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/mholtzscher/agent-artifacts/internal/access"
	"github.com/mholtzscher/agent-artifacts/internal/artifact"
	"github.com/mholtzscher/agent-artifacts/internal/render"
)

func registerBrowserRoutes(router chi.Router, dependencies Dependencies) {
	router.Get("/healthz", func(response http.ResponseWriter, _ *http.Request) {
		response.Header().Set("Content-Type", "text/plain; charset=utf-8")
		response.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(response, "ok\n")
	})
	router.Get("/readyz", func(response http.ResponseWriter, request *http.Request) {
		response.Header().Set("Content-Type", "text/plain; charset=utf-8")
		if !dependencies.Ready(request.Context()) {
			response.WriteHeader(http.StatusServiceUnavailable)
			_, _ = io.WriteString(response, "not ready\n")
			return
		}
		response.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(response, "ready\n")
	})
	router.Get("/", func(response http.ResponseWriter, request *http.Request) {
		values, err := dependencies.Artifacts.ListRecent(request.Context(), 50)
		if err != nil {
			dependencies.Logger.ErrorContext(request.Context(), "render feed failed", "error", err)
			writeBrowserError(response, http.StatusInternalServerError)
			return
		}
		page, err := render.FeedPage(values)
		if err != nil {
			dependencies.Logger.ErrorContext(request.Context(), "render feed template failed", "error", err)
			writeBrowserError(response, http.StatusInternalServerError)
			return
		}
		writeHTML(response, http.StatusOK, page)
	})
	router.Get("/a/{slug}", func(response http.ResponseWriter, request *http.Request) {
		value, source, err := dependencies.Artifacts.OpenSource(request.Context(), chi.URLParam(request, "slug"))
		if err != nil {
			writeAccessError(response, request, dependencies, err)
			return
		}
		defer source.Close()
		bytes, err := io.ReadAll(source)
		if err != nil {
			dependencies.Logger.ErrorContext(request.Context(), "read artifact source failed", "error", err)
			writeBrowserError(response, http.StatusInternalServerError)
			return
		}
		page, err := render.ArtifactPage(value, bytes)
		if err != nil {
			dependencies.Logger.ErrorContext(request.Context(), "render artifact failed", "error", err)
			writeBrowserError(response, http.StatusInternalServerError)
			return
		}
		writeHTML(response, http.StatusOK, page)
	})
	router.Get("/source/{slug}", func(response http.ResponseWriter, request *http.Request) {
		value, source, err := dependencies.Artifacts.OpenSource(request.Context(), chi.URLParam(request, "slug"))
		if err != nil {
			writeAccessError(response, request, dependencies, err)
			return
		}
		defer source.Close()
		response.Header().Set("X-Content-Type-Options", "nosniff")
		if value.SourceType == artifact.SourceTypeMarkdown {
			response.Header().Set("Content-Type", "text/markdown; charset=utf-8")
		} else {
			response.Header().Set("Content-Type", "text/plain; charset=utf-8")
		}
		if _, err := io.Copy(response, source); err != nil {
			dependencies.Logger.ErrorContext(request.Context(), "stream artifact source failed", "error", err)
		}
	})
}

func writeAccessError(response http.ResponseWriter, request *http.Request, dependencies Dependencies, err error) {
	if errors.Is(err, access.ErrNotFound) {
		writeBrowserError(response, http.StatusNotFound)
		return
	}
	dependencies.Logger.ErrorContext(request.Context(), "artifact access failed", "error", err)
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
