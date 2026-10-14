package journal

import (
	"strings"
	"testing"
)

// BenchmarkTimelinePage measures a late page of a synthetic 10,000-entry journal.
func BenchmarkTimelinePage(b *testing.B) {
	app, err := NewApp(Config{DataDir: b.TempDir()})
	if err != nil {
		b.Fatal(err)
	}
	defer CloseApp(app)
	tx, err := app.db.Begin()
	if err != nil {
		b.Fatal(err)
	}
	defer tx.Rollback()
	if _, err = tx.Exec(`INSERT INTO users(id,email,password_hash,admin,settings,usage) VALUES(1,'bench@example.com','',0,'{}','{}')`); err != nil {
		b.Fatal(err)
	}
	stmt, err := tx.Prepare(`INSERT INTO entries(user_id,functional_datetime,entry_type,entry_data) VALUES(1,'2026-01-01 12:00:00.000000','text',?)`)
	if err != nil {
		b.Fatal(err)
	}
	data := jsonString(map[string]any{"title": "Synthetic", "text": strings.Repeat("journal text ", 200)})
	for i := 0; i < 10000; i++ {
		if _, err = stmt.Exec(data); err != nil {
			b.Fatal(err)
		}
	}
	stmt.Close()
	if err = tx.Commit(); err != nil {
		b.Fatal(err)
	}
	app.userID = 1
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		result := app.FetchEntries(Query{Limit: 30, Offset: 9000})
		if result.Error != nil {
			b.Fatal(result.Error)
		}
	}
}
