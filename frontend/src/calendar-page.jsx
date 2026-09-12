import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BasePage } from "./base-page.jsx";
import { useEntryStream } from "./use-entry-stream.js";
import { getEntryTitle, getSentimentColor } from "./entry-display.js";
import { dateToString, equalsDate, getUserData } from "./utils.jsx";
import { buildWeeks } from "./calendar-weeks.js";
import { viewRoute, writeRoute } from "./constants.js";

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const monthShort = new Intl.DateTimeFormat('en-US', { month: 'short' });

// Stripes shown before a day collapses into a "+N more" toggle.
const stripesPerDay = 4;

export const CalendarPage = () => {

    const { months, loading, allLoaded, error, loadMore } = useEntryStream();
    const [expandedDay, setExpandedDay] = useState(null);
    const sentinel = useRef(null);
    const height = useRef(0);

    const today = new Date();
    const userData = getUserData();

    const weeks = useMemo(() => buildWeeks(months), [months]);

    // The newest week sits at the bottom and older ones are added above, so the
    // page has to be pinned to the bottom on the first render and then nudged
    // down by however much was prepended on every render after that. Browser
    // scroll anchoring would fight this, and Safari has none at all, so it is
    // turned off in CSS and done explicitly here.
    useLayoutEffect(() => {
        if (weeks.length === 0) {
            return;
        }

        const scrollHeight = document.documentElement.scrollHeight;

        if (height.current === 0) {
            window.scrollTo(0, scrollHeight);
        } else if (scrollHeight > height.current) {
            window.scrollBy(0, scrollHeight - height.current);
        }

        height.current = scrollHeight;
    }, [weeks]);

    // Reveals older weeks as the top of the stream comes into view, and fires
    // once on mount to load the first of them.
    useEffect(() => {
        const target = sentinel.current;

        if (target === null) {
            return;
        }

        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                loadMore();
            }
        }, { rootMargin: "200px" });

        observer.observe(target);

        return () => observer.disconnect();
    }, [loadMore]);

    return (
        <BasePage>
            <div className="wrapper lg-margin-top">
                <div ref={sentinel}></div>

                {error ? <p className="calendar-message">{error}</p> : null}
                {loading ? <p className="calendar-message">Loading...</p> : null}
                {allLoaded && !loading ? <p className="calendar-message">That's the whole journal.</p> : null}

                <div className="calendar-grid">
                    <div className="calendar-gutter calendar-sticky"></div>
                    {weekdays.map((weekday) => (
                        <div key={weekday} className="calendar-weekday calendar-sticky">{weekday}</div>
                    ))}

                    {weeks.map((week) => (
                        <React.Fragment key={week.key}>
                            <div className="calendar-gutter">
                                {week.label ?
                                    <>
                                        <span className="calendar-gutter-month">{monthShort.format(week.label)}</span>
                                        {week.showYear ? <span className="calendar-gutter-year">{week.label.getFullYear()}</span> : null}
                                    </> : null}
                            </div>
                            {week.days.map((day) => {

                                const key = dateToString(day.date);
                                const expanded = expandedDay === key;
                                const visible = expanded ? day.entries : day.entries.slice(0, stripesPerDay);
                                const hidden = day.entries.length - visible.length;

                                return (
                                    <div key={key} className={`calendar-day${day.inRange ? '' : ' calendar-day-muted'}${day.date.getDate() === 1 ? ' calendar-day-first' : ''}${equalsDate(day.date, today) ? ' calendar-day-today' : ''}`}>
                                        <Link to={`${writeRoute}/${key}`} className="calendar-day-number" title="Write an entry for this day">
                                            {day.date.getDate()}
                                        </Link>
                                        {visible.map((entry) => (
                                            <Link key={entry.id} to={viewRoute + entry.id} className="calendar-stripe"
                                                style={{ backgroundColor: getSentimentColor(entry) }}
                                                title={getEntryTitle(entry, userData)}>
                                                {getEntryTitle(entry, userData)}
                                            </Link>
                                        ))}
                                        {hidden > 0 ?
                                            <button className="calendar-more" onClick={() => setExpandedDay(key)}>
                                                +{hidden} more
                                            </button> : null}
                                        {expanded ?
                                            <button className="calendar-more" onClick={() => setExpandedDay(null)}>
                                                Show less
                                            </button> : null}
                                    </div>
                                );
                            })}
                        </React.Fragment>
                    ))}
                </div>
            </div>
        </BasePage>
    );
};
