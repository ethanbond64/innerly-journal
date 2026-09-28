import { useCallback, useEffect, useState } from "react";
import { fetchTaggedDays } from "./requests.js";
import { dateToString } from "./utils.jsx";

//
// Every day tag the user has, keyed by the local day it falls on. Small enough to fetch
// whole, so rows look their tags up by date rather than the fetch tracking the scroll.
//
export const useDayTags = () => {

    const [byDay, setByDay] = useState({});

    useEffect(() => {
        fetchTaggedDays().then((rows) => {
            if (rows === undefined) {
                return;
            }

            const next = {};
            rows.forEach((row) => {
                const key = dateToString(new Date(row.functional_datetime));
                next[key] = [...(next[key] || []), row];
            });

            setByDay(next);
        });
    }, []);

    // Re-adding a tag a day already has answers with the tag already there, so it replaces
    // rather than doubles.
    const add = useCallback((key, tag) => setByDay((prev) => ({
        ...prev,
        [key]: [...(prev[key] || []).filter((existing) => existing.id !== tag.id), tag]
    })), []);

    const remove = useCallback((key, id) =>
        setByDay((prev) => ({ ...prev, [key]: (prev[key] || []).filter((tag) => tag.id !== id) })), []);

    return { byDay, add, remove };
};
