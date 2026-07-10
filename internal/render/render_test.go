package render_test

import (
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/mholtzscher/agent-artifacts/internal/artifact"
	"github.com/mholtzscher/agent-artifacts/internal/render"
)

func TestArtifactPageRendersMarkdownWithoutRawHTML(t *testing.T) {
	value := testArtifact(artifact.SourceTypeMarkdown)
	value.Title = `<script>alert("title")</script>`

	page, err := render.ArtifactPage(value, []byte("# Hello\n\n<script>alert('source')</script>"))
	if err != nil {
		t.Fatalf("ArtifactPage() error = %v", err)
	}
	html := string(page)
	if !strings.Contains(html, "<h1>Hello</h1>") {
		t.Errorf("page does not contain rendered Markdown: %s", html)
	}
	if strings.Contains(html, "<script>alert") {
		t.Errorf("page contains executable raw HTML: %s", html)
	}
	if !strings.Contains(html, `&lt;script&gt;alert`) {
		t.Errorf("page does not escape artifact title: %s", html)
	}
}

func TestArtifactPageSandboxesHTMLWithoutSameOrigin(t *testing.T) {
	value := testArtifact(artifact.SourceTypeHTML)

	page, err := render.ArtifactPage(value, []byte(`<h1>Report</h1><script>window.parent.document.body.remove()</script>`))
	if err != nil {
		t.Fatalf("ArtifactPage() error = %v", err)
	}
	html := string(page)
	if !strings.Contains(html, `sandbox="allow-scripts"`) {
		t.Errorf("page does not allow sandboxed scripts: %s", html)
	}
	if strings.Contains(html, "allow-same-origin") {
		t.Errorf("page grants same-origin access: %s", html)
	}
	if !strings.Contains(html, `&lt;script&gt;window.parent`) {
		t.Errorf("HTML source is not safely placed in srcdoc: %s", html)
	}
}

func testArtifact(sourceType artifact.SourceType) artifact.Artifact {
	return artifact.Artifact{
		ID:             uuid.MustParse("62c610a1-67d9-4ea6-b9da-6b793d107b79"),
		Slug:           "test-artifact-1a2b3c4d",
		Title:          "Test Artifact",
		SourceType:     sourceType,
		SourceFilename: "test.md",
		SHA256:         strings.Repeat("a", 64),
		SizeBytes:      10,
		CreatedAt:      time.Date(2026, 7, 9, 12, 0, 0, 0, time.UTC),
		UpdatedAt:      time.Date(2026, 7, 9, 12, 0, 0, 0, time.UTC),
	}
}
