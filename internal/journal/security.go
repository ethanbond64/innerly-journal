package journal

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/fernet/fernet-go"
	"golang.org/x/crypto/pbkdf2"
	"golang.org/x/crypto/scrypt"
)

type cachedKey struct {
	Key     []byte
	Expires time.Time
}

var emailPattern = regexp.MustCompile(`^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,7}$`)

func validatePassword(password string) bool { return utf8.RuneCountInString(password) >= 8 }
func encryptPassword(password string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	s := hex.EncodeToString(salt)
	key := pbkdf2.Key([]byte(password), []byte(s), 1000000, 32, sha256.New)
	return "pbkdf2:sha256:1000000$" + s + "$" + hex.EncodeToString(key), nil
}
func authenticated(u User, password string) bool {
	parts := strings.Split(u.PasswordHash, "$")
	if len(parts) != 3 || password == "" {
		return false
	}
	method := strings.Split(parts[0], ":")
	var key []byte
	switch method[0] {
	case "pbkdf2":
		if len(method) != 3 || method[1] != "sha256" {
			return false
		}
		n, err := strconv.Atoi(method[2])
		if err != nil || n < 1 || n > 10000000 {
			return false
		}
		key = pbkdf2.Key([]byte(password), []byte(parts[1]), n, 32, sha256.New)
	case "scrypt":
		if len(method) != 4 {
			return false
		}
		n, e1 := strconv.Atoi(method[1])
		r, e2 := strconv.Atoi(method[2])
		p, e3 := strconv.Atoi(method[3])
		if e1 != nil || e2 != nil || e3 != nil || n < 2 || n > 65536 || r < 1 || r > 16 || p < 1 || p > 16 {
			return false
		}
		var err error
		key, err = scrypt.Key([]byte(password), []byte(parts[1]), n, r, p, 64)
		if err != nil {
			return false
		}
	default:
		return false
	}
	stored, err := hex.DecodeString(parts[2])
	return err == nil && subtle.ConstantTimeCompare(key, stored) == 1
}
func deriveScryptKey(u User, password string) ([]byte, error) {
	return scrypt.Key([]byte(password), []byte("innerly-entry-lock"+u.Email), 16384, 8, 1, 32)
}
func parseLockTTL(settings map[string]any) (time.Duration, error) {
	value, ok := settings["lock_ttl_value"].(float64)
	if !ok {
		if n, yes := settings["lock_ttl_value"].(int); yes {
			value = float64(n)
			ok = true
		}
	}
	units := map[string]time.Duration{"seconds": time.Second, "minutes": time.Minute, "hours": time.Hour, "days": 24 * time.Hour}
	unit := units[text(settings["lock_ttl_unit"])]
	if !ok || value < 1 || value != float64(int64(value)) || unit == 0 || value > float64(7*24*time.Hour/unit) {
		return 0, failure("invalid-input", "Invalid lock timeout.")
	}
	return time.Duration(value) * unit, nil
}
func getLockTTL(u User) time.Duration {
	ttl, err := parseLockTTL(u.Settings)
	if err != nil {
		return time.Hour
	}
	return ttl
}
func (a *App) getScryptKey(u User, password string, readCache bool) ([]byte, error) {
	if cached, ok := a.keys[u.ID]; readCache && ok && a.now().Before(cached.Expires) {
		return cached.Key, nil
	}
	delete(a.keys, u.ID)
	if !authenticated(u, password) {
		return nil, failure("lock-auth-expired", "Please enter your password.")
	}
	key, err := deriveScryptKey(u, password)
	if err == nil {
		a.keys[u.ID] = cachedKey{key, a.now().Add(getLockTTL(u))}
	}
	return key, err
}
func lockText(key []byte, value string) (string, error) {
	if len(key) != 32 {
		return "", fmt.Errorf("invalid key")
	}
	var k fernet.Key
	copy(k[:], key)
	token, err := fernet.EncryptAndSign([]byte(value), &k)
	return "b'" + string(token) + "'", err
}
func unlockTextAtVersion(u User, data map[string]any, key []byte) (string, error) {
	if number(data["lock_version"]) == 0 {
		email := []rune(u.Email)
		if len(email) == 0 {
			return "", fmt.Errorf("missing email")
		}
		runes := []rune{}
		for len(runes) < 32 {
			runes = append(runes, email...)
		}
		key = []byte(string(runes[:32]))
	} else if number(data["lock_version"]) != 1 {
		return "", fmt.Errorf("unsupported encryption version")
	}
	ciphertext := text(data["text"])
	if len(key) != 32 || !strings.HasPrefix(ciphertext, "b'") || !strings.HasSuffix(ciphertext, "'") {
		return "", fmt.Errorf("invalid ciphertext")
	}
	var k fernet.Key
	copy(k[:], key)
	plain := fernet.VerifyAndDecrypt([]byte(ciphertext[2:len(ciphertext)-1]), 0, []*fernet.Key{&k})
	if plain == nil {
		return "", fmt.Errorf("could not decrypt entry")
	}
	return string(plain), nil
}
func (a *App) lockEntryData(u User, password string, data map[string]any) error {
	key, err := a.getScryptKey(u, password, true)
	if err != nil {
		return err
	}
	ciphertext, err := lockText(key, text(data["text"]))
	if err != nil {
		return err
	}
	data["text"] = ciphertext
	data["locked"] = true
	data["lock_version"] = 1
	return nil
}
