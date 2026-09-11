// The calendar's paging algorithm, kept free of React so it can be reasoned
// about (and exercised) on its own.
//
// The entries API only pages newest-first with no date filter, so it is walked
// once from the top and each page is bucketed into the month it belongs to. A
// month is only complete once an entry older than its first day has been seen
// (or the API has run out), so the month currently being filled is held back
// until then.

export const pageSize = 100;

const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);

const addMonths = (date, count) => new Date(date.getFullYear(), date.getMonth() + count, 1);

const monthKey = (date) => `${date.getFullYear()}-${date.getMonth()}`;

export const createStream = (now = new Date()) => ({
    offset: 0,
    byMonth: new Map(),
    top: startOfMonth(now),
    oldest: null,
    boundary: null,
    exhausted: false
});

// Extends the stream by at least one more complete month, reading as many pages
// as that takes. Returns the months to render, newest first, or null when the
// fetch failed or there was nothing left to add.
export const readMore = async (state, fetchPage) => {

    if (state.exhausted) {
        return null;
    }

    let boundary = state.boundary;

    while (true) {

        const page = await fetchPage(state.offset, pageSize);

        if (page === undefined) {
            return null;
        }

        state.offset += page.length;

        page.forEach((entry) => {
            const date = new Date(entry.functional_datetime);
            const key = monthKey(date);
            const bucket = state.byMonth.get(key);
            if (bucket) {
                bucket.push(entry);
            } else {
                state.byMonth.set(key, [entry]);
            }
        });

        if (page.length > 0) {
            // Entries dated in the future still deserve a month to live in.
            const newest = startOfMonth(new Date(page[0].functional_datetime));
            if (newest > state.top) {
                state.top = newest;
            }
            state.oldest = new Date(page[page.length - 1].functional_datetime);
        }

        if (page.length < pageSize) {
            const oldest = state.oldest === null ? state.top : startOfMonth(state.oldest);
            boundary = oldest < state.top ? oldest : state.top;
            state.exhausted = true;
            break;
        }

        // Everything newer than the month of the oldest entry seen so far has
        // now been read in full. A page landing entirely inside the month still
        // being filled reveals nothing new, so it must not end the loop.
        const candidate = addMonths(startOfMonth(state.oldest), 1);
        const clamped = candidate > state.top ? state.top : candidate;

        if (boundary === null || clamped < boundary) {
            boundary = clamped;
            break;
        }
    }

    state.boundary = boundary;

    return buildMonths(state.top, boundary, state.byMonth);
};

// Every month from `top` down to `boundary` inclusive, newest first, so that
// months without a single entry still get a grid.
export const buildMonths = (top, boundary, byMonth) => {

    const months = [];

    for (let date = top; date >= boundary; date = addMonths(date, -1)) {
        const entries = byMonth.get(monthKey(date)) || [];
        months.push({
            year: date.getFullYear(),
            month: date.getMonth(),
            entries: [...entries].sort((a, b) => new Date(a.functional_datetime) - new Date(b.functional_datetime))
        });
    }

    return months;
};
