package journal

import (
	"database/sql"
	_ "modernc.org/sqlite"
	"path/filepath"
)

func openDatabase(config Config) (*sql.DB, error) {
	db, err := sql.Open("sqlite", filepath.Join(config.DataDir, "database.db"))
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	if _, err = db.Exec("PRAGMA busy_timeout=10000"); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}
