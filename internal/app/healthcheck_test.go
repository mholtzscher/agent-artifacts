package app

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCheckHealthRequiresSuccessfulResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		response.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	if err := CheckHealth(context.Background(), server.URL); err != nil {
		t.Fatalf("CheckHealth() error = %v", err)
	}
}

func TestCheckHealthRejectsUnavailableResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		response.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer server.Close()

	if err := CheckHealth(context.Background(), server.URL); err == nil {
		t.Fatal("CheckHealth() error = nil, want unavailable error")
	}
}
