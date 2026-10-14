package journal

import (
	"os"
	"path/filepath"
)

type Config struct{ DataDir string }

func loadSettings(config Config) (Config, error) {
	if config.DataDir == "" {
		config.DataDir = os.Getenv("INNERLY_DATA_DIR")
	}
	if config.DataDir == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return config, err
		}
		config.DataDir = filepath.Join(home, ".innerly")
	}
	absolute, err := filepath.Abs(config.DataDir)
	if err != nil {
		return config, err
	}
	config.DataDir = absolute
	for _, dir := range []string{absolute, filepath.Join(absolute, "static"), filepath.Join(absolute, "imports")} {
		if err = os.MkdirAll(dir, 0700); err != nil {
			return config, err
		}
	}
	return config, nil
}
