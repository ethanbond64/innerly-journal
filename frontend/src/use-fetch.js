import { useState, useEffect } from "react";
import { equalsDate, getPreviousDate, getNextDate, getTodaysDate } from "./utils";
import { fetchEntries } from "./requests";

export const useFetch = (search, offset, limit) => {

    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [lastRow, setLastRow] = useState({
        date: getTodaysDate(),
        endDate: null,
        collapse: false,
        entries: []
    });
    const [allLoaded, setAllLoaded] = useState(false);

    const appender = (row) => {
        setList((prev) => {
            console.log(`allLoaded ${allLoaded} appending: `, row);
            if (prev.length > 0 && (equalsDate(prev[prev.length - 1].date, row.date) || 
                equalsDate(prev[prev.length - 1].date, row.date))) {
                return prev;
            }
            return [...prev, row];
        });
    };

    useEffect(() => {

        if (loading && list.length > 0) {
            return;
        }

        setLoading(true);

        const refresh = async () => {

            const results = await fetchEntries(search, offset, limit);
    
            let stagedRow = {...lastRow};
            let allLoadedLocal = false;
            if (results.length < limit) {
                allLoadedLocal = true;
                setAllLoaded(allLoadedLocal);
            }
    
            results.forEach((entry) => {
                const functionalDate = new Date(entry.functional_datetime);
                
                if (equalsDate(functionalDate, stagedRow.date)) {
                    stagedRow.entries.push(entry);
                } else {
                    
                    // Append the staged row
                    appender(stagedRow);
                    const startDate = getPreviousDate(stagedRow.date);
                    
                    // Append the gap row
                    if (!equalsDate(startDate, functionalDate)) {
                        appender(newRow(startDate, getNextDate(functionalDate), true));
                    }
    
                    // Stage the new day row
                    stagedRow = newRow(functionalDate, null, false, [entry]);
                }
            });

            if (allLoadedLocal) {
                appender(stagedRow);
            } else {
                setLastRow(stagedRow);
            }

            setLoading(false);
        };

        if (allLoaded) {
            let localLastRow = list[list.length - 1];
            get90Days(localLastRow.date, appender);
            setLoading(false);
        } else {
            refresh();
        }
    }, 
    // eslint-disable-next-line
    [search, offset, limit, allLoaded]);

    return {loading, list};
};

const get90Days = (start, consumer) => {
    let date = start;
    for (let i = 0; i < 90; i++) {
        date = new Date(date);
        date.setDate(date.getDate() - 1);
        consumer(newRow(date));
    }
    date = new Date(date);
    date.setDate(date.getDate() - 1);
    return newRow(date);
};

const newRow = (date, endDate = null, collapse = false, entries = []) => {
    return {
        date: date,
        endDate: endDate,
        collapse: collapse,
        entries: entries
    };
};