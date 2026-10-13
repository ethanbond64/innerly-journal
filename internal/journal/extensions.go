package journal

import (
	"database/sql"
	"net/url"
	"path/filepath"

	_ "modernc.org/sqlite"
)

func openDatabase(config Config) (*sql.DB, error) {
	// Immediate write transactions serialize migration/rekey work across windows.
	location := url.URL{Scheme: "file", Path: filepath.ToSlash(filepath.Join(config.DataDir, "database.db"))}
	db, err := sql.Open("sqlite", location.String()+"?_txlock=immediate")
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
