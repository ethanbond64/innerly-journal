import React, { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { BasePage } from "./base-page.jsx";
import { ImageModal } from "./image-modal.jsx";
import { Row } from "./row.jsx";
import { fetchDay } from "./requests.js";
import { formatLongDate, formatWeekday } from "./date-format.js";
import { homeRoute } from "./constants.js";
import { equalsDate, getDateNoTime } from "./utils.jsx";

// The page keeps three rows of cards even on an empty day, so it does not open
// as a single lonely strip.
const minGroups = 3;

// The route carries the day the same way the write route does: /day/2026-09-07.
const parseDate = (value) => {

    if (!value || !value.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return null;
    }

    const parts = value.split('-');
    const date = getDateNoTime(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));

    return isNaN(date.getTime()) ? null : date;
};

export const DayPage = () => {

    const { functionalDate } = useParams();
    const date = parseDate(functionalDate);

    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [imagePath, setImagePath] = useState(null);

    // The endpoint is given a day of slack on either end, because the stored
    // datetimes are UTC, so the day itself is picked out here in local time.
    useEffect(() => {

        if (date === null) {
            return;
        }

        setLoading(true);
        setError(null);

        fetchDay(functionalDate, () => {
            setError("Unable to load this day.");
            setLoading(false);
        }).then((results) => {

            if (results === undefined) {
                return;
            }

            setEntries(results.filter((entry) => equalsDate(new Date(entry.functional_datetime), date)));
            setLoading(false);
        });
    },
    // eslint-disable-next-line
    [functionalDate]);

    if (date === null) {
        return <Navigate to={homeRoute} />;
    }

    const row = { date: date, endDate: null, collapse: false, entries: entries };

    return (
        <BasePage>
            {
                imagePath ?
                <ImageModal path={imagePath} clear={() => setImagePath(null)} /> :
                null
            }
            <div className={`wrapper lg-margin-top`}>
                <div className={`container`}>
                    {loading ?
                        <p>Loading...</p> :
                        <>
                            {error && <p>{error}</p>}
                            <Row row={row} setImagePath={setImagePath} minGroups={minGroups}
                                label={<>{formatWeekday(date)}<br />{formatLongDate(date)}</>} />
                        </>}
                </div>
            </div>
        </BasePage>
    );
};
