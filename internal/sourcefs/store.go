package sourcefs

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/google/uuid"
	"github.com/mholtzscher/agent-artifacts/internal/artifact"
)

type Info struct {
	SHA256    string
	SizeBytes int64
}

type Store struct {
	artifactsDir string
}

func New(dataDir string) (*Store, error) {
	artifactsDir := filepath.Join(dataDir, "artifacts")
	if err := os.MkdirAll(artifactsDir, 0o750); err != nil {
		return nil, fmt.Errorf("create artifacts directory: %w", err)
	}
	probe, err := os.CreateTemp(artifactsDir, ".write-probe-*")
	if err != nil {
		return nil, fmt.Errorf("verify artifacts directory is writable: %w", err)
	}
	probeName := probe.Name()
	if err := probe.Close(); err != nil {
		_ = os.Remove(probeName)
		return nil, fmt.Errorf("close artifacts directory probe: %w", err)
	}
	if err := os.Remove(probeName); err != nil {
		return nil, fmt.Errorf("remove artifacts directory probe: %w", err)
	}
	return &Store{artifactsDir: artifactsDir}, nil
}

func (s *Store) Write(ctx context.Context, id uuid.UUID, sourceType artifact.SourceType, source io.Reader) (Info, error) {
	extension, err := extensionFor(sourceType)
	if err != nil {
		return Info{}, err
	}

	dir := filepath.Join(s.artifactsDir, id.String())
	if err := os.Mkdir(dir, 0o750); err != nil && !os.IsExist(err) {
		return Info{}, fmt.Errorf("create artifact directory: %w", err)
	}

	temporary, err := os.CreateTemp(dir, ".source-*")
	if err != nil {
		return Info{}, fmt.Errorf("create temporary source: %w", err)
	}
	temporaryName := temporary.Name()
	defer os.Remove(temporaryName)

	if err := temporary.Chmod(0o640); err != nil {
		temporary.Close()
		return Info{}, fmt.Errorf("set source permissions: %w", err)
	}

	hash := sha256.New()
	size, copyErr := io.Copy(io.MultiWriter(temporary, hash), contextReader{ctx: ctx, reader: source})
	if copyErr == nil {
		copyErr = temporary.Sync()
	}
	closeErr := temporary.Close()
	if copyErr != nil {
		return Info{}, fmt.Errorf("write source: %w", copyErr)
	}
	if closeErr != nil {
		return Info{}, fmt.Errorf("close source: %w", closeErr)
	}

	destination := filepath.Join(dir, "source"+extension)
	if err := os.Link(temporaryName, destination); err != nil {
		return Info{}, fmt.Errorf("commit source: %w", err)
	}
	if err := syncDirectory(dir); err != nil {
		_ = os.Remove(destination)
		return Info{}, fmt.Errorf("sync artifact directory: %w", err)
	}

	return Info{SHA256: hex.EncodeToString(hash.Sum(nil)), SizeBytes: size}, nil
}

func (s *Store) Read(_ context.Context, id uuid.UUID, sourceType artifact.SourceType) (io.ReadCloser, error) {
	path, err := s.pathFor(id, sourceType)
	if err != nil {
		return nil, err
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open source: %w", err)
	}
	return file, nil
}

func (s *Store) Remove(id uuid.UUID, sourceType artifact.SourceType) error {
	path, err := s.pathFor(id, sourceType)
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove source: %w", err)
	}
	if err := os.Remove(filepath.Dir(path)); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove artifact directory: %w", err)
	}
	return nil
}

func (s *Store) pathFor(id uuid.UUID, sourceType artifact.SourceType) (string, error) {
	extension, err := extensionFor(sourceType)
	if err != nil {
		return "", err
	}
	return filepath.Join(s.artifactsDir, id.String(), "source"+extension), nil
}

func extensionFor(sourceType artifact.SourceType) (string, error) {
	switch sourceType {
	case artifact.SourceTypeMarkdown:
		return ".md", nil
	case artifact.SourceTypeHTML:
		return ".html", nil
	default:
		return "", fmt.Errorf("unsupported source type %q", sourceType)
	}
}

func syncDirectory(path string) error {
	directory, err := os.Open(path)
	if err != nil {
		return err
	}
	defer directory.Close()
	return directory.Sync()
}

type contextReader struct {
	ctx    context.Context
	reader io.Reader
}

func (r contextReader) Read(buffer []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.reader.Read(buffer)
}
