package journal

import (
	"bytes"
	"encoding/base64"
	"encoding/binary"
	"image/jpeg"
	"net/http/httptest"
	"os"
	"runtime"
	"testing"
)

func TestHEICDetection(t *testing.T) {
	box := func(brands string) []byte {
		b := append([]byte{0, 0, 0, 0, 'f', 't', 'y', 'p'}, []byte(brands)...)
		binary.BigEndian.PutUint32(b, uint32(len(b)))
		return b
	}
	for _, tc := range []struct {
		name string
		data []byte
		want string
	}{
		{"major brand", box("heic\x00\x00\x00\x00mif1"), "heic"},
		{"compatible brand", box("mif1\x00\x00\x00\x00heic"), "heic"},
		{"HEIF HEVC", box("heix\x00\x00\x00\x00mif1"), "heic"},
		{"AVIF", box("avif\x00\x00\x00\x00mif1"), ""},
		{"unrecognized brand", box("abcdheic"), ""},
		{"truncated", []byte("\x00\x00\x00\x18ftypheic"), ""},
		{"fake", []byte("not a HEIC image"), ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := validateImage(tc.data); got != tc.want {
				t.Fatalf("got %q, want %q", got, tc.want)
			}
		})
	}
}

func TestHEICUploadAndRetrieval(t *testing.T) {
	content, err := os.ReadFile("testdata/sample.heic")
	if err != nil {
		t.Fatal(err)
	}
	if validateImage(content) != "heic" {
		t.Fatal("fixture not detected as HEIC")
	}
	a := testApp(t)
	input := EntryInput{EntryType: "file", Filename: "photo.HEIC", ContentBase64: base64.StdEncoding.EncodeToString(content)}
	if runtime.GOOS != "darwin" {
		hasCode(t, a.InsertEntry(input), "invalid-input")
		return
	}
	e := entryResult(t, a.InsertEntry(input))
	if e.EntryData["file_type"] != "jpg" || e.EntryData["title"] != "photo.HEIC" {
		t.Fatal(e.EntryData)
	}
	r := httptest.NewRecorder()
	MediaHandler(a).ServeHTTP(r, httptest.NewRequest("GET", text(e.EntryData["path"]), nil))
	if r.Code != 200 || r.Header().Get("Content-Type") != "image/jpeg" {
		t.Fatal(r)
	}
	img, err := jpeg.Decode(bytes.NewReader(r.Body.Bytes()))
	if err != nil {
		t.Fatal(err)
	}
	if img.Bounds().Dx() != 8 || img.Bounds().Dy() != 8 {
		t.Fatal(img.Bounds())
	}
	// A plausible header alone must not be stored as an image.
	input.ContentBase64 = base64.StdEncoding.EncodeToString(content[:28])
	hasCode(t, a.InsertEntry(input), "invalid-input")
}
