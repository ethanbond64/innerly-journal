import { useState, useEffect, useRef, useCallback } from 'react';
import { getTodaysDate } from './utils.jsx';
import { fetchEntries } from './requests.js';
import { appendEntries, appendEmptyDays } from './timeline.js';

// Empty days are cheap to render but not free, so the tail grows a screenful at
// a time rather than all the way to the first day the user could have written.
const dayChunk = 30;

export const useFetch = (search, limit) => {
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const cursor = useRef(null);

    const loadMore = useCallback(async () => {
        const page = cursor.current;
        if (!page || page.busy) return;
        // Entries are exhausted: keep the timeline going with the empty days
        // before the oldest one, so the page scrolls on without a click. A
        // search ends at its last hit instead, since blank days are not results.
        if (page.done) {
            if (search) return;
            page.rows = appendEmptyDays(page.rows, dayChunk, page.today);
            setList(page.rows);
            return;
        }
        // Set the guard synchronously: observer callbacks can precede React's next render.
        page.busy = true;
        setLoading(true);
        setError(null);
        const results = await fetchEntries(search, page.offset, limit);
        if (cursor.current !== page) return; // search changed or component unmounted
        if (results === undefined) {
            setError('Unable to load entries. Please try again.');
        } else {
            page.rows = appendEntries(page.rows, results, page.today);
            page.offset += results.length;
            page.done = results.length < limit;
            setList(page.rows);
        }
        page.busy = false;
        setLoading(false);
    }, [search, limit]);

    useEffect(() => {
        cursor.current = { offset: 0, rows: [], today: getTodaysDate(), done: false, busy: false };
        setList([]);
        loadMore();
        return () => { cursor.current = null; };
    }, [loadMore]);

    return { loading, list, error, loadMore };
};
