import random
import time
import traceback
from io import BytesIO
from urllib.parse import urlparse
from urllib.request import (HTTPDefaultErrorHandler, HTTPErrorProcessor, HTTPHandler,
                            HTTPRedirectHandler, HTTPSHandler, OpenerDirector, ProxyHandler,
                            Request, UnknownHandler)
from werkzeug.datastructures import FileStorage

from api.security import json_abort
from api.processors.entry_models import LinkEntryData
from api.processors.opengraph import decode_html, parse_open_graph
from api.processors.file_processor import save_file

PAGE_TIMEOUT = 10
DOWNLOAD_TIMEOUT = 20
MAX_RESPONSE_BYTES = 30 * 1024 * 1024

ALLOWED_SCHEMES = {'http', 'https'}

# urlopen's default opener also handles file://, ftp:// and data://, which would
# let a submitted link read local files. This is the stdlib's default handler set
# with those three left out, so redirects and HTTP error codes behave normally.
def build_url_opener():
    opener = OpenerDirector()
    for handler in (ProxyHandler(), UnknownHandler(), HTTPHandler(), HTTPSHandler(),
                    HTTPDefaultErrorHandler(), HTTPRedirectHandler(), HTTPErrorProcessor()):
        opener.add_handler(handler)
    return opener

url_opener = build_url_opener()

user_agents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.1 Safari/605.1.15',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.1 Safari/605.1.15',
]

def process_link_entry(user_id, link: str) -> tuple:

    data = do_opengraph(link)

    if data is None:
        json_abort(400)

    title, original_path = data

    new_path = original_path

    file = download_file(original_path)
    file_type = 'external'

    if file is not None:
        path, _original_filename_, file_type = save_file(user_id, file)
        new_path = path

    return LinkEntryData(title, new_path, original_path, file_type, link).json(), []


def site_allowed(link):
    # TODO validate link
    return scheme_allowed(link)

def scheme_allowed(url):
    return isinstance(url, str) and urlparse(url).scheme.lower() in ALLOWED_SCHEMES

# Fetches a URL, returning the body and its content type. Raises on HTTP errors.
def fetch(url, timeout):
    if not scheme_allowed(url):
        raise ValueError(f"refusing to fetch non-HTTP(S) url: {url!r}")

    request = Request(url, headers={'User-Agent': random.choice(user_agents)})
    with url_opener.open(request, timeout=timeout) as response:

        declared_length = (response.headers.get('Content-Length') or '').strip()
        if declared_length.isdigit() and int(declared_length) > MAX_RESPONSE_BYTES:
            raise ValueError(f"declared size {declared_length} exceeds {MAX_RESPONSE_BYTES} byte cap: {url!r}")

        # Read one byte past the cap so a missing or dishonest Content-Length is
        # still caught, rather than trusting the header alone.
        body = response.read(MAX_RESPONSE_BYTES + 1)
        if len(body) > MAX_RESPONSE_BYTES:
            raise ValueError(f"response exceeds {MAX_RESPONSE_BYTES} byte cap: {url!r}")

        return body, response.headers.get('Content-Type', '')

def do_opengraph(link):

    if not site_allowed(link):
        return None

    try:
        if 'wikipedia.org' in link:
            time.sleep(0.33)

        body, content_type = fetch(link, PAGE_TIMEOUT)
        data = parse_open_graph(decode_html(body, content_type))

        title = data.get("title")
        image = data.get("image")

        return title, image
    except Exception as e:
        traceback.print_exc()
        pass

    return None

def download_file(url):
    try:
        # Send a GET request to the URL to download the image
        body, _content_type_ = fetch(url, DOWNLOAD_TIMEOUT)

        # Create a BytesIO object to hold the image data
        image_data = BytesIO(body)

        # Extract filename from URL
        filename = url.split('/')[-1]

        # Create a FileStorage instance
        file_storage = FileStorage(image_data, filename=filename)

        return file_storage
    except Exception:
        return None
