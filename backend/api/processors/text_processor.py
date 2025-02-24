from api.processors.entry_models import TextEntryData
from api.processors.keywords import positive, negative, negations


POSITIVE = 'positive'
NEGATIVE = 'negative'
NEUTRAL = 'neutral'
SENTIMENT_VALUES = [NEGATIVE, NEUTRAL, POSITIVE]

# Take in the body input from the request, validate and return entry data and tags
def process_text_entry(body: dict) -> tuple:

    title = body.get('title')
    text = body.get('text')
    
    return build_entry_data(title, text).json(), []

def build_entry_data(title: str, text: str) -> dict:
    
    sentiment = NEUTRAL

    if text is not None and len(text) > 0:
        sentiment = getSentiment(text)

    return TextEntryData(title, text, sentiment)

def getSentiment(text: str) -> str:
    
    forward_offset = 0
    positive_count = 0.0
    negative_count = 0.0

    for token in text.replace("'","").lower().split():
        
        if token in negations:
            forward_offset = 2
            continue
        
        if forward_offset > 0:
            forward_offset -= 1
            continue
        
        if token in positive:
            positive_count += 1
        
        if token in negative:
            negative_count += 1
        
    sentiment = NEUTRAL

    if positive_count == 0 or negative_count == 0:
        
        if positive_count != 0:
            sentiment = POSITIVE

        elif negative_count != 0:
            sentiment = NEGATIVE

    elif negative_count / positive_count > 1.1:
        sentiment = NEGATIVE

    elif negative_count / positive_count < 0.5:
        sentiment = POSITIVE

    return sentiment

def sentiment_index_to_value(idx: int) -> str:

    if idx in {0, 1, 2}:
        return SENTIMENT_VALUES[idx]
    
    return NEUTRAL