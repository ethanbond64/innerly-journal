package journal

import (
	"database/sql"
	"embed"
	"fmt"
)

//go:embed migrations/*.sql
var migrationFiles embed.FS

// Version and schema advance together; an interrupted migration leaves both unchanged.
func (a *App) applyColumnMigrations() error {
	files, err := migrationFiles.ReadDir("migrations")
	if err != nil {
		return err
	}
	tx, err := a.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var version int
	if err = tx.QueryRow("PRAGMA user_version").Scan(&version); err != nil {
		return err
	}
	if version > len(files) {
		return fmt.Errorf("journal schema version %d is newer than this application supports", version)
	}
	for i, file := range files {
		// Require contiguous, sortable versions so a missing migration fails at startup.
		expected := fmt.Sprintf("%04d_", i+1)
		if len(file.Name()) < len(expected) || file.Name()[:len(expected)] != expected {
			return fmt.Errorf("invalid migration sequence: %s", file.Name())
		}
		if i < version {
			continue
		}
		script, err := migrationFiles.ReadFile("migrations/" + file.Name())
		if err != nil {
			return err
		}
		if _, err = tx.Exec(string(script)); err != nil {
			return err
		}
		if i == 0 {
			if err = adoptLegacyTags(tx); err != nil {
				return err
			}
		}
		// The integer comes from the embedded migration sequence, never user input.
		if _, err = tx.Exec(fmt.Sprintf("PRAGMA user_version=%d", i+1)); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// SQLite cannot conditionally ADD COLUMN; only unversioned journals need this check.
func adoptLegacyTags(tx *sql.Tx) error {
	rows, err := tx.Query("PRAGMA table_info(tags)")
	if err != nil {
		return err
	}
	found := false
	for rows.Next() {
		var cid, notnull, pk int
		var name, kind string
		var def any
		if err = rows.Scan(&cid, &name, &kind, &notnull, &def, &pk); err != nil {
			rows.Close()
			return err
		}
		if name == "day_tag" {
			found = true
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	if !found {
		_, err = tx.Exec("ALTER TABLE tags ADD COLUMN day_tag BOOLEAN NOT NULL DEFAULT 0")
	}
	return err
}
