// Replacements for the handful of moment format strings this app used.
//
// Every caller passes either a Date or a UTC ISO string from the API, and all
// output renders in the browser's local timezone with en-US month names, which
// is what moment did by default.

const monthLong = new Intl.DateTimeFormat('en-US', { month: 'long' });
const monthShort = new Intl.DateTimeFormat('en-US', { month: 'short' });

const ordinal = (day) => {
    const teens = day % 100;
    if (teens >= 11 && teens <= 13) {
        return `${day}th`;
    }
    switch (day % 10) {
        case 1: return `${day}st`;
        case 2: return `${day}nd`;
        case 3: return `${day}rd`;
        default: return `${day}th`;
    }
};

const toDate = (value) => (value instanceof Date ? value : new Date(value));

// "MMMM Do, YYYY" -> "September 7th, 2026"
export const formatLongDate = (value) => {
    const date = toDate(value);
    return `${monthLong.format(date)} ${ordinal(date.getDate())}, ${date.getFullYear()}`;
};

// "MMMM Do YYYY" -> "September 7th 2026"
export const formatLongDateNoComma = (value) => {
    const date = toDate(value);
    return `${monthLong.format(date)} ${ordinal(date.getDate())} ${date.getFullYear()}`;
};

// "MMM D" -> "Sep 7"
export const formatShortDate = (value) => {
    const date = toDate(value);
    return `${monthShort.format(date)} ${date.getDate()}`;
};

// "MMM Do" -> "Sep 7th"
export const formatShortOrdinalDate = (value) => {
    const date = toDate(value);
    return `${monthShort.format(date)} ${ordinal(date.getDate())}`;
};

// "MMM Do ha" -> "Sep 7th 3pm"
export const formatShortOrdinalDateTime = (value) => {
    const date = toDate(value);
    const hours = date.getHours();
    const hour12 = hours % 12 === 0 ? 12 : hours % 12;
    return `${formatShortOrdinalDate(date)} ${hour12}${hours < 12 ? 'am' : 'pm'}`;
};
