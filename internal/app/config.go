package app

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
)

const defaultMaxUploadBytes int64 = 10 * 1024 * 1024

type Config struct {
	DatabaseURL    string
	WriteKey       string
	DataDir        string
	ListenAddr     string
	PublicBaseURL  *url.URL
	MaxUploadBytes int64
}

func LoadConfig() (Config, error) {
	config := Config{
		DatabaseURL:    strings.TrimSpace(os.Getenv("DATABASE_URL")),
		WriteKey:       os.Getenv("AGENT_ARTIFACTS_WRITE_KEY"),
		DataDir:        valueOrDefault("DATA_DIR", "/data"),
		ListenAddr:     valueOrDefault("LISTEN_ADDR", ":8080"),
		MaxUploadBytes: defaultMaxUploadBytes,
	}

	if config.DatabaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required")
	}
	if config.WriteKey == "" {
		return Config{}, fmt.Errorf("AGENT_ARTIFACTS_WRITE_KEY is required")
	}

	if raw := strings.TrimSpace(os.Getenv("PUBLIC_BASE_URL")); raw != "" {
		parsed, err := url.Parse(raw)
		if err != nil || parsed.Scheme == "" || parsed.Host == "" {
			return Config{}, fmt.Errorf("PUBLIC_BASE_URL must be an absolute URL")
		}
		config.PublicBaseURL = parsed
	}

	if raw := strings.TrimSpace(os.Getenv("MAX_UPLOAD_BYTES")); raw != "" {
		value, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || value <= 0 {
			return Config{}, fmt.Errorf("MAX_UPLOAD_BYTES must be a positive integer")
		}
		config.MaxUploadBytes = value
	}

	return config, nil
}

func valueOrDefault(name, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}
