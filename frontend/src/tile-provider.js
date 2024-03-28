import { useState, useEffect } from "react";
import axios, { all } from "axios"

export const useFetch = (search, offset, limit) => {

    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [lastRow, setLastRow] = useState(null);
    const [allLoaded, setAllLoaded] = useState(false);


    const appender = (row) => {
        setList((prev) => {
            console.log("appending: ", row);
            return [...prev, row];
        });
    };

    useEffect(() => {

        const refresh = async () => {

            if (allLoaded) {
                return; // TODO next 3 Months empty
            }

            setLoading(true);
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

const getTodaysDate = () => {
    const now = new Date();
    return getDateNoTime(now.getFullYear(), now.getMonth(), now.getDate());
}

const getDateNoTime = (year, month, day) => {
    return new Date(year, month, day, 23, 59, 0);
}

const getNextDate = (date) => {
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    return getDateNoTime(nextDay.getFullYear(), nextDay.getMonth(), nextDay.getDate());
};

const getPreviousDate = (date) => {
    const prevDay = new Date(date);
    prevDay.setDate(prevDay.getDate() - 1);
    return getDateNoTime(prevDay.getFullYear(), prevDay.getMonth(), prevDay.getDate());
}

const equalsDate = (date1, date2) => {
    return date1.getFullYear() === date2.getFullYear() && date1.getMonth() === date2.getMonth() && date1.getDate() === date2.getDate();
}