
import threading

from processors.link_processor import process_link_entry
from models import Entry


def submitImportEntriesTask(links, user_id):
    if links is not None and len(links) > 0 and user_id is not None:
        thread = threading.Thread(target=importEntries, args=(links, user_id))
        thread.start()

def importEntries(links, user_id):
    # with liveapp.app_context():
    print("Importing entries", links, user_id)
    for link in links:
        print("Processing link", link)
        try:
            entry_data, tags = process_link_entry(user_id, link)
            Entry(user_id=user_id, entry_data=entry_data, tags=tags).save()
            print("Entry saved")
        except Exception as e:
            print("Entry failed to save", e)
            pass