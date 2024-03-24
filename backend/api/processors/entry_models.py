
class BaseEntryData:
    def __init__(self, title: str):
        self.title = title

    def json(self):
        return self.__dict__

class TextEntryData(BaseEntryData):
    def __init__(self, title: str, text: str):
        self.title = title
        self.text = text
        self.sentiment = None