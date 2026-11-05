const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const previousDay = (date) => { const day = new Date(date); day.setDate(day.getDate() - 1); return day; };
const newRow = (date, entries = []) => ({ date, endDate: null, collapse: false, entries });

// Keep the partially loaded last day visible; copy only rows changed by the next page.
export const appendEntries = (rows, entries, today) => {
    const result = rows.length ? [...rows] : [newRow(today)];
    for (const entry of entries) {
        const date = new Date(entry.functional_datetime);
        date.setHours(23, 59, 0, 0);
        const last = result[result.length - 1];
        if (sameDay(last.date, date)) {
            result[result.length - 1] = { ...last, entries: [...last.entries, entry] };
        } else {
            const start = previousDay(last.date);
            const end = new Date(date);
            end.setDate(end.getDate() + 1);
            if (start >= end) result.push({ date: start, endDate: sameDay(start, end) ? null : end, collapse: true, entries: [] });
            result.push(newRow(date, [entry]));
        }
    }
    return result;
};

// Past the oldest entry there is nothing left to page in, so the timeline just
// keeps counting days backwards. They are ordinary rows rather than one collapsed
// block, a chunk at a time so a scroll costs a bounded number of new rows.
export const appendEmptyDays = (rows, count, today) => {
    const result = rows.length ? [...rows] : [newRow(today)];
    const last = result[result.length - 1];
    let date = previousDay(last.endDate || last.date);
    for (let i = 0; i < count; i++) {
        result.push(newRow(date));
        date = previousDay(date);
    }
    return result;
};
