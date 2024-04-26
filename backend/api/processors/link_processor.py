import random
import traceback
from io import BytesIO
from opengraph_py3 import OpenGraph
import requests
from werkzeug.datastructures import FileStorage

from security import json_abort
from processors.entry_models import LinkEntryData
from processors.file_processor import save_file

user_agents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36'
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36'
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.1 Safari/605.1.15'
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.1 Safari/605.1.15'
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
    return True

def do_opengraph(link):

    if not site_allowed(link):
        return None
    
    try:
        data = OpenGraph(url=link)

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
        response = requests.get(url, headers={'User-Agent': random.choice(user_agents)})
        response.raise_for_status()  # Raise an exception for HTTP errors

        # Create a BytesIO object to hold the image data
        image_data = BytesIO(response.content)

        # Extract filename from URL
        filename = url.split('/')[-1]

        # Create a FileStorage instance
        file_storage = FileStorage(image_data, filename=filename)

        return file_storage
    except Exception as e:
        print(e)
        return None