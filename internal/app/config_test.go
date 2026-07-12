package app

import (
	"testing"
)

func TestLoadConfigUsesRequiredValuesAndDefaults(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/agent_artifacts?sslmode=disable")
	t.Setenv("AGENT_ARTIFACTS_WRITE_KEY", "ap_test")
	t.Setenv("DATA_DIR", "")
	t.Setenv("LISTEN_ADDR", "")
	t.Setenv("PUBLIC_BASE_URL", "")
	t.Setenv("MAX_UPLOAD_BYTES", "")

	config, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig() error = %v", err)
	}

	if config.DataDir != "/data" {
		t.Errorf("DataDir = %q, want /data", config.DataDir)
	}
	if config.ListenAddr != ":8080" {
		t.Errorf("ListenAddr = %q, want :8080", config.ListenAddr)
	}
	if config.MaxUploadBytes != 10*1024*1024 {
		t.Errorf("MaxUploadBytes = %d, want %d", config.MaxUploadBytes, 10*1024*1024)
	}
	if config.PublicBaseURL != nil {
		t.Errorf("PublicBaseURL = %v, want nil", config.PublicBaseURL)
	}
}

func TestLoadConfigRejectsMissingDatabaseURL(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	t.Setenv("AGENT_ARTIFACTS_WRITE_KEY", "ap_test")

	_, err := LoadConfig()
	if err == nil || err.Error() != "DATABASE_URL is required" {
		t.Fatalf("LoadConfig() error = %v, want DATABASE_URL is required", err)
	}
}

func TestLoadConfigRejectsInvalidPublicBaseURL(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://localhost/test")
	t.Setenv("AGENT_ARTIFACTS_WRITE_KEY", "ap_test")
	t.Setenv("PUBLIC_BASE_URL", "://not-a-url")

	_, err := LoadConfig()
	if err == nil {
		t.Fatal("LoadConfig() error = nil, want invalid PUBLIC_BASE_URL")
	}
}
