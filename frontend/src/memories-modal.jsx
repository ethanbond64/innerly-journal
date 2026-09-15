import React from "react";
import { Link } from "react-router-dom";
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
        <div className="modal" id="memoriesModal" style={{ display: 'block', zIndex: '1006', padding: '30px' }}>
            <div className="modal-dialog" role="document" style={{ padding: '30px' }}>
                <ClickOutsideTracker callback={clear}>
                    <div className="modal-content">
                        <span className={`closemodal`} onClick={clear} style={{ color: 'var(--dm-text)' }}>&times;</span>
                        <div className="modal-header" style={{ padding: '8px' }}>
                            <h3 className="modal-title" id="memoriesModalLabel">Memories from {formatLongDate(date)}</h3>
                        </div>
                        <div className="modal-body" style={{ textAlign: "center", margin: "0 auto", padding: '10px' }}>
                            {years.map((year) => (
                                <Link key={year} className="memory-year" to={`${dayRoute}${year}-${monthDay}`}>
                                    {year}
                                </Link>
                            ))}
                        </div>
                    </div>
                </ClickOutsideTracker>
            </div>
        </div>
    );
};
