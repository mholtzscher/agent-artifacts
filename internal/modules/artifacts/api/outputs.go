package api

import (
	"github.com/mholtzscher/agent-artifacts/internal/modules/artifacts"
	"net/url"
)

type publishOutput struct{ Body publishResponse }
type publishResponse struct {
	ID          string `json:"id" format:"uuid"`
	Slug        string `json:"slug"`
	Title       string `json:"title"`
	SourceType  string `json:"sourceType" enum:"markdown,html"`
	ArtifactURL string `json:"artifactUrl"`
	SourceURL   string `json:"sourceUrl"`
	CreatedAt   string `json:"createdAt" format:"date-time"`
}
type feedOutput struct{ Body feedResponse }
type feedResponse struct {
	Artifacts []artifactItem `json:"artifacts"`
}
type artifactItem struct {
	ID           string  `json:"id" format:"uuid"`
	Slug         string  `json:"slug"`
	Title        string  `json:"title"`
	Description  *string `json:"description"`
	SourceType   string  `json:"sourceType" enum:"markdown,html"`
	SourceURL    string  `json:"sourceUrl"`
	ArtifactURL  string  `json:"artifactUrl"`
	Project      *string `json:"project"`
	RepoFullName *string `json:"repoFullName"`
	Branch       *string `json:"branch"`
	CommitSHA    *string `json:"commitSha"`
	Dirty        bool    `json:"dirty"`
	Agent        *string `json:"agent"`
	Generator    *string `json:"generator"`
	CreatedAt    string  `json:"createdAt" format:"date-time"`
	UpdatedAt    string  `json:"updatedAt" format:"date-time"`
}

func makePublishResponse(value artifacts.Artifact, baseURL *url.URL) publishResponse {
	return publishResponse{ID: value.ID.String(), Slug: value.Slug, Title: value.Title, SourceType: string(value.SourceType), ArtifactURL: publicURL("/a/"+value.Slug, baseURL), SourceURL: publicURL("/source/"+value.Slug, baseURL), CreatedAt: value.CreatedAt.Format("2006-01-02T15:04:05.999999999Z07:00")}
}
func makeArtifactItem(value artifacts.Artifact, baseURL *url.URL) artifactItem {
	return artifactItem{ID: value.ID.String(), Slug: value.Slug, Title: value.Title, Description: value.Description, SourceType: string(value.SourceType), SourceURL: publicURL("/source/"+value.Slug, baseURL), ArtifactURL: publicURL("/a/"+value.Slug, baseURL), Project: value.Project, RepoFullName: value.RepoFullName, Branch: value.Branch, CommitSHA: value.CommitSHA, Dirty: value.Dirty, Agent: value.Agent, Generator: value.Generator, CreatedAt: value.CreatedAt.Format("2006-01-02T15:04:05.999999999Z07:00"), UpdatedAt: value.UpdatedAt.Format("2006-01-02T15:04:05.999999999Z07:00")}
}
func publicURL(path string, baseURL *url.URL) string {
	if baseURL == nil {
		return path
	}
	reference, _ := url.Parse(path)
	return baseURL.ResolveReference(reference).String()
}
func optionalString(value string) *string { return &value }
func parseDirty(value string) bool        { return value == "1" || value == "true" || value == "yes" }
