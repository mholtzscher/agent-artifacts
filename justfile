default:
    @just --list

format:
    go fmt ./...   

generate:
    go tool sqlc generate

generate-check: generate
    git diff --exit-code -- internal/platform/db/sqlc

test:
    go test ./...

vet:
    go vet ./...

docker:
    docker build -q -f deployments/Dockerfile .

compose-up:
    docker compose -f deployments/compose.yaml up --build -d

check: generate test vet

build:
    go build ./cmd/agent-artifacts

smoke:
    ./scripts/smoke.sh
