package render

import (
	"bytes"
	"embed"
	"fmt"
	"html/template"

	"github.com/mholtzscher/agent-artifacts/internal/artifact"
	"github.com/yuin/goldmark"
)

//go:embed templates/*.html
var templateFiles embed.FS

var (
	markdownRenderer = goldmark.New()
	artifactTemplate = template.Must(template.ParseFS(templateFiles, "templates/base.html", "templates/artifact.html"))
	feedTemplate     = template.Must(template.ParseFS(templateFiles, "templates/base.html", "templates/feed.html"))
)

type artifactView struct {
	Artifact         artifact.Artifact
	RenderedMarkdown template.HTML
	HTMLSource       string
	IsMarkdown       bool
}

type feedItem struct {
	Artifact    artifact.Artifact
	Description string
	CreatedAt   string
}

func ArtifactPage(value artifact.Artifact, source []byte) ([]byte, error) {
	view := artifactView{Artifact: value, IsMarkdown: value.SourceType == artifact.SourceTypeMarkdown}
	if view.IsMarkdown {
		var rendered bytes.Buffer
		if err := markdownRenderer.Convert(source, &rendered); err != nil {
			return nil, fmt.Errorf("render Markdown: %w", err)
		}
		view.RenderedMarkdown = template.HTML(rendered.String())
	} else {
		view.HTMLSource = string(source)
	}

	var output bytes.Buffer
	if err := artifactTemplate.ExecuteTemplate(&output, "base", view); err != nil {
		return nil, fmt.Errorf("render artifact page: %w", err)
	}
	return output.Bytes(), nil
}

func FeedPage(values []artifact.Artifact) ([]byte, error) {
	items := make([]feedItem, 0, len(values))
	for _, value := range values {
		description := ""
		if value.Description != nil {
			description = *value.Description
		}
		items = append(items, feedItem{
			Artifact:    value,
			Description: description,
			CreatedAt:   value.CreatedAt.Format("2006-01-02 15:04 UTC"),
		})
	}
	var output bytes.Buffer
	if err := feedTemplate.ExecuteTemplate(&output, "base", items); err != nil {
		return nil, fmt.Errorf("render feed page: %w", err)
	}
	return output.Bytes(), nil
}
