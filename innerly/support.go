package main

// Support the EntryService leans on, ported from api/security.py and
// api/processors. The pieces still marked below are the ones whose Python
// counterparts need dependencies this module does not have yet.

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

var errUnauthorized = errors.New("unauthorized")

// Locked text is the repr of a Fernet token, which always opens this way. Text
// arriving from a client that starts with it is that client handing back
// ciphertext it was never able to read.
const lockedTextPrefix = "b'gAAAA"

const (
	entryLockSalt      = "innerly-entry-lock"
	currentLockVersion = 1
)

func innerlyDirectory() string {

	home, err := os.UserHomeDir()
	if err != nil {
		return ".innerly"
	}

	return filepath.Join(home, ".innerly")
}

func userDirectory(userID int) string {
	return filepath.Join(innerlyDirectory(), "static", "user-"+strconv.Itoa(userID))
}

func publicPath(filename string) string {
	return filepath.Join("static", filename)
}

// ---- Passwords ---------------------------------------------------------

// authenticated checks a password against the werkzeug hash the Python API
// wrote, which is "pbkdf2:sha256:<iterations>$<salt>$<hex digest>".
func authenticated(user *User, password string) bool {

	if password == "" {
		return false
	}

	method, salt, digest, found := splitPasswordHash(user.PasswordHash)
	if !found || !strings.HasPrefix(method, "pbkdf2:sha256:") {
		return false
	}

	iterations, err := strconv.Atoi(strings.TrimPrefix(method, "pbkdf2:sha256:"))
	if err != nil {
		return false
	}

	expected, err := hex.DecodeString(digest)
	if err != nil {
		return false
	}

	derived, err := pbkdf2.Key(sha256.New, password, []byte(salt), iterations, len(expected))
	if err != nil {
		return false
	}

	return subtle.ConstantTimeCompare(derived, expected) == 1
}

func splitPasswordHash(hash string) (method string, salt string, digest string, found bool) {

	parts := strings.Split(hash, "$")
	if len(parts) != 3 {
		return "", "", "", false
	}

	return parts[0], parts[1], parts[2], true
}

// ---- Entry locking -----------------------------------------------------

// deriveLockKey is the entry lock key: the same user and password always
// derive the same one.
//
// NOT PORTED. The Python side uses hashlib.scrypt with n=2^14, r=8, p=1 and a
// salt of ENTRY_LOCK_SALT + user.email, which needs golang.org/x/crypto/scrypt
// — it is not in the standard library and not yet a dependency of this module.
// Every lock and unlock below fails until it is.
func deriveLockKey(user *User, password string) ([]byte, error) {

	if !authenticated(user, password) {
		return nil, errUnauthorized
	}

	return nil, errors.New("entry lock key derivation not ported: needs scrypt")
}

func isLockedText(text string) bool {
	return strings.HasPrefix(text, lockedTextPrefix)
}

// lockEntryData encrypts an entry's text in place and marks it locked.
func lockEntryData(user *User, password string, entryData map[string]any) (map[string]any, error) {

	key, err := deriveLockKey(user, password)
	if err != nil {
		return nil, err
	}

	text, _ := entryData["text"].(string)

	locked, err := lockText(key, text)
	if err != nil {
		return nil, err
	}

	copied := map[string]any{}
	for name, value := range entryData {
		copied[name] = value
	}

	copied["text"] = locked
	copied["locked"] = true
	copied["lock_version"] = currentLockVersion

	return copied, nil
}

// unlockEntryData decrypts an entry's text, at whatever lock version it was
// written at.
func unlockEntryData(user *User, password string, entryData map[string]any) (map[string]any, error) {

	key, err := deriveLockKey(user, password)
	if err != nil {
		return nil, err
	}

	version, _ := entryData["lock_version"].(float64)
	if int(version) != currentLockVersion {
		return nil, fmt.Errorf("lock version %d not supported", int(version))
	}

	locked, _ := entryData["text"].(string)

	text, err := unlockText(key, locked)
	if err != nil {
		return nil, err
	}

	copied := map[string]any{}
	for name, value := range entryData {
		copied[name] = value
	}

	copied["text"] = text

	return copied, nil
}

// lockText writes a Fernet token, wrapped in the b'...' repr the Python side
// stored it as.
func lockText(key []byte, text string) (string, error) {

	if len(key) != 32 {
		return "", errors.New("lock key must be 32 bytes")
	}

	signingKey, encryptionKey := key[:16], key[16:]

	iv := make([]byte, aes.BlockSize)
	if _, err := rand.Read(iv); err != nil {
		return "", err
	}

	block, err := aes.NewCipher(encryptionKey)
	if err != nil {
		return "", err
	}

	padded := pkcs7Pad([]byte(text), aes.BlockSize)
	ciphertext := make([]byte, len(padded))
	cipher.NewCBCEncrypter(block, iv).CryptBlocks(ciphertext, padded)

	token := []byte{0x80}
	token = binary.BigEndian.AppendUint64(token, uint64(time.Now().Unix()))
	token = append(token, iv...)
	token = append(token, ciphertext...)

	mac := hmac.New(sha256.New, signingKey)
	mac.Write(token)
	token = mac.Sum(token)

	return "b'" + base64.URLEncoding.EncodeToString(token) + "'", nil
}

// unlockText reads a token written by lockText.
func unlockText(key []byte, locked string) (string, error) {

	if len(key) != 32 {
		return "", errors.New("lock key must be 32 bytes")
	}

	signingKey, encryptionKey := key[:16], key[16:]

	token, err := base64.URLEncoding.DecodeString(strings.TrimSuffix(strings.TrimPrefix(locked, "b'"), "'"))
	if err != nil {
		return "", err
	}

	if len(token) < 1+8+aes.BlockSize+sha256.Size || token[0] != 0x80 {
		return "", errors.New("malformed locked text")
	}

	body, signature := token[:len(token)-sha256.Size], token[len(token)-sha256.Size:]

	mac := hmac.New(sha256.New, signingKey)
	mac.Write(body)

	if !hmac.Equal(mac.Sum(nil), signature) {
		return "", errors.New("locked text failed its signature check")
	}

	iv, ciphertext := body[9:9+aes.BlockSize], body[9+aes.BlockSize:]

	if len(ciphertext) == 0 || len(ciphertext)%aes.BlockSize != 0 {
		return "", errors.New("malformed locked text")
	}

	block, err := aes.NewCipher(encryptionKey)
	if err != nil {
		return "", err
	}

	padded := make([]byte, len(ciphertext))
	cipher.NewCBCDecrypter(block, iv).CryptBlocks(padded, ciphertext)

	text, err := pkcs7Unpad(padded, aes.BlockSize)
	if err != nil {
		return "", err
	}

	return string(text), nil
}

func pkcs7Pad(data []byte, size int) []byte {

	padding := size - len(data)%size

	return append(data, strings.Repeat(string(rune(padding)), padding)...)
}

func pkcs7Unpad(data []byte, size int) ([]byte, error) {

	if len(data) == 0 || len(data)%size != 0 {
		return nil, errors.New("malformed padding")
	}

	padding := int(data[len(data)-1])
	if padding == 0 || padding > size || padding > len(data) {
		return nil, errors.New("malformed padding")
	}

	return data[:len(data)-padding], nil
}

// ---- Entry processors --------------------------------------------------

// processTextEntry validates a text body into entry data and its tags.
func processTextEntry(body map[string]any) (map[string]any, []string) {

	title, _ := body["title"].(string)
	text, _ := body["text"].(string)

	return map[string]any{
		"title":      title,
		"text":       text,
		"sentiment":  sentimentOf(text),
		"word_count": countWords(text),
	}, []string{}
}

// sentimentOf scores text as positive, negative or neutral.
//
// NOT PORTED. The scoring itself is a handful of lines, but it reads the two
// ~4000 word lists in api/processors/keywords.py, which have no Go counterpart
// yet. Everything is neutral until they do.
func sentimentOf(text string) string {
	return "neutral"
}

// Magic byte signatures for image detection, which is what the file type is
// taken from rather than the name the file arrived under.
var imageSignatures = []struct {
	signature []byte
	format    string
}{
	{[]byte{0xff, 0xd8, 0xff}, "jpg"},
	{[]byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}, "png"},
	{[]byte("GIF87a"), "gif"},
	{[]byte("GIF89a"), "gif"},
}

// processFileEntry copies an upload into the user's own directory under a
// fresh name and describes it as entry data.
func processFileEntry(userID int, sourcePath string) (map[string]any, []string, error) {

	source, err := os.Open(sourcePath)
	if err != nil {
		return nil, nil, err
	}
	defer source.Close()

	header := make([]byte, 512)
	read, err := source.Read(header)
	if err != nil && err != io.EOF {
		return nil, nil, err
	}

	format := imageFormat(header[:read])
	if format == "" {
		return nil, nil, fmt.Errorf("unsupported image format for file %q", filepath.Base(sourcePath))
	}

	if _, err := source.Seek(0, io.SeekStart); err != nil {
		return nil, nil, err
	}

	name := make([]byte, 16)
	if _, err := rand.Read(name); err != nil {
		return nil, nil, err
	}

	filename := hex.EncodeToString(name) + "." + format
	directory := userDirectory(userID)

	if err := os.MkdirAll(directory, 0o755); err != nil {
		return nil, nil, err
	}

	destination, err := os.Create(filepath.Join(directory, filename))
	if err != nil {
		return nil, nil, err
	}
	defer destination.Close()

	if _, err := io.Copy(destination, source); err != nil {
		return nil, nil, err
	}

	return map[string]any{
		"original_filename": filepath.Base(sourcePath),
		"path":              publicPath(filename),
		"file_type":         format,
	}, []string{}, nil
}

func imageFormat(header []byte) string {

	for _, candidate := range imageSignatures {
		if len(header) >= len(candidate.signature) &&
			subtle.ConstantTimeCompare(header[:len(candidate.signature)], candidate.signature) == 1 {
			return candidate.format
		}
	}

	return ""
}

// processLinkEntry describes a link by what its page says about itself.
//
// NOT PORTED. api/processors/link_processor.py fetches the URL and reads its
// OpenGraph tags, which is an HTTP fetch and an HTML parse this module has no
// counterpart for yet.
func processLinkEntry(userID int, link string) (map[string]any, []string, error) {
	return nil, nil, errors.New("link entries not ported: needs the OpenGraph fetch")
}

// deleteFile removes a file entry's attachment. A missing file is not an
// error, matching the Python side, which reports it and carries on.
func deleteFile(userID int, path string) bool {

	err := os.Remove(filepath.Join(userDirectory(userID), filepath.Base(path)))

	return err == nil
}
