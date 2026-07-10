format:
    go fmt ./...   

generate:
    go tool sqlc generate

generate-check: generate
    git diff --exit-code -- internal/postgres

test:
    go test ./...

vet:
    go vet ./...

docker:
    docker build -q .

check: generate test vet

build:
    go build ./cmd/agent-artifacts

smoke:
    ./scripts/smoke.sh
