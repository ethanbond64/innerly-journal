package journal

type EntryInput struct {
	EntryType          string         `json:"entry_type"`
	EntryData          map[string]any `json:"entry_data"`
	FunctionalDatetime string         `json:"functional_datetime"`
	Locked             *bool          `json:"locked"`
	Password           string         `json:"password"`
	Filename           string         `json:"filename"`
	ContentBase64      string         `json:"content_base64"`
	Tags               []string       `json:"tags"`
}
