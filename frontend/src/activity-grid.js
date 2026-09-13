// The shape behind the activity page: one calendar year of days laid out in
// Sunday-start columns, each day carrying the totals the grid is coloured by.
// Kept free of React so the bucketing rules can be reasoned about on their own.

import { dateToString } from './utils.jsx';

// Day colours. A day is as negative as its worst entry: any negative entry
// makes the day negative, any positive one (with nothing negative) makes it
// positive, and a day of nothing but neutral entries stays neutral.
export const dayLevels = { negative: 'negative', positive: 'positive', neutral: 'neutral' };

const startOfWeek = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay());

const addDays = (date, count) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + count);

// Sums each entry into the local day its functional date falls on.
export const bucketByDay = (rows) => {

    const byDay = new Map();

    rows.forEach((row) => {

        const key = dateToString(new Date(row.functional_datetime));
        const day = byDay.get(key) || { entries: 0, words: 0, negative: 0, positive: 0 };

        day.entries += 1;
        day.words += row.words || 0;

        if (row.sentiment === 'negative') {
            day.negative += 1;
        } else if (row.sentiment === 'positive') {
            day.positive += 1;
        }

        byDay.set(key, day);
    });

    return byDay;
};

export const getDaySentiment = (day) => {
    if (day.negative > 0) {
        return dayLevels.negative;
    } else if (day.positive > 0) {
        return dayLevels.positive;
    }
    return dayLevels.neutral;
};

// The weeks of one calendar year, oldest first. The grid opens on the week
// January 1st falls in, so every year starts in the same column, and the days
// of December that share that first week are marked `outside` — they keep their
// cell so January 1st sits on its own weekday row, but nothing is drawn in them.
//
// The year runs to December 31st, except the current one, which stops at today:
// the last column is simply cut short there rather than padded out.
export const buildYearWeeks = (rows, year, today = new Date()) => {

    const byDay = bucketByDay(rows);

    const opening = new Date(year, 0, 1);
    const closing = new Date(year, 11, 31);
    const last = year === today.getFullYear() && today < closing ? today : closing;

    const weeks = [];

    for (let cursor = startOfWeek(opening); cursor <= last; cursor = addDays(cursor, 7)) {

        const days = [];

        for (let weekday = 0; weekday < 7; weekday++) {

            const date = addDays(cursor, weekday);

            if (date > last) {
                break;
            }

            const key = dateToString(date);
            const outside = date < opening;

            // An outside day is drawn blank and belongs to the block before, so
            // it carries no totals here: they would otherwise be counted twice
            // when both years are on the page.
            const totals = (outside ? null : byDay.get(key)) || { entries: 0, words: 0, negative: 0, positive: 0 };

            days.push({
                key: key,
                date: date,
                outside: outside,
                entries: totals.entries,
                words: totals.words,
                sentiment: getDaySentiment(totals)
            });
        }

        weeks.push({ key: days[0].key, days: days });
    }

    return weeks;
};

// The first and last day a block actually covers, which is the window its
// entries are fetched for. The leading `outside` days belong to the year before
// and are never drawn, so they are left out.
export const yearRange = (year, today = new Date()) => {

    const closing = new Date(year, 11, 31);

    return {
        from: new Date(year, 0, 1),
        to: year === today.getFullYear() && today < closing ? today : closing
    };
};

// One label per month, sitting above the first column that month begins in.
export const buildMonthLabels = (weeks) => {

    const labels = [];

    weeks.forEach((week, column) => {

        const opener = week.days.find((day) => day.date.getDate() <= 7);

        if (opener === undefined) {
            return;
        }

        const previous = labels[labels.length - 1];

        // The last column of a month would push its label off the end.
        if (previous && (opener.date.getMonth() === previous.month || column >= weeks.length - 1)) {
            return;
        }

        labels.push({ column: column, month: opener.date.getMonth(), date: opener.date });
    });

    return labels;
};

// Word-count shading is ranked rather than scaled: a day is shaded by how many
// of the year's other written-on days it outwrites, so the colour spreads over
// whatever lengths this particular year actually contains. A handful of very
// long days would otherwise flatten everything else into the same faint green.
//
// The shade is the share of the mixture that is green, so the quietest written
// day still shows (`lightestMix`) and the busiest is full strength.
export const lightestMix = 12;

export const buildWordScale = (weeks) => {

    const written = [];

    weeks.forEach((week) => week.days.forEach((day) => {
        if (day.words > 0) {
            written.push(day.words);
        }
    }));

    written.sort((a, b) => a - b);

    return written;
};

// How many values in the sorted scale are at or below `words`.
const rankOf = (scale, words) => {

    let low = 0;
    let high = scale.length;

    while (low < high) {
        const middle = (low + high) >> 1;
        if (scale[middle] <= words) {
            low = middle + 1;
        } else {
            high = middle;
        }
    }

    return low;
};

// The percentage of green to mix in for a day, or null for a day with no words
// at all, which is drawn as an empty cell instead.
export const wordCountMix = (words, scale) => {

    if (words <= 0) {
        return null;
    }

    if (scale.length === 0) {
        return 100;
    }

    const rank = rankOf(scale, words) / scale.length;

    return Math.round(lightestMix + (100 - lightestMix) * rank);
};
