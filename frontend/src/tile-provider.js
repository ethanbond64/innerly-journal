import { useState, useEffect } from "react";
import axios from "axios"
import { equalsDate, getPreviousDate, getNextDate, getTodaysDate } from "./utils";

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
            if (prev.length >0 && equalsDate(prev[prev.length - 1].date, row.date)) {
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

            const results = await executeQuery(search, offset, limit);
            console.log(results);
    
            let stagedRow = {...lastRow};
            let allLoadedLocal = false;
            if (results.length < limit) {
                allLoadedLocal = true;
                setAllLoaded(allLoadedLocal);
            }
            console.log(`reslen: ${results.length} allLoadedLocal: `, allLoadedLocal);
    
            results.forEach((entry) => {
                const functionalDate = new Date(entry.functional_datetime);
                
                // Add the entry to the staged row 
                if (equalsDate(functionalDate, stagedRow.date)) {
                    stagedRow.entries.push(entry);
                } else {
                    
                    // Append the staged row
                    appender(stagedRow);
                    const startDate = getPreviousDate(stagedRow.date);
                    
                    // Append the gap row
                    if (!equalsDate(startDate, functionalDate)) {
                        appender({
                            date: startDate,
                            endDate: getNextDate(functionalDate),
                            collapse: true,
                            entries: []
                        });
                    }
    
                    // Stage the new day row
                    stagedRow = {
                        date: functionalDate,
                        endDate: null,
                        collapse: false,
                        entries: [entry]
                    };
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
    }, [search, offset, limit, allLoaded]);

    return {loading, list, allLoaded};
}

const get90Days = (start, consumer) => {
    let date = start;
    for (let i = 0; i < 90; i++) {
        date = new Date(date);
        date.setDate(date.getDate() - 1);
        consumer({
            date: date,
            endDate: null,
            collapse: false,
            entries: []
        });
    }
    date = new Date(date);
    date.setDate(date.getDate() - 1);
    return {
        date: date,
        endDate: null,
        collapse: false,
        entries: []
    };
}

const executeQuery = async (search, offset, limit) => {
    return await axios.get(`http://localhost:8000/api/fetch/entries?search=${search}&limit=${limit}&offset=${offset}`, {
        headers: {
            "Authorization": `Bearer ${localStorage.getItem('innerly-token')}`
        }
    }).then((response) => {
        console.log(response);
        return response.data.data;
    });
}