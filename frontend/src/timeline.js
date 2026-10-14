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

export const appendOlderDays = (rows) => {
    const last = rows[rows.length - 1];
    const start = previousDay(last.endDate || last.date);
    const end = new Date(start);
    end.setDate(end.getDate() - 89);
    return [...rows, { date: start, endDate: end, collapse: true, entries: [] }];
};
