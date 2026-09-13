// The shape behind the activity page: a fixed 7 x 53 block of days ending with
// today, with each day carrying the totals the grid is coloured by. Kept free of
// React so the bucketing rules can be reasoned about on their own.

import { dateToString } from './utils.jsx';

export const weeksShown = 53;

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

// The weeks to draw, oldest first, each one a Sunday-start run of seven days.
// Days after today still take up a cell so the columns stay square, but they are
// marked so nothing is drawn in them.
export const buildActivityWeeks = (rows, today = new Date()) => {

    const byDay = bucketByDay(rows);
    const start = addDays(startOfWeek(today), -7 * (weeksShown - 1));

    const weeks = [];

    for (let week = 0; week < weeksShown; week++) {

        const days = [];

        for (let weekday = 0; weekday < 7; weekday++) {

            const date = addDays(start, week * 7 + weekday);
            const key = dateToString(date);
            const totals = byDay.get(key) || { entries: 0, words: 0, negative: 0, positive: 0 };

            days.push({
                key: key,
                date: date,
                future: date > today,
                entries: totals.entries,
                words: totals.words,
                sentiment: getDaySentiment(totals)
            });
        }

        weeks.push({ key: days[0].key, days: days });
    }

    return weeks;
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

// GitHub-style discrete shading: four steps spread over the range of the year,
// so a quiet year still fills out the scale.
export const wordCountLevel = (words, busiest) => {

    if (words <= 0) {
        return 0;
    }

    if (busiest <= 0) {
        return 1;
    }

    return Math.min(4, Math.ceil((words / busiest) * 4));
};

export const busiestDay = (weeks) => weeks.reduce(
    (busiest, week) => week.days.reduce((most, day) => Math.max(most, day.words), busiest), 0);
