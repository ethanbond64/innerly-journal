import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BasePage } from "./base-page.jsx";
import { fetchActivity } from "./requests.js";
import { busiestDay, buildActivityWeeks, buildMonthLabels, weeksShown, wordCountLevel } from "./activity-grid.js";
import { writeRoute } from "./constants.js";

// Only every other weekday is labelled, the way GitHub does it, so the labels
// have room to breathe next to 12px cells.
const weekdayLabels = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

const monthShort = new Intl.DateTimeFormat('en-US', { month: 'short' });

const longDate = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

const sentimentModes = { sentiment: 'sentiment', words: 'words' };

const words = (count) => `${count} word${count === 1 ? '' : 's'}`;

const entries = (count) => `${count} ${count === 1 ? 'entry' : 'entries'}`;

const dayTitle = (day, mode) => {

    const date = longDate.format(day.date);

    if (day.entries === 0) {
        return `No entries on ${date}`;
    }

    if (mode === sentimentModes.words) {
        return `${words(day.words)} in ${entries(day.entries)} on ${date}`;
    }

    return `${entries(day.entries)} (${day.sentiment}) on ${date}`;
};

export const ActivityPage = () => {

    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [mode, setMode] = useState(sentimentModes.sentiment);
    const scroller = useRef(null);

    useEffect(() => {
        let cancelled = false;

        fetchActivity(weeksShown * 7, () => {
            if (!cancelled) {
                setError("Unable to load activity.");
                setLoading(false);
            }
        }).then((data) => {
            if (cancelled || data === undefined) {
                return;
            }
            setRows(data);
            setLoading(false);
        });

        return () => { cancelled = true; };
    }, []);

    const weeks = useMemo(() => buildActivityWeeks(rows), [rows]);
    const months = useMemo(() => buildMonthLabels(weeks), [weeks]);
    const busiest = useMemo(() => busiestDay(weeks), [weeks]);

    // A year does not fit on a narrow screen, so the grid scrolls and starts
    // parked on the most recent week.
    useEffect(() => {
        if (scroller.current !== null) {
            scroller.current.scrollLeft = scroller.current.scrollWidth;
        }
    }, [weeks]);

    const total = rows.reduce((sum, row) => sum + (row.words || 0), 0);

    return (
        <BasePage>
            <div className="wrapper lg-margin-top">

                <div className="activity-header">
                    <h4 className="activity-title">
                        {loading ? "Loading..." : `${entries(rows.length)}, ${words(total)} in the last year`}
                    </h4>
                    <div className="activity-modes">
                        <button className={`activity-mode${mode === sentimentModes.sentiment ? ' activity-mode-on' : ''}`}
                            onClick={() => setMode(sentimentModes.sentiment)}>Sentiment</button>
                        <button className={`activity-mode${mode === sentimentModes.words ? ' activity-mode-on' : ''}`}
                            onClick={() => setMode(sentimentModes.words)}>Word count</button>
                    </div>
                </div>

                {error ? <p className="calendar-message">{error}</p> : null}

                <div className="activity-scroll" ref={scroller}>
                    <div className="activity-chart">

                        <div className="activity-weekdays">
                            <div className="activity-months-spacer"></div>
                            {weekdayLabels.map((label, weekday) => (
                                <div key={weekday} className="activity-weekday">{label}</div>
                            ))}
                        </div>

                        <div className="activity-columns">

                            <div className="activity-months">
                                {months.map((label) => (
                                    <span key={label.column} className="activity-month" style={{ gridColumn: label.column + 1 }}>
                                        {monthShort.format(label.date)}
                                    </span>
                                ))}
                            </div>

                            <div className="activity-grid">
                                {weeks.map((week) => week.days.map((day) => {

                                    if (day.future) {
                                        return <div key={day.key} className="activity-cell activity-cell-future"></div>;
                                    }

                                    const level = mode === sentimentModes.words ? wordCountLevel(day.words, busiest) : null;
                                    const className = mode === sentimentModes.words
                                        ? `activity-cell activity-words-${level}`
                                        : `activity-cell activity-${day.entries === 0 ? 'empty' : day.sentiment}`;

                                    return (
                                        <Link key={day.key} to={`${writeRoute}/${day.key}`} className={className}
                                            title={dayTitle(day, mode)}></Link>
                                    );
                                }))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="activity-legend">
                    {mode === sentimentModes.words ?
                        <>
                            <span className="activity-legend-label">Less</span>
                            {[0, 1, 2, 3, 4].map((level) => (
                                <span key={level} className={`activity-cell activity-words-${level}`}></span>
                            ))}
                            <span className="activity-legend-label">More</span>
                        </> :
                        <>
                            <span className="activity-cell activity-negative"></span>
                            <span className="activity-legend-label">Negative</span>
                            <span className="activity-cell activity-positive"></span>
                            <span className="activity-legend-label">Positive</span>
                            <span className="activity-cell activity-neutral"></span>
                            <span className="activity-legend-label">Neutral</span>
                            <span className="activity-cell activity-empty"></span>
                            <span className="activity-legend-label">Nothing written</span>
                        </>}
                </div>
            </div>
        </BasePage>
    );
};
