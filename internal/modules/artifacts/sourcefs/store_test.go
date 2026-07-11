package sourcefs

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/mholtzscher/agent-artifacts/internal/modules/artifacts"
)

func TestStoreWritesReadsAndRemovesImmutableSource(t *testing.T) {
	store, err := New(t.TempDir())
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	id := uuid.MustParse("62c610a1-67d9-4ea6-b9da-6b793d107b79")
	content := "# Hello\n\nWorld"
	info, err := store.Write(context.Background(), id, artifacts.SourceTypeMarkdown, strings.NewReader(content))
	if err != nil {
		t.Fatalf("Write() error = %v", err)
	}

	digest := sha256.Sum256([]byte(content))
	if info.SHA256 != hex.EncodeToString(digest[:]) {
		t.Errorf("SHA256 = %q, want %q", info.SHA256, hex.EncodeToString(digest[:]))
	}
	if info.SizeBytes != int64(len(content)) {
		t.Errorf("SizeBytes = %d, want %d", info.SizeBytes, len(content))
	}

	got, err := store.Read(context.Background(), id, artifacts.SourceTypeMarkdown)
	if err != nil {
		t.Fatalf("Read() error = %v", err)
	}
	defer got.Close()

	var output strings.Builder
	if _, err := io.Copy(&output, got); err != nil {
		t.Fatalf("reading source: %v", err)
	}
	if output.String() != content {
		t.Errorf("source = %q, want %q", output.String(), content)
	}

	if _, err := store.Write(context.Background(), id, artifacts.SourceTypeMarkdown, strings.NewReader("replacement")); err == nil {
		t.Fatal("second Write() error = nil, want immutable destination error")
	}

	if err := store.Remove(id, artifacts.SourceTypeMarkdown); err != nil {
		t.Fatalf("Remove() error = %v", err)
	}
	if _, err := store.Read(context.Background(), id, artifacts.SourceTypeMarkdown); err == nil {
		t.Fatal("Read() after Remove() error = nil, want not found")
	}
}
