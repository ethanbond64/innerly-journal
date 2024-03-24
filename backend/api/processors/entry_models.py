
class BaseEntryData:
    def __init__(self, title: str):
        self.title = title

    def json(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}

class TextEntryData(BaseEntryData):
    def __init__(self, title: str, text: str):
        self.title = title
        self.text = text
        self.sentiment = None