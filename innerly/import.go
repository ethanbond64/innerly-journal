package main

type ImportService struct {
}

// ImportFiles — GET /api/import/files
// Lists the .zip archives sitting in ~/.innerly/imports.
func (i *ImportService) ImportFiles() ([]string, error)

// StartImport — POST /api/import
// path is relative to ~/.innerly/imports; passcode unlocks locked entries in the archive.
func (i *ImportService) StartImport(path string, passcode string) (map[string]any, error)

// ImportStatus — GET /api/import/status
func (i *ImportService) ImportStatus() (map[string]any, error)

// CancelImport — DELETE /api/import
func (i *ImportService) CancelImport() error

// importWorker runs the extraction and entry insertion in the background.
func (i *ImportService) importWorker(extractPath string, userID int, passcode string, aesKey string)