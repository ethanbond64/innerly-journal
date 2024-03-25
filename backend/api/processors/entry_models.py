
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