import { useState, useEffect, useRef, useCallback } from 'react';
import { getTodaysDate } from './utils.jsx';
import { fetchEntries } from './requests.js';
import { appendEntries, appendOlderDays } from './timeline.js';

export const useFetch = (search, limit) => {
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [allLoaded, setAllLoaded] = useState(false);
    const [error, setError] = useState(null);
    const cursor = useRef(null);

    const loadMore = useCallback(async () => {
        const page = cursor.current;
        if (!page || page.busy) return;
        if (page.done) {
            page.rows = appendOlderDays(page.rows);
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
            setAllLoaded(page.done);
        }
        page.busy = false;
        setLoading(false);
    }, [search, limit]);

    useEffect(() => {
        cursor.current = { offset: 0, rows: [], today: getTodaysDate(), done: false, busy: false };
        setList([]);
        setAllLoaded(false);
        loadMore();
        return () => { cursor.current = null; };
    }, [loadMore]);

    return { loading, list, allLoaded, error, loadMore };
};
