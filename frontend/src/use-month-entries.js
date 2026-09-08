import { useEffect, useState } from "react";
import { fetchEntries } from "./requests.js";

const pageSize = 100;

// The entries API only pages newest-first with no date filter, so a month is
// loaded by walking pages until one reaches back past the first of the month.
// Older months therefore cost more requests; a start/end filter on the API
// would make this a single call.
export const useMonthEntries = (year, month) => {

    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {

        let cancelled = false;

        const start = new Date(year, month, 1);
        const end = new Date(year, month + 1, 1);

        const load = async () => {

            setLoading(true);
            setError(null);

            const collected = [];
            let offset = 0;

            while (true) {

                const page = await fetchEntries("", offset, pageSize);

                if (cancelled) {
                    return;
                }

                if (page === undefined) {
                    setError("Unable to load entries.");
                    setLoading(false);
                    return;
                }

                page.forEach((entry) => {
                    const date = new Date(entry.functional_datetime);
                    if (date >= start && date < end) {
                        collected.push(entry);
                    }
                });

                const oldest = page.length > 0 ? new Date(page[page.length - 1].functional_datetime) : null;

                if (page.length < pageSize || (oldest !== null && oldest < start)) {
                    break;
                }

                offset += pageSize;
            }

            collected.sort((a, b) => new Date(a.functional_datetime) - new Date(b.functional_datetime));

            setEntries(collected);
            setLoading(false);
        };

        load();

        return () => {
            cancelled = true;
        };
    }, [year, month]);

    return { entries, loading, error };
};
