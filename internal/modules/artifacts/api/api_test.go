package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mholtzscher/agent-artifacts/internal/app"
	"github.com/mholtzscher/agent-artifacts/internal/modules/artifacts"
	"github.com/mholtzscher/agent-artifacts/internal/modules/artifacts/sourcefs"
	"github.com/mholtzscher/agent-artifacts/internal/platform/db/sqlc"
	"github.com/mholtzscher/agent-artifacts/internal/testsupport"
)

func TestPublishAndPublicAccess(t *testing.T) {
	server := newTestServer(t, 1024*1024)

	missingKey := multipartRequest(t, server.URL+"/api/v1/artifacts", "missing.md", "text/markdown", "# Missing", nil)
	response, err := http.DefaultClient.Do(missingKey)
	if err != nil {
		t.Fatalf("publish without key: %v", err)
	}
	assertProblemStatus(t, response, http.StatusUnauthorized)

	invalidKey := multipartRequest(t, server.URL+"/api/v1/artifacts", "invalid.md", "text/markdown", "# Invalid", nil)
	invalidKey.Header.Set("X-Write-Key", "wrong")
	response, err = http.DefaultClient.Do(invalidKey)
	if err != nil {
		t.Fatalf("publish with invalid key: %v", err)
	}
	assertProblemStatus(t, response, http.StatusForbidden)

	unsupported := multipartRequest(t, server.URL+"/api/v1/artifacts", "notes.txt", "text/plain", "plain text", nil)
	unsupported.Header.Set("X-Write-Key", "ap_test")
	response, err = http.DefaultClient.Do(unsupported)
	if err != nil {
		t.Fatalf("publish unsupported source: %v", err)
	}
	assertProblemStatus(t, response, http.StatusUnsupportedMediaType)

	request := multipartRequest(t, server.URL+"/api/v1/artifacts", "plan.md", "text/markdown", "# Plan\n\nShip it.", map[string]string{
		"title": "Implementation Plan",
		"repo":  "mholtzscher/agent-artifacts",
		"dirty": "true",
	})
	request.Header.Set("X-Write-Key", "ap_test")
	response, err = http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("publish Markdown: %v", err)
	}
	if response.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(response.Body)
		response.Body.Close()
		t.Fatalf("publish status = %d, want 201: %s", response.StatusCode, body)
	}
	var published struct {
		Slug        string `json:"slug"`
		SourceType  string `json:"sourceType"`
		ArtifactURL string `json:"artifactUrl"`
		SourceURL   string `json:"sourceUrl"`
	}
	if err := json.NewDecoder(response.Body).Decode(&published); err != nil {
		t.Fatalf("decode publish response: %v", err)
	}
	response.Body.Close()
	if published.SourceType != "markdown" || published.ArtifactURL != "/a/"+published.Slug || published.SourceURL != "/source/"+published.Slug {
		t.Errorf("publish response = %#v", published)
	}

	response = get(t, server.URL+"/api/v1/artifacts")
	if response.StatusCode != http.StatusOK {
		t.Fatalf("feed status = %d, want 200", response.StatusCode)
	}
	var feed struct {
		Artifacts []struct {
			Slug         string  `json:"slug"`
			RepoFullName *string `json:"repoFullName"`
			Dirty        bool    `json:"dirty"`
		} `json:"artifacts"`
	}
	if err := json.NewDecoder(response.Body).Decode(&feed); err != nil {
		t.Fatalf("decode feed: %v", err)
	}
	response.Body.Close()
	if len(feed.Artifacts) != 1 || feed.Artifacts[0].Slug != published.Slug || feed.Artifacts[0].RepoFullName == nil || *feed.Artifacts[0].RepoFullName != "mholtzscher/agent-artifacts" || !feed.Artifacts[0].Dirty {
		t.Errorf("feed = %#v", feed)
	}

	response = get(t, server.URL+published.SourceURL)
	source, _ := io.ReadAll(response.Body)
	response.Body.Close()
	if response.StatusCode != http.StatusOK || !strings.Contains(response.Header.Get("Content-Type"), "text/markdown") || response.Header.Get("X-Content-Type-Options") != "nosniff" || string(source) != "# Plan\n\nShip it." {
		t.Errorf("source response = status %d, headers %#v, body %q", response.StatusCode, response.Header, source)
	}

	response = get(t, server.URL+published.ArtifactURL)
	page, _ := io.ReadAll(response.Body)
	response.Body.Close()
	if response.StatusCode != http.StatusOK || !bytes.Contains(page, []byte("<h1>Plan</h1>")) {
		t.Errorf("artifact response = status %d, body %q", response.StatusCode, page)
	}

	htmlRequest := multipartRequest(t, server.URL+"/api/v1/artifacts", "report.html", "text/html", `<script>window.reportLoaded=true</script>`, map[string]string{"title": "Report"})
	htmlRequest.Header.Set("X-Write-Key", "ap_test")
	response, err = http.DefaultClient.Do(htmlRequest)
	if err != nil {
		t.Fatalf("publish HTML: %v", err)
	}
	var htmlPublished struct {
		Slug string `json:"slug"`
	}
	if response.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(response.Body)
		response.Body.Close()
		t.Fatalf("publish HTML status = %d, want 201: %s", response.StatusCode, body)
	}
	if err := json.NewDecoder(response.Body).Decode(&htmlPublished); err != nil {
		t.Fatalf("decode HTML publish response: %v", err)
	}
	response.Body.Close()

	response = get(t, server.URL+"/source/"+htmlPublished.Slug)
	htmlSource, _ := io.ReadAll(response.Body)
	if !strings.Contains(response.Header.Get("Content-Type"), "text/plain") || string(htmlSource) != `<script>window.reportLoaded=true</script>` {
		t.Errorf("HTML source response = Content-Type %q, body %q", response.Header.Get("Content-Type"), htmlSource)
	}
	response.Body.Close()

	response = get(t, server.URL+"/a/"+htmlPublished.Slug)
	htmlPage, _ := io.ReadAll(response.Body)
	response.Body.Close()
	if !bytes.Contains(htmlPage, []byte(`sandbox="allow-scripts"`)) || bytes.Contains(htmlPage, []byte("allow-same-origin")) {
		t.Errorf("HTML artifact sandbox is unsafe: %s", htmlPage)
	}

	for _, path := range []string{"/a/missing-artifact", "/source/missing-artifact"} {
		response = get(t, server.URL+path)
		response.Body.Close()
		if response.StatusCode != http.StatusNotFound {
			t.Errorf("GET %s status = %d, want 404", path, response.StatusCode)
		}
	}

	for _, path := range []string{"/healthz", "/readyz"} {
		response = get(t, server.URL+path)
		response.Body.Close()
		if response.StatusCode != http.StatusOK {
			t.Errorf("GET %s status = %d, want 200", path, response.StatusCode)
		}
	}

	response = get(t, server.URL+"/openapi.json")
	openAPI, _ := io.ReadAll(response.Body)
	response.Body.Close()
	if response.StatusCode != http.StatusOK || !bytes.Contains(openAPI, []byte(`"/api/v1/artifacts"`)) {
		t.Errorf("OpenAPI response = status %d, body %q", response.StatusCode, openAPI)
	}
}

func TestPublishRejectsOversizedBody(t *testing.T) {
	server := newTestServer(t, 128)
	request := multipartRequest(t, server.URL+"/api/v1/artifacts", "large.md", "text/markdown", strings.Repeat("x", 1024), nil)
	request.Header.Set("X-Write-Key", "ap_test")

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("publish oversized body: %v", err)
	}
	assertProblemStatus(t, response, http.StatusRequestEntityTooLarge)
}

func newTestServer(t *testing.T, maxUploadBytes int64) *httptest.Server {
	t.Helper()
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
	queries := sqlc.New(pool)
	handler := app.NewServer(app.ServerDeps{
		Artifacts:      artifacts.NewService(artifacts.NewSQLRepository(queries), sources),
		WriteKey:       "ap_test",
		MaxUploadBytes: maxUploadBytes,
		Ready:          func(context.Context) bool { return true },
		Logger:         slog.New(slog.NewTextHandler(io.Discard, nil)),
	})
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	return server
}

func multipartRequest(t *testing.T, url, filename, contentType, content string, fields map[string]string) *http.Request {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	header := make(textproto.MIMEHeader)
	header.Set("Content-Disposition", `form-data; name="file"; filename="`+filename+`"`)
	header.Set("Content-Type", contentType)
	file, err := writer.CreatePart(header)
	if err != nil {
		t.Fatalf("create multipart file: %v", err)
	}
	if _, err := io.WriteString(file, content); err != nil {
		t.Fatalf("write multipart file: %v", err)
	}
	for name, value := range fields {
		if err := writer.WriteField(name, value); err != nil {
			t.Fatalf("write multipart field: %v", err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close multipart: %v", err)
	}
	request, err := http.NewRequest(http.MethodPost, url, &body)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	request.Header.Set("Content-Type", writer.FormDataContentType())
	return request
}

func get(t *testing.T, url string) *http.Response {
	t.Helper()
	response, err := http.Get(url)
	if err != nil {
		t.Fatalf("GET %s: %v", url, err)
	}
	return response
}

func assertProblemStatus(t *testing.T, response *http.Response, status int) {
	t.Helper()
	defer response.Body.Close()
	if response.StatusCode != status {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("status = %d, want %d: %s", response.StatusCode, status, body)
	}
	if !strings.Contains(response.Header.Get("Content-Type"), "application/problem+json") {
		t.Errorf("Content-Type = %q, want application/problem+json", response.Header.Get("Content-Type"))
	}
}
