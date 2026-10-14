package journal

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

func validateImage(content []byte) string {
	switch {
	case bytes.HasPrefix(content, []byte{0xff, 0xd8, 0xff}):
		return "jpg"
	case bytes.HasPrefix(content, []byte("\x89PNG\r\n\x1a\n")):
		return "png"
	case bytes.HasPrefix(content, []byte("GIF87a")), bytes.HasPrefix(content, []byte("GIF89a")):
		return "gif"
	default:
		return ""
	}
}
func (a *App) getUserDirectory(id int64) string {
	return filepath.Join(a.config.DataDir, "static", fmt.Sprintf("user-%d", id))
}
func (a *App) processFileEntry(id int64, filename string, content []byte) (map[string]any, error) {
	extension := validateImage(content)
	if extension == "" || len(content) > maxResponseBytes {
		return nil, failure("invalid-input", "Unsupported image or image too large.")
	}
	if err := os.MkdirAll(a.getUserDirectory(id), 0700); err != nil {
		return nil, err
	}
	random := make([]byte, 16)
	if _, err := rand.Read(random); err != nil {
		return nil, err
	}
	name := hex.EncodeToString(random) + "." + extension
	if err := os.WriteFile(filepath.Join(a.getUserDirectory(id), name), content, 0600); err != nil {
		return nil, err
	}
	filename = filepath.Base(strings.ReplaceAll(filename, "\\", "/"))
	return map[string]any{"title": filename, "path": "static/" + name, "file_type": extension}, nil
}

func MediaHandler(a *App) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		name := strings.TrimPrefix(r.URL.Path, "/media/")
		if !strings.HasPrefix(r.URL.Path, "/media/") || name == "" || strings.ContainsAny(name, "/\\") || name == "." || name == ".." {
			http.NotFound(w, r)
			return
		}
		a.mu.Lock()
		defer a.mu.Unlock()
		if a.closed || a.userID == 0 {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		path := filepath.Join(a.getUserDirectory(a.userID), name)
		info, err := os.Lstat(path)
		if err != nil || !info.Mode().IsRegular() {
			http.NotFound(w, r)
			return
		}
		http.ServeFile(w, r, path)
	})
}
