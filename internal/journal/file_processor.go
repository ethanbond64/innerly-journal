package journal

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"time"
)

func validateImage(content []byte) string {
	switch {
	case bytes.HasPrefix(content, []byte{0xff, 0xd8, 0xff}):
		return "jpg"
	case bytes.HasPrefix(content, []byte("\x89PNG\r\n\x1a\n")):
		return "png"
	case bytes.HasPrefix(content, []byte("GIF87a")), bytes.HasPrefix(content, []byte("GIF89a")):
		return "gif"
	case len(content) >= 16 && string(content[4:8]) == "ftyp" &&
		slices.Contains([]string{"heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"}, string(content[8:12])):
		return "heic"
	default:
		return ""
	}
}

// Use macOS's built-in converter so HEIC uploads display in any webview.
func convertHEIC(content []byte) ([]byte, error) {
	dir, err := os.MkdirTemp("", "innerly-heic-*")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(dir)
	input, output := filepath.Join(dir, "input.heic"), filepath.Join(dir, "output.jpg")
	if err := os.WriteFile(input, content, 0600); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := exec.CommandContext(ctx, "/usr/bin/sips", "-s", "format", "jpeg", "-s", "formatOptions", "90", input, "--out", output).Run(); err != nil {
		return nil, failure("invalid-input", "Unable to read this HEIC image. Please try a JPEG or PNG version.")
	}
	converted, err := os.ReadFile(output)
	if err != nil || len(converted) > maxResponseBytes || validateImage(converted) != "jpg" {
		return nil, failure("invalid-input", "Converted image is invalid or too large.")
	}
	return converted, nil
}

func (a *App) getUserDirectory(id int64) string {
	return filepath.Join(a.config.DataDir, "static", fmt.Sprintf("user-%d", id))
}
func (a *App) processFileEntry(id int64, filename string, content []byte) (map[string]any, error) {
	extension := validateImage(content)
	if extension == "" || len(content) > maxResponseBytes {
		return nil, failure("invalid-input", "Unsupported image or image too large.")
	}
	if extension == "heic" {
		converted, err := convertHEIC(content)
		if err != nil {
			return nil, err
		}
		content, extension = converted, "jpg"
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
