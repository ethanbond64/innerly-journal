import React from "react";
import { Link } from "./router.jsx";
import { dayRoute } from "./constants.js";
import { formatLongDate } from "./date-format.js";
import { Modal } from "./modal.jsx";
import { dateToString } from "./utils.jsx";

//
// The other years a day has been written on, newest first.
//
export const MemoriesModal = ({ date, years, clear }) => {

    // Each year is the same day in that year, so the day page is reached by
    // swapping the year onto this date's month and day.
    const monthDay = dateToString(date).slice(5);

    return (
        <Modal label="Memories" title="Memories" subtitle={formatLongDate(date)} onCancel={clear}>
            {years.map((year) => (
                <Link key={year} className="memory-year" to={`${dayRoute}${year}-${monthDay}`}>
                    <span>{year}</span>
                    <span className="memory-year-go">&rsaquo;</span>
                </Link>
            ))}
        </Modal>
    );
};
