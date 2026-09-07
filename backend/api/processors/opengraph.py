import re
from html.parser import HTMLParser

# <meta charset="..."> or a charset= inside a Content-Type header
CHARSET_PATTERN = re.compile(r'charset=["\']?([\w-]+)', re.IGNORECASE)

OG_PREFIX = 'og:'


class OpenGraphParser(HTMLParser):
    """Collects <meta property="og:*" content="..."> pairs, keyed without the prefix."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.properties = {}

    def handle_starttag(self, tag, attrs):
        if tag != 'meta':
            return

        attributes = dict(attrs)
        prop = attributes.get('property')
        content = attributes.get('content')

        if prop and content is not None and prop.startswith(OG_PREFIX):
            # Later tags overwrite earlier ones, which is what the previous
            # opengraph library did for pages listing several og:image values.
            self.properties[prop[len(OG_PREFIX):]] = content


def parse_open_graph(html: str) -> dict:
    parser = OpenGraphParser()
    parser.feed(html)
    parser.close()
    return parser.properties


def decode_html(body: bytes, content_type: str = '') -> str:
    """Decode a response body, preferring the declared charset over utf-8."""

    charset = None

    match = CHARSET_PATTERN.search(content_type)
    if match:
        charset = match.group(1)

    if charset is None:
        # Fall back to a <meta charset> in the head, which is always near the top.
        match = CHARSET_PATTERN.search(body[:2048].decode('ascii', errors='replace'))
        if match:
            charset = match.group(1)

    try:
        return body.decode(charset or 'utf-8', errors='replace')
    except LookupError:
        return body.decode('utf-8', errors='replace')
