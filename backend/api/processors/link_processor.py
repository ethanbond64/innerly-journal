from io import BytesIO
from opengraph_py3 import OpenGraph
import re
import requests
from werkzeug.datastructures import FileStorage

from api.models import User
from api.security import json_abort
from api.processors.entry_models import LinkEntryData
from api.processors.file_processor import save_file

yt1 = "youtube.com/watch?v="
yt2 = "youtu.be/"
spotify = "spotify.com"
soundcloud = "soundcloud.com"
wiki = "wikipedia.org"
ht_header = "http://"
hts_header = "https://"

# TODO make this all generic via an admin whitelist setting
# IDs for site name
yt_id = "youtube"
spotify_id = "spotify"
sc_id = "soundcloud"
wiki_id = "wikipedia"

def process_link_entry(user: User, link: str) -> tuple:

    data = do_opengraph(link)

    if data is None:
        json_abort(400)

    site, original_path, title = data

    new_path = original_path

    file = download_file(original_path)

    if file is not None:
        new_path = save_file(user.id, file)

    return LinkEntryData(title, new_path, original_path, link, site).json(), []


def get_sitename(link):
    if yt1 in link:
        return yt_id
    elif yt2 in link:
        return yt_id
    elif spotify in link:
        return spotify_id
    elif soundcloud in link:
        return sc_id
    elif wiki in link:
        return wiki_id
    return None


def parse_ogp(og_res, site_name, link):
    thumbnail_img = None
    link_title = None
    if site_name == yt_id:
        thumbnail_img = og_res.get("image")
        if thumbnail_img is None or thumbnail_img == "":
            if yt1 in link:
                vid = link[link.index(yt1) + len(yt1) :].split("&")[0]
            else:
                vid = link[link.index(yt2) + len(yt2) :].split("?")[0]
            thumbnail_img = "https://img.youtube.com/vi/" + vid + "/mqdefault.jpg"
        link_title = og_res.get("title")
    elif site_name == spotify_id:
        thumbnail_img = og_res.get("image")
        link_title = og_res.get("title")
        if og_res.get("description") is not None:
            if ", a song by" in og_res.get(
                "description"
            ) and "on Spotify" in og_res.get("description"):
                link_title = (
                    og_res.get("description")
                    .replace(", a song by", " -")
                    .replace("on Spotify", "")
                    .split(" - ")
                )
                link_title = link_title[1] + " - " + link_title[0]
    elif site_name == sc_id:
        thumbnail_img = og_res.get("image")
        link_title = og_res.get("title")
    elif site_name == wiki_id:
        thumbnail_img = og_res.get("image")
        link_title = link.split("/")[-1].split("#")[0].replace("_", " ").title()

    return thumbnail_img, link_title


def do_opengraph(link):

    site_name = get_sitename(link)

    if site_name is not None:
        if ht_header not in link and hts_header not in link:
            link = ht_header + link

        regex = re.compile(
            r"^(?:http|ftp)s?://"  # http:// or https://
            r"(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+(?:[A-Z]{2,6}\.?|[A-Z0-9-]{2,}\.?)|"  # domain...
            r"localhost|"  # localhost...
            r"\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})"  # ...or ip
            r"(?::\d+)?"  # optional port
            r"(?:/?|[/?]\S+)$",
            re.IGNORECASE,
        )
        # print('ATTEMPING RE')
        if re.match(regex, link) is not None:
            try:
                # Youtube not working as of dec 4th
                if site_name != yt_id:
                    og_res = OpenGraph(url=link, features="html.parser")
                else:
                    og_res = {}
                thumbnail_img, link_title = parse_ogp(og_res, site_name, link)

                return (site_name, thumbnail_img, link_title)

            except:
                return None
        else:
            # print('CAUGHT')
            return None
    else:
        return None

def download_file(url):
    try:
        # Send a GET request to the URL to download the image
        response = requests.get(url)
        response.raise_for_status()  # Raise an exception for HTTP errors

        # Create a BytesIO object to hold the image data
        image_data = BytesIO(response.content)

        # Extract filename from URL
        filename = url.split('/')[-1]

        # Create a FileStorage instance
        file_storage = FileStorage(image_data, filename=filename)

        return file_storage
    except Exception as e:
        return None