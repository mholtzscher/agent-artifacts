package api

import (
	"context"
	"errors"
	"github.com/danielgtaylor/huma/v2"
	"github.com/mholtzscher/agent-artifacts/internal/modules/artifacts"
)

func (h *Handler) mapError(ctx context.Context, message string, err error) error {
	switch {
	case errors.Is(err, artifacts.ErrUnsupportedSourceType):
		return huma.Error415UnsupportedMediaType("Unsupported source type")
	case errors.Is(err, artifacts.ErrSlugGeneration):
		return huma.Error409Conflict("Could not generate a unique slug")
	default:
		h.options.Logger.ErrorContext(ctx, message, "error", err)
		return huma.Error500InternalServerError("Internal server error")
	}
}
