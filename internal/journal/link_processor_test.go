package journal

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"sync"
	"testing"
)

type networkFixture struct {
	mu        sync.Mutex
	addresses []string
}

func networkApp(t *testing.T, handler http.HandlerFunc, lookup lookupFunc) (*App, *networkFixture) {
	t.Helper()
	a := testApp(t)
	server := httptest.NewTLSServer(handler)
	t.Cleanup(server.Close)
	roots := x509.NewCertPool()
	roots.AddCert(server.Certificate())
	transport := a.client.Transport.(*http.Transport)
	transport.TLSClientConfig = &tls.Config{RootCAs: roots, MinVersion: tls.VersionTLS12}
	if lookup == nil {
		lookup = func(context.Context, string) ([]netip.Addr, error) {
			return []netip.Addr{netip.MustParseAddr("93.184.216.34")}, nil
		}
	}
	f := &networkFixture{}
	dialer := &net.Dialer{}
	transport.DialContext = func(ctx context.Context, network, address string) (net.Conn, error) {
		return connectPublic(ctx, address, lookup, func(ctx context.Context, network, address string) (net.Conn, error) {
			f.mu.Lock()
			f.addresses = append(f.addresses, address)
			f.mu.Unlock()
			return dialer.DialContext(ctx, network, server.Listener.Addr().String())
		})
	}
	return a, f
}
func link(a *App, value string) Result {
	return a.InsertEntry(EntryInput{EntryType: "link", EntryData: map[string]any{"link": value}})
}

// TestLinkPreviewAndNetworkFailure verifies a real TLS preview fetch and a failed page without partial journal insertion.
func TestLinkPreviewAndNetworkFailure(t *testing.T) {
	a, _ := networkApp(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/page":
			io.WriteString(w, `<meta property="og:title" content="A &amp; B"><meta property="og:image" content="/image.png">`)
		case "/image.png":
			w.Write(pngBytes)
		default:
			http.Error(w, "unavailable", 503)
		}
	}, nil)
	e := entryResult(t, link(a, "https://example.com/page"))
	if e.EntryData["title"] != "A & B" || e.EntryData["original_path"] != "https://example.com/image.png" {
		t.Fatal(e)
	}
	r := httptest.NewRecorder()
	MediaHandler(a).ServeHTTP(r, httptest.NewRequest("GET", text(e.EntryData["path"]), nil))
	if r.Body.String() != string(pngBytes) {
		t.Fatal("image changed")
	}
	hasCode(t, link(a, "https://example.com/fail"), "invalid-input")
	if len(decoded[[]Entry](t, a.FetchEntries(Query{}))) != 1 {
		t.Fatal("partial insert")
	}
}

// TestLinkSecurityBlocksUnsafeDestinations rejects unsafe URLs and all non-public DNS answers before dialing.
func TestLinkSecurityBlocksUnsafeDestinations(t *testing.T) {
	a := testApp(t)
	for _, value := range []string{"http://example.com/", "file:///etc/passwd", "ftp://example.com", "https://", "https://user:pass@example.com", "https://example.com:bad", "https://example.com/\nheader", "https://[::1%25lo0]/"} {
		hasCode(t, link(a, value), "invalid-input")
	}
	for _, ip := range []string{"127.0.0.1", "10.0.0.1", "169.254.169.254", "192.168.1.1", "172.16.0.1", "0.0.0.0", "224.0.0.1", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "100.64.0.1", "2001:db8::1"} {
		for _, mixed := range []bool{false, true} {
			addresses := []netip.Addr{netip.MustParseAddr(ip)}
			if mixed {
				addresses = append(addresses, netip.MustParseAddr("93.184.216.34"))
			}
			a.client.Transport.(*http.Transport).DialContext = func(ctx context.Context, network, address string) (net.Conn, error) {
				return connectPublic(ctx, address, func(context.Context, string) ([]netip.Addr, error) { return addresses, nil }, func(context.Context, string, string) (net.Conn, error) {
					t.Error("blocked destination dialed")
					return nil, fmt.Errorf("blocked")
				})
			}
			hasCode(t, link(a, "https://example.com/"), "invalid-input")
		}
	}
	if len(decoded[[]Entry](t, a.FetchEntries(Query{}))) != 0 {
		t.Fatal("unsafe link saved")
	}
}

// TestLinkRedirectsPinPublicAddresses preserves HTTPS, original hostnames, and relative preview resolution without ambient proxies.
func TestLinkRedirectsPinPublicAddresses(t *testing.T) {
	t.Setenv("HTTPS_PROXY", "http://127.0.0.1:9999")
	a, f := networkApp(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Host != "example.com" {
			t.Error(r.Host)
		}
		switch r.URL.Path {
		case "/start":
			http.Redirect(w, r, "/folder/page", 302)
		case "/folder/page":
			io.WriteString(w, `<meta property="og:image" content="../image.png">`)
		case "/image.png":
			w.Write(pngBytes)
		default:
			http.NotFound(w, r)
		}
	}, nil)
	e := entryResult(t, link(a, "https://example.com/start"))
	if e.EntryData["original_path"] != "https://example.com/image.png" {
		t.Fatal(e)
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.addresses) != 3 {
		t.Fatal(f.addresses)
	}
	for _, address := range f.addresses {
		if address != "93.184.216.34:443" {
			t.Fatal(address)
		}
	}
}

// TestLinkRedirectToPrivateHostIsBlocked rejects internal destinations, same-host rebinding, and HTTP downgrades.
func TestLinkRedirectToPrivateHostIsBlocked(t *testing.T) {
	for _, destination := range []string{"https://internal.example/secret", "https://example.com/secret", "http://example.com/secret"} {
		t.Run(destination, func(t *testing.T) {
			calls := 0
			lookup := func(context.Context, string) ([]netip.Addr, error) {
				calls++
				if calls == 1 {
					return []netip.Addr{netip.MustParseAddr("93.184.216.34")}, nil
				}
				return []netip.Addr{netip.MustParseAddr("127.0.0.1")}, nil
			}
			a, f := networkApp(t, func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, destination, 302) }, lookup)
			hasCode(t, link(a, "https://example.com/"), "invalid-input")
			f.mu.Lock()
			defer f.mu.Unlock()
			if len(f.addresses) != 1 {
				t.Fatal(f.addresses)
			}
		})
	}
}

// TestUnusablePreviewsDoNotBreakBookmarks retains a valid bookmark without ever returning an unsafe external preview.
func TestUnusablePreviewsDoNotBreakBookmarks(t *testing.T) {
	for _, image := range []string{"", "https://[broken", "http://example.com/image", "https://internal.example/image", "/unsupported", "/missing"} {
		t.Run(image, func(t *testing.T) {
			lookup := func(ctx context.Context, host string) ([]netip.Addr, error) {
				ip := "93.184.216.34"
				if host == "internal.example" {
					ip = "127.0.0.1"
				}
				return []netip.Addr{netip.MustParseAddr(ip)}, nil
			}
			a, _ := networkApp(t, func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/" {
					fmt.Fprintf(w, `<meta property="og:title" content="Bookmark"><meta property="og:image" content="%s">`, image)
				} else if r.URL.Path == "/unsupported" {
					io.WriteString(w, "svg")
				} else {
					http.NotFound(w, r)
				}
			}, lookup)
			e := entryResult(t, link(a, "https://example.com/"))
			if e.EntryData["path"] != nil || e.EntryData["original_path"] != nil || e.EntryData["title"] != "Bookmark" {
				t.Fatal(e)
			}
		})
	}
}

// TestHTTPSKeepsHostnameVerification requires both certificate trust and the original host name for TLS.
func TestHTTPSKeepsHostnameVerification(t *testing.T) {
	a, _ := networkApp(t, func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, "page") }, nil)
	ok(t, link(a, "https://example.com/"))
	hasCode(t, link(a, "https://wrong-host.example/"), "invalid-input")
	a.client.Transport.(*http.Transport).TLSClientConfig = &tls.Config{RootCAs: x509.NewCertPool()}
	hasCode(t, link(a, "https://example.com/"), "invalid-input")
}

// TestLinkRedirectLoopIsBounded stops redirect loops without creating an entry.
func TestLinkRedirectLoopIsBounded(t *testing.T) {
	a, f := networkApp(t, func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, "/loop", 302) }, nil)
	hasCode(t, link(a, "https://example.com/loop"), "invalid-input")
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.addresses) > 6 {
		t.Fatal(f.addresses)
	}
}

// TestLinkResponseLimits rejects compressed, oversized, and dishonest responses at the application boundary.
func TestLinkResponseLimits(t *testing.T) {
	a, _ := networkApp(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/declared":
			w.Header().Set("Content-Length", fmt.Sprint(maxResponseBytes+1))
		case "/compressed":
			w.Header().Set("Content-Encoding", "gzip")
			io.WriteString(w, "compressed")
		case "/oversized":
			w.(http.Flusher).Flush()
			block := strings.Repeat("x", 65536)
			for n := 0; n <= maxResponseBytes/len(block); n++ {
				if _, err := io.WriteString(w, block); err != nil {
					return
				}
			}
		case "/short":
			w.Header().Set("Content-Length", "100")
			io.WriteString(w, "x")
		}
	}, nil)
	for _, path := range []string{"/declared", "/compressed", "/oversized", "/short"} {
		hasCode(t, link(a, "https://example.com"+path), "invalid-input")
	}
	if len(decoded[[]Entry](t, a.FetchEntries(Query{}))) != 0 {
		t.Fatal("oversized entry saved")
	}
}
