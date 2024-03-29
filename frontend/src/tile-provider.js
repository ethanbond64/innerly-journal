import { useState, useEffect } from "react";
import axios from "axios"
import { equalsDate, getPreviousDate, getNextDate, getTodaysDate } from "./utils";

export const useFetch = (search, offset, limit) => {

    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [lastRow, setLastRow] = useState(null);
    const [allLoaded, setAllLoaded] = useState(false);


    const appender = (row) => {
        setList((prev) => {
            console.log("appending: ", row);
            return [...prev, row];
        });
    };

    useEffect(() => {

        if (loading) {
            return;
        }

        setLoading(true);

        const refresh = async () => {
            

            if (allLoaded) {
                let stagedRow = get90Days(lastRow.date, appender);
                setLastRow(stagedRow);
                return;
            }

            console.log("refreshing..", lastRow);
            
            const results = await executeQuery(search, offset, limit);
            console.log(results);
    
            let allLoadedLocal = false;
            if (results.length < limit) {
                allLoadedLocal = true;
            }

            let stagedRow = lastRow;
    
            // If stagedRow is null, then we are at the beginning show today's row
            if (stagedRow === null) {
                stagedRow = {
                    date: getTodaysDate(),
                    endDate: null,
                    collapse: false,
                    entries: []
                };
            }
    
            results.forEach((entry) => {
                const functionalDate = new Date(entry.functional_datetime);
                
                // Add the entry to the staged row 
                if (equalsDate(functionalDate, stagedRow.date)) {
                    stagedRow.entries.push(entry);
                    console.log("stagedRow: ", stagedRow);
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
            setAllLoaded(allLoadedLocal);
            setLoading(false);
        };

        refresh();
    }, [search, offset]);

    console.log("list from inside: ", list);

    return {loading, list};
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