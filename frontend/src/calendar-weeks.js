import { dateToString } from './utils.jsx';

// Flattens the loaded months into one unbroken run of Sunday-start weeks,
// oldest first, so that every day of every month lands in the same weekday
// column. Days outside the loaded range only exist to square off the first and
// last weeks.
export const buildWeeks = (months) => {

    if (months.length === 0) {
        return [];
    }

    const byDay = new Map();
    months.forEach((month) => month.entries.forEach((entry) => {
        const key = dateToString(new Date(entry.functional_datetime));
        const day = byDay.get(key);
        if (day) {
            day.push(entry);
        } else {
            byDay.set(key, [entry]);
        }
    }));

    // `months` runs newest first.
    const newest = months[0];
    const oldest = months[months.length - 1];
    const rangeStart = new Date(oldest.year, oldest.month, 1);
    const rangeEnd = new Date(newest.year, newest.month + 1, 0);

    const weeks = [];
    let cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate() - rangeStart.getDay());

    while (cursor <= rangeEnd) {

        const days = [];

        for (let weekday = 0; weekday < 7; weekday++) {
            const date = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + weekday);
            days.push({
                date: date,
                inRange: date >= rangeStart && date <= rangeEnd,
                entries: byDay.get(dateToString(date)) || []
            });
        }

        // The week a month opens in carries that month's name in the gutter.
        const opener = days.find((day) => day.date.getDate() === 1 && day.inRange);

        weeks.push({
            key: dateToString(days[0].date),
            days: days,
            label: opener ? opener.date : null,
            showYear: opener ? opener.date.getMonth() === 0 || weeks.length === 0 : false
        });

        cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 7);
    }

    return weeks;
};
