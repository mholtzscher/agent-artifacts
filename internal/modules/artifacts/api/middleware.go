package api

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
)

func publishGuard(writeKey string, _ int64) func(huma.Context, func(huma.Context)) {
	return func(ctx huma.Context, next func(huma.Context)) {
		if ctx.Method() != http.MethodPost {
			next(ctx)
			return
		}
		provided := ctx.Header("X-Write-Key")
		if provided == "" {
			writeProblem(ctx, http.StatusUnauthorized, "Missing write key")
			return
		}
		providedDigest := sha256.Sum256([]byte(provided))
		configuredDigest := sha256.Sum256([]byte(writeKey))
		if subtle.ConstantTimeCompare(providedDigest[:], configuredDigest[:]) != 1 {
			writeProblem(ctx, http.StatusForbidden, "Invalid write key")
			return
		}
		next(ctx)
	}
}

func writeProblem(ctx huma.Context, status int, detail string) {
	ctx.SetHeader("Content-Type", "application/problem+json")
	ctx.SetStatus(status)
	_ = json.NewEncoder(ctx.BodyWriter()).Encode(map[string]any{
		"type": "about:blank", "title": http.StatusText(status), "status": status, "detail": detail,
	})
}
