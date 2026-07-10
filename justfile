generate:
    go tool sqlc generate

test:
    go test ./...

vet:
    go vet ./...

check: generate test vet

build:
    go build ./cmd/agent-artifacts

smoke:
    ./scripts/smoke.sh
