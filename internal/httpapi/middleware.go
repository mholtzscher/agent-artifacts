package httpapi

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"
)

func publishGuard(writeKey string, maxUploadBytes int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
			if request.Method != http.MethodPost || request.URL.Path != "/api/v1/artifacts" {
				next.ServeHTTP(response, request)
				return
			}

			provided := request.Header.Get("X-Write-Key")
			if provided == "" {
				writeProblem(response, http.StatusUnauthorized, "Missing write key")
				return
			}
			providedDigest := sha256.Sum256([]byte(provided))
			configuredDigest := sha256.Sum256([]byte(writeKey))
			if subtle.ConstantTimeCompare(providedDigest[:], configuredDigest[:]) != 1 {
				writeProblem(response, http.StatusForbidden, "Invalid write key")
				return
			}
			if request.ContentLength > maxUploadBytes {
				writeProblem(response, http.StatusRequestEntityTooLarge, "Request body is too large")
				return
			}
			request.Body = http.MaxBytesReader(response, request.Body, maxUploadBytes)
			next.ServeHTTP(response, request)
		})
	}
}

func writeProblem(response http.ResponseWriter, status int, detail string) {
	response.Header().Set("Content-Type", "application/problem+json")
	response.WriteHeader(status)
	_ = json.NewEncoder(response).Encode(map[string]any{
		"type":   "about:blank",
		"title":  http.StatusText(status),
		"status": status,
		"detail": detail,
	})
}

func requestLog(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
			start := time.Now()
			recorder := &statusRecorder{ResponseWriter: response, status: http.StatusOK}
			next.ServeHTTP(recorder, request)
			logger.InfoContext(request.Context(), "http request",
				"method", request.Method,
				"path", request.URL.Path,
				"status", recorder.status,
				"duration_ms", time.Since(start).Milliseconds(),
			)
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
