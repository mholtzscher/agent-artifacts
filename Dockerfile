# syntax=docker/dockerfile:1.7
FROM --platform=$BUILDPLATFORM golang:1.25.7-alpine AS build
ARG TARGETOS
ARG TARGETARCH
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath -ldflags="-s -w" -o /out/agent-artifacts ./cmd/agent-artifacts
RUN mkdir -p /out/data && touch /out/data/.keep && chown -R 65532:65532 /out/data

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=build /out/agent-artifacts /app/agent-artifacts
COPY --chown=65532:65532 --from=build /out/data /data
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
    CMD ["/app/agent-artifacts", "healthcheck"]
ENTRYPOINT ["/app/agent-artifacts"]
