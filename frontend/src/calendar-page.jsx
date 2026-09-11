import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BasePage } from "./base-page.jsx";
import { useEntryStream } from "./use-entry-stream.js";
import { getEntryTitle, getSentimentColor } from "./entry-display.js";
import { formatMonthYear } from "./date-format.js";
import { dateToString, equalsDate, getUserData } from "./utils.jsx";
import { viewRoute, writeRoute } from "./constants.js";

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Stripes shown before a day collapses into a "+N more" toggle.
const stripesPerDay = 4;

export const CalendarPage = () => {

    const { months, loading, allLoaded, error, loadMore } = useEntryStream();
    const [expandedDay, setExpandedDay] = useState(null);
    const sentinel = useRef(null);

    const today = new Date();
    const userData = getUserData();

    // Reveals older months as the bottom of the stream comes into view, and
    // fires once on mount to load the first one.
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
                {months.map((month) => (
                    <div key={`${month.year}-${month.month}`} className="calendar-month">
                        <h3 className="calendar-title">{formatMonthYear(new Date(month.year, month.month, 1))}</h3>
                        <div className="calendar-grid">
                            {weekdays.map((weekday) => (
                                <div key={weekday} className="calendar-weekday">{weekday}</div>
                            ))}
                            {buildWeeks(month.year, month.month, month.entries).map((week) => week.map((day) => {

                                const key = dateToString(day.date);
                                const expanded = expandedDay === key;
                                const visible = expanded ? day.entries : day.entries.slice(0, stripesPerDay);
                                const hidden = day.entries.length - visible.length;

                                return (
                                    <div key={key} className={`calendar-day${day.inMonth ? '' : ' calendar-day-muted'}${equalsDate(day.date, today) ? ' calendar-day-today' : ''}`}>
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
                            }))}
                        </div>
                    </div>
                ))}

                {error ? <p className="calendar-message">{error}</p> : null}
                {loading ? <p className="calendar-message">Loading...</p> : null}
                {allLoaded && !loading ? <p className="calendar-message">That's the whole journal.</p> : null}

                <div ref={sentinel}></div>
            </div>
        </BasePage>
    );
};

// Lays a month out as whole weeks starting on Sunday, with each day carrying
// its own entries in chronological order.
const buildWeeks = (year, month, entries) => {

    const byDay = new Map();
    entries.forEach((entry) => {
        const key = dateToString(new Date(entry.functional_datetime));
        const day = byDay.get(key);
        if (day) {
            day.push(entry);
        } else {
            byDay.set(key, [entry]);
        }
    });

    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const weekCount = Math.ceil((firstWeekday + daysInMonth) / 7);
    const gridStart = new Date(year, month, 1 - firstWeekday);

    const weeks = [];

    for (let week = 0; week < weekCount; week++) {

        const days = [];

        for (let weekday = 0; weekday < 7; weekday++) {
            const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + week * 7 + weekday);
            days.push({
                date: date,
                inMonth: date.getMonth() === month && date.getFullYear() === year,
                entries: byDay.get(dateToString(date)) || []
            });
        }

        weeks.push(days);
    }

    return weeks;
};
