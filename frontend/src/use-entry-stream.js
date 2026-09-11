import { useCallback, useRef, useState } from "react";
import { fetchEntries } from "./requests.js";
import { createStream, readMore } from "./entry-stream.js";

// React binding for the calendar's entry stream. The paging state itself lives
// in a ref: it is bookkeeping for the fetch loop, and changing it should never
// on its own cause a render.
export const useEntryStream = () => {

    const [months, setMonths] = useState([]);
    const [loading, setLoading] = useState(true);
    const [allLoaded, setAllLoaded] = useState(false);
    const [error, setError] = useState(null);

    const stream = useRef(createStream());
    const busy = useRef(false);
    const failed = useRef(false);

    const loadMore = useCallback(async () => {

        if (busy.current || failed.current || stream.current.exhausted) {
            return;
        }

        busy.current = true;
        setLoading(true);

        const next = await readMore(stream.current, (offset, limit) => fetchEntries("", offset, limit));

        if (next === null) {
            failed.current = true;
            setError("Unable to load entries.");
        } else {
            setMonths(next);
        }

        setAllLoaded(stream.current.exhausted);
        busy.current = false;
        setLoading(false);
    }, []);

    return { months, loading, allLoaded, error, loadMore };
};
