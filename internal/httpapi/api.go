package httpapi

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/url"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humachi"
	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/mholtzscher/agent-artifacts/internal/access"
	"github.com/mholtzscher/agent-artifacts/internal/artifact"
	"github.com/mholtzscher/agent-artifacts/internal/publication"
)

type Dependencies struct {
	Publisher      *publication.Publisher
	Artifacts      *access.Reader
	WriteKey       string
	PublicBaseURL  *url.URL
	MaxUploadBytes int64
	Ready          func(context.Context) bool
	Logger         *slog.Logger
}

type publishForm struct {
	File        huma.FormFile `form:"file" contentType:"text/markdown,text/html,application/octet-stream" required:"true"`
	Title       string        `form:"title" required:"false"`
	Description string        `form:"description" required:"false"`
	Project     string        `form:"project" required:"false"`
	Repo        string        `form:"repo" required:"false"`
	Branch      string        `form:"branch" required:"false"`
	CommitSHA   string        `form:"commit_sha" required:"false"`
	Dirty       string        `form:"dirty" required:"false"`
	Agent       string        `form:"agent" required:"false"`
	Generator   string        `form:"generator" required:"false"`
}

type publishInput struct {
	WriteKey string `header:"X-Write-Key" required:"true" doc:"Shared publication secret"`
	RawBody  huma.MultipartFormFiles[publishForm]
}

type publishOutput struct {
	Body publishResponse
}

type publishResponse struct {
	ID          string `json:"id" format:"uuid"`
	Slug        string `json:"slug"`
	Title       string `json:"title"`
	SourceType  string `json:"sourceType" enum:"markdown,html"`
	ArtifactURL string `json:"artifactUrl"`
	SourceURL   string `json:"sourceUrl"`
	CreatedAt   string `json:"createdAt" format:"date-time"`
}

type feedOutput struct {
	Body feedResponse
}

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

func New(dependencies Dependencies) http.Handler {
	if dependencies.Logger == nil {
		dependencies.Logger = slog.Default()
	}
	if dependencies.Ready == nil {
		dependencies.Ready = func(context.Context) bool { return true }
	}

	router := chi.NewRouter()
	router.Use(chimiddleware.RequestID)
	router.Use(requestLog(dependencies.Logger))
	router.Use(chimiddleware.Recoverer)
	router.Use(publishGuard(dependencies.WriteKey, dependencies.MaxUploadBytes))

	registerBrowserRoutes(router, dependencies)

	config := huma.DefaultConfig("Agent Artifacts API", "1.0.0")
	api := humachi.New(router, config)
	registerAPI(api, dependencies)
	return router
}

func registerAPI(api huma.API, dependencies Dependencies) {
	huma.Register(api, huma.Operation{
		OperationID:   "publish-artifact",
		Method:        http.MethodPost,
		Path:          "/api/v1/artifacts",
		Summary:       "Publish an artifact",
		DefaultStatus: http.StatusCreated,
		MaxBodyBytes:  dependencies.MaxUploadBytes,
		Errors:        []int{400, 401, 403, 409, 413, 415, 422, 500},
	}, func(ctx context.Context, input *publishInput) (*publishOutput, error) {
		if input.RawBody.Form != nil {
			defer input.RawBody.Form.RemoveAll()
		}
		form := input.RawBody.Data()
		defer form.File.Close()

		value, err := dependencies.Publisher.Publish(ctx, publication.Input{
			Source:         form.File,
			SourceFilename: form.File.Filename,
			ContentType:    form.File.ContentType,
			Title:          form.Title,
			Description:    optionalString(form.Description),
			Project:        optionalString(form.Project),
			RepoFullName:   optionalString(form.Repo),
			Branch:         optionalString(form.Branch),
			CommitSHA:      optionalString(form.CommitSHA),
			Dirty:          parseDirty(form.Dirty),
			Agent:          optionalString(form.Agent),
			Generator:      optionalString(form.Generator),
		})
		if err != nil {
			switch {
			case errors.Is(err, publication.ErrUnsupportedSourceType):
				return nil, huma.Error415UnsupportedMediaType("Unsupported source type")
			case errors.Is(err, publication.ErrSlugGeneration):
				return nil, huma.Error409Conflict("Could not generate a unique slug")
			default:
				dependencies.Logger.ErrorContext(ctx, "artifact publication failed", "error", err)
				return nil, huma.Error500InternalServerError("Internal server error")
			}
		}
		return &publishOutput{Body: makePublishResponse(value, dependencies.PublicBaseURL)}, nil
	})

	huma.Get(api, "/api/v1/artifacts", func(ctx context.Context, _ *struct{}) (*feedOutput, error) {
		values, err := dependencies.Artifacts.ListRecent(ctx, 50)
		if err != nil {
			dependencies.Logger.ErrorContext(ctx, "list recent artifacts failed", "error", err)
			return nil, huma.Error500InternalServerError("Internal server error")
		}
		items := make([]artifactItem, 0, len(values))
		for _, value := range values {
			items = append(items, makeArtifactItem(value, dependencies.PublicBaseURL))
		}
		return &feedOutput{Body: feedResponse{Artifacts: items}}, nil
	})
}

func makePublishResponse(value artifact.Artifact, baseURL *url.URL) publishResponse {
	return publishResponse{
		ID:          value.ID.String(),
		Slug:        value.Slug,
		Title:       value.Title,
		SourceType:  string(value.SourceType),
		ArtifactURL: publicURL("/a/"+value.Slug, baseURL),
		SourceURL:   publicURL("/source/"+value.Slug, baseURL),
		CreatedAt:   value.CreatedAt.Format("2006-01-02T15:04:05.999999999Z07:00"),
	}
}

func makeArtifactItem(value artifact.Artifact, baseURL *url.URL) artifactItem {
	return artifactItem{
		ID:           value.ID.String(),
		Slug:         value.Slug,
		Title:        value.Title,
		Description:  value.Description,
		SourceType:   string(value.SourceType),
		SourceURL:    publicURL("/source/"+value.Slug, baseURL),
		ArtifactURL:  publicURL("/a/"+value.Slug, baseURL),
		Project:      value.Project,
		RepoFullName: value.RepoFullName,
		Branch:       value.Branch,
		CommitSHA:    value.CommitSHA,
		Dirty:        value.Dirty,
		Agent:        value.Agent,
		Generator:    value.Generator,
		CreatedAt:    value.CreatedAt.Format("2006-01-02T15:04:05.999999999Z07:00"),
		UpdatedAt:    value.UpdatedAt.Format("2006-01-02T15:04:05.999999999Z07:00"),
	}
}

func publicURL(path string, baseURL *url.URL) string {
	if baseURL == nil {
		return path
	}
	reference, _ := url.Parse(path)
	return baseURL.ResolveReference(reference).String()
}

func optionalString(value string) *string {
	return &value
}

func parseDirty(value string) bool {
	return value == "1" || value == "true" || value == "yes"
}
