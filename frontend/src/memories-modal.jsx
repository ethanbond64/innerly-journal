import React from "react";
import { Link } from "./router.jsx";
import { dayRoute } from "./constants.js";
import { formatLongDate } from "./date-format.js";
import { ClickOutsideTracker, dateToString } from "./utils.jsx";

//
// The other years a day has been written on, newest first.
//
export const MemoriesModal = ({ date, years, clear }) => {

    // Each year is the same day in that year, so the day page is reached by
    // swapping the year onto this date's month and day.
    const monthDay = dateToString(date).slice(5);

    return (
        <div className="modal" id="memoriesModal">
            <div className="modal-dialog" role="document">
                <ClickOutsideTracker callback={clear}>
                    <div className="modal-content">
                        <span className="closemodal" onClick={clear}>&times;</span>
                        <div className="modal-header">
                            <h3 className="modal-title" id="memoriesModalLabel">Memories</h3>
                            <p className="modal-subtitle">{formatLongDate(date)}</p>
                        </div>
                        <div className="modal-body">
                            {years.map((year) => (
                                <Link key={year} className="memory-year" to={`${dayRoute}${year}-${monthDay}`}>
                                    <span>{year}</span>
                                    <span className="memory-year-go">&rsaquo;</span>
                                </Link>
                            ))}
                        </div>
                    </div>
                </ClickOutsideTracker>
            </div>
        </div>
    );
};
