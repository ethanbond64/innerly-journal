package journal

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strconv"
	"strings"
	"time"
	"unicode"
)

const maxResponseBytes = 30 * 1024 * 1024

var blockedNetworks = []netip.Prefix{
	netip.MustParsePrefix("0.0.0.0/8"), netip.MustParsePrefix("100.64.0.0/10"),
	netip.MustParsePrefix("192.0.0.0/24"), netip.MustParsePrefix("192.0.2.0/24"),
	netip.MustParsePrefix("192.88.99.0/24"), netip.MustParsePrefix("198.18.0.0/15"),
	netip.MustParsePrefix("198.51.100.0/24"), netip.MustParsePrefix("203.0.113.0/24"),
	netip.MustParsePrefix("240.0.0.0/4"), netip.MustParsePrefix("2001::/23"),
	netip.MustParsePrefix("2001:db8::/32"), netip.MustParsePrefix("2002::/16"),
	netip.MustParsePrefix("3fff::/20"),
}

func validateURL(value string) (*url.URL, error) {
	if strings.Contains(value, "\\") || strings.IndexFunc(value, func(r rune) bool { return unicode.IsSpace(r) || r < 32 || r == 127 }) >= 0 {
		return nil, fmt.Errorf("invalid URL")
	}
	parsed, err := url.Parse(value)
	if err != nil {
		return nil, err
	}
	if parsed.Scheme != "https" || parsed.Hostname() == "" || parsed.User != nil || strings.Contains(parsed.Hostname(), "%") {
		return nil, fmt.Errorf("only HTTPS URLs are supported")
	}
	if parsed.Port() != "" {
		port, err := strconv.Atoi(parsed.Port())
		if err != nil || port < 1 || port > 65535 {
			return nil, fmt.Errorf("invalid port")
		}
	}
	return parsed, nil
}

func publicAddress(ip netip.Addr) bool {
	ip = ip.Unmap()
	if !ip.IsGlobalUnicast() || ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() {
		return false
	}
	if ip.Is6() && !netip.MustParsePrefix("2000::/3").Contains(ip) {
		return false
	}
	for _, prefix := range blockedNetworks {
		if prefix.Contains(ip) {
			return false
		}
	}
	return true
}

type lookupFunc func(context.Context, string) ([]netip.Addr, error)
type dialFunc func(context.Context, string, string) (net.Conn, error)

func connectPublic(ctx context.Context, address string, lookup lookupFunc, dial dialFunc) (net.Conn, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return nil, err
	}
	addresses, err := lookup(ctx, host)
	if err != nil {
		return nil, err
	}
	if len(addresses) == 0 {
		return nil, fmt.Errorf("no address")
	}
	for _, ip := range addresses {
		if !publicAddress(ip) {
			return nil, fmt.Errorf("destination is not public")
		}
	}
	return dial(ctx, "tcp", net.JoinHostPort(addresses[0].String(), port))
}

func buildHTTPClient() *http.Client {
	dialer := &net.Dialer{Timeout: 10 * time.Second}
	transport := &http.Transport{
		DisableKeepAlives: true, DisableCompression: true, TLSHandshakeTimeout: 10 * time.Second,
		ResponseHeaderTimeout: 10 * time.Second,
		DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			return connectPublic(ctx, address, func(ctx context.Context, host string) ([]netip.Addr, error) {
				return net.DefaultResolver.LookupNetIP(ctx, "ip", host)
			}, dialer.DialContext)
		},
	}
	return &http.Client{Transport: transport, Timeout: 20 * time.Second, CheckRedirect: func(request *http.Request, via []*http.Request) error {
		if len(via) > 5 {
			return fmt.Errorf("too many redirects")
		}
		_, err := validateURL(request.URL.String())
		return err
	}}
}

func (a *App) fetch(ctx context.Context, value string, timeout time.Duration) ([]byte, string, *url.URL, error) {
	parsed, err := validateURL(value)
	if err != nil {
		return nil, "", nil, err
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return nil, "", nil, err
	}
	request.Header.Set("User-Agent", "Innerly/1.0")
	request.Header.Set("Accept-Encoding", "identity")
	response, err := a.client.Do(request)
	if err != nil {
		return nil, "", nil, err
	}
	defer response.Body.Close()
	encoding := strings.ToLower(strings.TrimSpace(response.Header.Get("Content-Encoding")))
	if response.StatusCode < 200 || response.StatusCode >= 300 || (encoding != "" && encoding != "identity") || response.ContentLength > maxResponseBytes {
		return nil, "", nil, fmt.Errorf("unsupported response")
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, maxResponseBytes+1))
	if err != nil || len(body) > maxResponseBytes {
		return nil, "", nil, fmt.Errorf("response unavailable or too large")
	}
	return body, response.Header.Get("Content-Type"), response.Request.URL, nil
}

func (a *App) processLinkEntry(ctx context.Context, userID int64, link string) (map[string]any, error) {
	body, contentType, finalURL, err := a.fetch(ctx, link, 10*time.Second)
	if err != nil {
		return nil, failure("invalid-input", "Unable to fetch this link safely.")
	}
	metadata := parseOpenGraph(decodeHTML(body, contentType))
	data := map[string]any{"title": metadata["title"], "link": link, "path": nil, "original_path": nil, "file_type": "external"}
	if metadata["image"] == "" {
		return data, nil
	}
	relative, err := url.Parse(metadata["image"])
	if err != nil {
		return data, nil
	}
	imageURL := finalURL.ResolveReference(relative).String()
	image, _, _, err := a.fetch(ctx, imageURL, 20*time.Second)
	if err != nil || validateImage(image) == "" {
		return data, nil
	}
	file, err := a.processFileEntry(userID, "preview."+validateImage(image), image)
	if err == nil {
		data["path"] = file["path"]
		data["file_type"] = file["file_type"]
		data["original_path"] = imageURL
	}
	return data, nil
}
