
import { useState, useEffect } from "react";
import axios from "axios";
import { handeMonthsResp, genNext } from "../utils/handleMonthResp";

function useFetch(query, querycount) {
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(false);
    const [list, setList] = useState([]);
    const [allLoaded, setAllLoaded] = useState(false);

    let today = new Date();
    const [month, setMonth] = useState(today.getMonth());
    const [year, setYear] = useState(today.getFullYear());

    useEffect(() => {
        let day = new Date();
        setMonth(day.getMonth());
        setYear(day.getFullYear());
        setList([]);
        setAllLoaded(false);
        console.log("reseting query params");
    }, [searh]);


    function handleAllLoaded() {
        const [newMonth, newYear, months] = genNext(month, year, 2);
        setList((prev) => [
            ...new Set([...prev, ...months])
        ]);

        setMonth(newMonth);
        setYear(newYear);
        return;
    }

    useEffect(() => {
        if (allLoaded) {
            // Add to list and increment months here
            handleAllLoaded();
            return;
        };
        if (querycount === 0) return;

        const CancelToken = axios.CancelToken;
        let cancel;

        setIsLoading(true);
        setError(false);

        console.log("QUERYING", month, year, query);
        axios
            .get(`/api/loadunitcards?mm=${month}&yy=${year}&qq=${query}&qc=${querycount}&gr=months`, {
                cancelToken: new CancelToken((c) => (cancel = c))
            })
            .then((res) => {
                if (!res.data.all_loaded) {
                    handeMonthsResp(res.data.months, querycount, month, year, setList);
                } else {
                    setAllLoaded(true);
                    setMonth(res.data.new_month);
                    setYear(res.data.new_year);
                    setIsLoading(false);
                    handleAllLoaded();
                    return;
                }
                setMonth(res.data.new_month);
                setYear(res.data.new_year);
                setIsLoading(false);
            })
            .catch((err) => {
                if (axios.isCancel(err)) return;
                setError(err);
            });

        return () => cancel();

        // KEEP THIS TO AVOID WARNINGS IN COMPILATION 
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, querycount]);

    return { isLoading, error, list, allLoaded };
}

export default useFetch;
