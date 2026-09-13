// Presentation rules shared by every surface that renders an entry as a small
// summary (the home page cards). Kept here so the "sensitivity" setting is
// honoured consistently wherever titles are shown.

import { formatHour } from './date-format.js';
import { equalsDate, getUserData } from './utils.jsx';

// The background colour a summary uses for an entry's sentiment. Entry types
// that carry no sentiment (links, files) fall through to the neutral colour.
export const getSentimentColor = (entry) => {
    const sentiment = entry && entry.entry_data ? entry.entry_data.sentiment : null;
    if (sentiment === 'positive') {
        return 'var(--well-green)';
    } else if (sentiment === 'negative') {
        return 'var(--well-red)';
    } else {
        return 'var(--well-grey)';
    }
};

// The title to display for an entry. Entries written for a past date ("memories")
// show a generic label, everything else falls back to the hour it was written.
// When the user has hidden titles, the real title is never returned.
export const getEntryTitle = (entry, userData = getUserData()) => {
    const settings = userData && userData.settings ? userData.settings : {};
    const titleHidden = settings.sensitivity === 'both';

    if (!titleHidden && entry.entry_data && entry.entry_data.title) {
        return entry.entry_data.title;
    }

    const functionalDate = new Date(entry.functional_datetime);
    const memory = !equalsDate(functionalDate, new Date(entry.created_on));

    return memory && !titleHidden ? "Untitled Memory" : formatHour(functionalDate);
};
