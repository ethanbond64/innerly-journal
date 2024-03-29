class BaseEntryData:
    def json(self):
        return self.__dict__


class TextEntryData(BaseEntryData):
    def __init__(self, title: str, text: str, sentiment: str):
        self.title = title
        self.text = text
        self.sentiment = sentiment


class FileEntryData(BaseEntryData):
    def __init__(self, title: str, path: str, file_type: str):
        self.title = title
        self.path = path
        self.file_type = file_type


class LinkEntryData(BaseEntryData):
    def __init__(self, title: str, path: str, original_path: str, file_type: str, link: str, site: str):
        self.title = title
        self.path = path
        self.original_path = original_path
        self.file_type = file_type
        self.link = link
        self.site = site