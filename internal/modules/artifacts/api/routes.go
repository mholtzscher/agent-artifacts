package api

import (
	"context"
	"log/slog"
	"net/url"

	"github.com/danielgtaylor/huma/v2"
	"github.com/mholtzscher/agent-artifacts/internal/modules/artifacts"
)

type Options struct {
	WriteKey       string
	PublicBaseURL  *url.URL
	MaxUploadBytes int64
	Logger         *slog.Logger
}

type Handler struct {
	service *artifacts.Service
	options Options
}

func Register(api huma.API, service *artifacts.Service, options Options) {
	if options.Logger == nil {
		options.Logger = slog.Default()
	}
	h := &Handler{service: service, options: options}
	group := huma.NewGroup(api, "/api/v1/artifacts")
	group.UseMiddleware(publishGuard(options.WriteKey, options.MaxUploadBytes))
	huma.Register(group, huma.Operation{OperationID: "publish-artifact", Method: "POST", Path: "", Summary: "Publish an artifact", DefaultStatus: 201, MaxBodyBytes: options.MaxUploadBytes, Errors: []int{400, 401, 403, 409, 413, 415, 422, 500}}, h.Publish)
	huma.Get(group, "", h.ListRecent)
}

func (h *Handler) Publish(ctx context.Context, input *publishInput) (*publishOutput, error) {
	if input.RawBody.Form != nil {
		defer input.RawBody.Form.RemoveAll()
	}
	form := input.RawBody.Data()
	defer form.File.Close()
	if form.File.Size > h.options.MaxUploadBytes {
		return nil, huma.Error413RequestEntityTooLarge("Request body is too large")
	}
	value, err := h.service.Publish(ctx, artifacts.PublishInput{Source: form.File, SourceFilename: form.File.Filename, ContentType: form.File.ContentType, Title: form.Title, Description: optionalString(form.Description), Project: optionalString(form.Project), RepoFullName: optionalString(form.Repo), Branch: optionalString(form.Branch), CommitSHA: optionalString(form.CommitSHA), Dirty: parseDirty(form.Dirty), Agent: optionalString(form.Agent), Generator: optionalString(form.Generator)})
	if err != nil {
		return nil, h.mapError(ctx, "artifact publication failed", err)
	}
	return &publishOutput{Body: makePublishResponse(value, h.options.PublicBaseURL)}, nil
}
func (h *Handler) ListRecent(ctx context.Context, _ *struct{}) (*feedOutput, error) {
	values, err := h.service.ListRecent(ctx, 50)
	if err != nil {
		return nil, h.mapError(ctx, "list recent artifacts failed", err)
	}
	items := make([]artifactItem, 0, len(values))
	for _, value := range values {
		items = append(items, makeArtifactItem(value, h.options.PublicBaseURL))
	}
	return &feedOutput{Body: feedResponse{Artifacts: items}}, nil
}
