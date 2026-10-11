import http.client
import ipaddress
import socket
import time
from io import BytesIO
from urllib.error import HTTPError
from urllib.parse import urljoin, urlsplit
from urllib.request import (HTTPDefaultErrorHandler, HTTPErrorProcessor,
                            HTTPRedirectHandler, HTTPSHandler, OpenerDirector, ProxyHandler,
                            Request, UnknownHandler)
from werkzeug.datastructures import FileStorage

from api.security import json_abort
from api.processors.entry_models import LinkEntryData
from api.processors.opengraph import decode_html, parse_open_graph
from api.processors.file_processor import save_file, validate_image

PAGE_TIMEOUT = 10
DOWNLOAD_TIMEOUT = 20
MAX_RESPONSE_BYTES = 30 * 1024 * 1024


def validate_url(url):
    if not isinstance(url, str) or any(c.isspace() or ord(c) < 32 or ord(c) == 127 for c in url):
        raise ValueError('Invalid URL')
    if '\\' in url:
        raise ValueError('Invalid URL')
    parts = urlsplit(url)
    if (parts.scheme.lower() != 'https' or not parts.hostname
            or parts.username is not None or parts.password is not None
            or '%' in parts.hostname or parts.port == 0):
        raise ValueError('Invalid URL')
    return parts


def public_address(address):
    ip = ipaddress.ip_address(address)
    if isinstance(ip, ipaddress.IPv6Address):
        if ip.ipv4_mapped:
            return public_address(str(ip.ipv4_mapped))
        if ip.sixtofour or ip.teredo:
            return False
    return ip.is_global and not (ip.is_multicast or ip.is_reserved or ip.is_unspecified)


def connect_public(address, timeout=socket._GLOBAL_DEFAULT_TIMEOUT, source_address=None):
    host, port = address
    addresses = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    if not addresses or any(not public_address(item[4][0]) for item in addresses):
        raise ValueError('Destination is not public')
    family, kind, protocol, _, destination = addresses[0]
    connection = socket.socket(family, kind, protocol)
    try:
        connection.settimeout(timeout)
        if source_address:
            connection.bind(source_address)
        connection.connect(destination)
        return connection
    except Exception:
        connection.close()
        raise


class PublicHTTPSConnection(http.client.HTTPSConnection):
    def connect(self):
        self._create_connection = connect_public
        super().connect()


class PublicHTTPSHandler(HTTPSHandler):
    def https_open(self, request):
        return self.do_open(PublicHTTPSConnection, request, context=self._context)


class PublicRedirectHandler(HTTPRedirectHandler):
    max_redirections = 5
    max_repeats = 2

    def redirect_request(self, request, response, code, message, headers, new_url):
        try:
            validate_url(new_url)
        except ValueError:
            response.close()
            raise
        return super().redirect_request(request, response, code, message, headers, new_url)


def build_url_opener():
    opener = OpenerDirector()
    for handler in (ProxyHandler({}), UnknownHandler(), PublicHTTPSHandler(),
                    HTTPDefaultErrorHandler(), PublicRedirectHandler(), HTTPErrorProcessor()):
        opener.add_handler(handler)
    return opener


url_opener = build_url_opener()


def fetch(url, timeout):
    validate_url(url)
    deadline = time.monotonic() + timeout
    request = Request(url, headers={'User-Agent': 'Innerly/1.0', 'Accept-Encoding': 'identity'})
    try:
        response = url_opener.open(request, timeout=timeout)
    except HTTPError as error:
        error.close()
        raise
    with response:
        encoding = response.headers.get('Content-Encoding', 'identity').strip().lower()
        if encoding not in ('', 'identity'):
            raise ValueError('Unsupported content encoding')
        declared_length = response.headers.get('Content-Length')
        if declared_length is not None and (int(declared_length) < 0 or int(declared_length) > MAX_RESPONSE_BYTES):
            raise ValueError('Response too large')
        body = bytearray()
        while True:
            if time.monotonic() > deadline:
                raise TimeoutError('Response timed out')
            chunk = response.read1(min(65536, MAX_RESPONSE_BYTES + 1 - len(body)))
            if not chunk:
                break
            body.extend(chunk)
            if len(body) > MAX_RESPONSE_BYTES:
                raise ValueError('Response too large')
        return bytes(body), response.headers.get('Content-Type', ''), response.geturl()


def do_opengraph(link):
    try:
        body, content_type, final_url = fetch(link, PAGE_TIMEOUT)
        data = parse_open_graph(decode_html(body, content_type))
    except (OSError, ValueError, http.client.HTTPException):
        return None
    image = data.get('image')
    try:
        image = urljoin(final_url, image) if image else None
    except ValueError:
        image = None
    return data.get('title'), image


def download_file(url):
    if not url:
        return None
    try:
        body, _, _ = fetch(url, DOWNLOAD_TIMEOUT)
        stream = BytesIO(body)
        extension = validate_image(stream)
        if extension is None:
            return None
        return FileStorage(stream, filename='preview.' + extension)
    except (OSError, ValueError, http.client.HTTPException):
        return None


def process_link_entry(user_id, link: str) -> tuple:
    data = do_opengraph(link)
    if data is None:
        json_abort(400, {'message': 'Unable to fetch this link safely.'})
    title, original_path = data
    path = None
    file_type = 'external'
    file = download_file(original_path)
    if file is not None:
        try:
            path, _, file_type = save_file(user_id, file)
        except OSError:
            pass
    if path is None:
        original_path = None
    return LinkEntryData(title, path, original_path, file_type, link).json(), []
