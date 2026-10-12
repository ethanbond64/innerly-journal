package journal

import (
	"bytes"
	"io"
	"regexp"
	"strings"

	"golang.org/x/net/html"
	"golang.org/x/text/encoding/htmlindex"
	"golang.org/x/text/transform"
)

var charsetPattern = regexp.MustCompile(`(?i)charset=["']?([\w-]+)`)

func decodeHTML(body []byte, contentType string) string {
	charset := charsetPattern.FindStringSubmatch(contentType)
	if len(charset) == 0 {
		end := len(body)
		if end > 2048 {
			end = 2048
		}
		charset = charsetPattern.FindStringSubmatch(string(body[:end]))
	}
	if len(charset) > 1 {
		encoding, err := htmlindex.Get(charset[1])
		if err == nil && encoding != nil {
			decoded, _, err := transform.Bytes(encoding.NewDecoder(), body)
			if err == nil {
				return string(decoded)
			}
		}
	}
	return strings.ToValidUTF8(string(body), "\ufffd")
}

func parseOpenGraph(body string) map[string]string {
	result := map[string]string{}
	parser := html.NewTokenizer(bytes.NewBufferString(body))
	for {
		kind := parser.Next()
		if kind == html.ErrorToken {
			if parser.Err() == io.EOF {
				return result
			}
			return result
		}
		if kind != html.StartTagToken && kind != html.SelfClosingTagToken {
			continue
		}
		token := parser.Token()
		if token.Data != "meta" {
			continue
		}
		property, content, present := "", "", false
		for _, attr := range token.Attr {
			if attr.Key == "property" {
				property = attr.Val
			}
			if attr.Key == "content" {
				content = attr.Val
				present = true
			}
		}
		if present && strings.HasPrefix(property, "og:") {
			result[strings.TrimPrefix(property, "og:")] = content
		}
	}
}
