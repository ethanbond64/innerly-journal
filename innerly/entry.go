package main

type EntryService struct {
}

// InsertEntry — POST /api/insert/entries
// filePath is set for media entries (the multipart upload in the HTTP API).
func (e *EntryService) InsertEntry(entry map[string]any, filePath string) (*Entry, error)

// UpdateEntry — POST /api/update/entries/<id>
// Text entries only.
func (e *EntryService) UpdateEntry(id int, changes map[string]any) (*Entry, error)

// FetchEntries — GET /api/fetch/entries
func (e *EntryService) FetchEntries(limit int, offset int, search string, tag string, date string) ([]Entry, error)

// FetchEntry — GET/POST /api/fetch/entries/<id>
// passcode is required when the entry is locked.
func (e *EntryService) FetchEntry(id int, passcode string) (*Entry, error)

// DeleteEntry — POST /api/delete/entries/<id>
func (e *EntryService) DeleteEntry(id int) error

// FetchActivity — GET /api/fetch/activity
func (e *EntryService) FetchActivity(days int, before string) (map[string]any, error)

// FetchMemories — GET /api/fetch/memories
func (e *EntryService) FetchMemories(date string) (map[string]any, error)

// FetchTags — GET /api/fetch/tags
func (e *EntryService) FetchTags(limit int, offset int, search string) ([]Tag, error)

// LockEntry — POST /api/lock/entries/<id>
// Password is optional thanks to the lock key cache.
func (e *EntryService) LockEntry(id int, password string) (*Entry, error)

// UnlockEntry — POST /api/unlock/entries/<id>
func (e *EntryService) UnlockEntry(id int, password string) (*Entry, error)

// GetFile — GET /api/static/<filename>
// Serves a media entry's attachment.
func (e *EntryService) GetFile(filename string) ([]byte, error)