import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BasePage } from "./base-page.jsx";
import { fetchActivity } from "./requests.js";
import { buildMonthLabels, buildWordScale, buildYearWeeks, lightestMix, wordCountMix, yearRange } from "./activity-grid.js";
import { writeRoute } from "./constants.js";
import { dateToString } from "./utils.jsx";

// Only every other weekday is labelled, the way GitHub does it, so the labels
// have room to breathe next to 12px cells.
const weekdayLabels = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

const monthShort = new Intl.DateTimeFormat('en-US', { month: 'short' });

const longDate = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

const sentimentModes = { sentiment: 'sentiment', words: 'words' };

// Shades are mixed per day rather than picked from a handful of classes, so the
// scale is as fine-grained as the year's own spread of entry lengths.
const greenMix = (percent) => `color-mix(in srgb, var(--well-green) ${percent}%, transparent)`;

// The legend shows the same span the cells are mixed across.
const ramp = `linear-gradient(to right, ${greenMix(lightestMix)}, ${greenMix(100)})`;

const words = (count) => `${count.toLocaleString()} word${count === 1 ? '' : 's'}`;

const entries = (count) => `${count.toLocaleString()} ${count === 1 ? 'entry' : 'entries'}`;

const newBlock = (year) => ({ key: String(year), year: year, rows: null, error: null });

// Days between two dates, inclusive of both, which is the window a year's
// entries are fetched for.
const daysBetween = (from, to) => Math.round((to - from) / 86400000) + 1;

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

// One calendar year of the grid: its own black panel, captioned with the year
// and what was written in it.
const ActivityYear = ({ block, mode, scale, current }) => {

    const scroller = useRef(null);

    const months = useMemo(() => buildMonthLabels(block.weeks), [block.weeks]);

    // A year does not fit on a narrow screen, so each grid scrolls. The year in
    // progress opens parked on today; a finished one opens on January.
    useEffect(() => {
        if (scroller.current !== null && current) {
            scroller.current.scrollLeft = scroller.current.scrollWidth;
        }
    }, [block.weeks, current]);

    // Counted from the days actually drawn, so the caption always agrees with
    // the grid rather than with whatever the fetch happened to return.
    const drawn = block.weeks.flatMap((week) => week.days).filter((day) => !day.outside);
    const written = drawn.reduce((sum, day) => sum + day.entries, 0);
    const total = drawn.reduce((sum, day) => sum + day.words, 0);

    return (
        <div className="activity-panel">

            <div className="activity-caption">
                <span className="activity-span">{block.year}</span>
                <span className="activity-totals">
                    {block.error !== null ? block.error : null}
                    {block.error === null && block.rows === null ? "Loading..." : null}
                    {block.error === null && block.rows !== null ? `${entries(written)}, ${words(total)}` : null}
                </span>
            </div>

            <div className="activity-scroll" ref={scroller}>
                <div className="activity-chart">

                    <div className="activity-weekdays">
                        <div className="activity-months-spacer"></div>
                        {weekdayLabels.map((label, weekday) => (
                            <div key={weekday} className="activity-weekday">{label}</div>
                        ))}
                    </div>

                    <div className="activity-columns">

                        <div className="activity-months"
                            style={{ gridTemplateColumns: `repeat(${block.weeks.length}, var(--activity-cell))` }}>
                            {months.map((label) => (
                                <span key={label.column} className="activity-month" style={{ gridColumn: label.column + 1 }}>
                                    {monthShort.format(label.date)}
                                </span>
                            ))}
                        </div>

                        <div className="activity-grid">
                            {block.weeks.map((week) => week.days.map((day) => {

                                if (day.outside) {
                                    return <div key={day.key} className="activity-cell activity-cell-blank"></div>;
                                }

                                const mix = mode === sentimentModes.words ? wordCountMix(day.words, scale) : null;
                                const className = mode === sentimentModes.words
                                    ? `activity-cell${mix === null ? ' activity-empty' : ''}`
                                    : `activity-cell activity-${day.entries === 0 ? 'empty' : day.sentiment}`;

                                return (
                                    <Link key={day.key} to={`${writeRoute}/${day.key}`} className={className}
                                        style={mix === null ? undefined : { backgroundColor: greenMix(mix) }}
                                        title={dayTitle(day, mode)}></Link>
                                );
                            }))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const ActivityPage = () => {

    // Fixed for the life of the page, so the year in progress does not grow a
    // column underneath the user at midnight.
    const today = useMemo(() => new Date(), []);

    const [mode, setMode] = useState(sentimentModes.sentiment);
    const [blocks, setBlocks] = useState(() => [newBlock(today.getFullYear())]);
    const requested = useRef(new Set());

    const setBlock = useCallback((key, patch) => {
        setBlocks((current) => current.map((block) => block.key === key ? { ...block, ...patch } : block));
    }, []);

    // Each block fetches its own calendar year once, ending at December 31st or
    // at today for the year in progress. Blocks already asked for are remembered
    // so a re-render (or a second pass in strict mode) does not fetch them again.
    useEffect(() => {
        blocks.forEach((block) => {

            if (requested.current.has(block.key)) {
                return;
            }

            requested.current.add(block.key);

            const { from, to } = yearRange(block.year, today);

            fetchActivity(daysBetween(from, to), dateToString(to), () => setBlock(block.key, { error: "Unable to load activity." }))
                .then((data) => {
                    if (data !== undefined) {
                        setBlock(block.key, { rows: data });
                    }
                });
        });
    }, [blocks, setBlock, today]);

    const years = useMemo(() => blocks.map((block) => ({
        ...block,
        weeks: buildYearWeeks(block.rows === null ? [] : block.rows, block.year, today)
    })), [blocks, today]);

    // One scale across every year on the page, so the same shade means the same
    // thing in all of them.
    const scale = useMemo(() => buildWordScale(years.flatMap((year) => year.weeks)), [years]);

    const loading = blocks.some((block) => block.rows === null && block.error === null);

    const loadPrevious = () => setBlocks((current) => [...current, newBlock(current[current.length - 1].year - 1)]);

    return (
        <BasePage>
            <div className="wrapper lg-margin-top">

                <div className="activity-header">
                    <h4 className="activity-title">Activity</h4>
                    <div className="activity-modes">
                        <button className={`activity-mode${mode === sentimentModes.sentiment ? ' activity-mode-on' : ''}`}
                            onClick={() => setMode(sentimentModes.sentiment)}>Sentiment</button>
                        <button className={`activity-mode${mode === sentimentModes.words ? ' activity-mode-on' : ''}`}
                            onClick={() => setMode(sentimentModes.words)}>Word count</button>
                    </div>
                </div>

                {years.map((year) => (
                    <ActivityYear key={year.key} block={year} mode={mode} scale={scale}
                        current={year.year === today.getFullYear()} />
                ))}

                <div className="activity-panel activity-legend-panel">
                    <div className="activity-legend">
                        {mode === sentimentModes.words ?
                            <>
                                <span className="activity-cell activity-empty"></span>
                                <span className="activity-legend-label">Nothing written</span>
                                <span className="activity-legend-label">{scale.length > 0 ? scale[0] : 0}</span>
                                <span className="activity-legend-ramp" style={{ backgroundImage: ramp }}></span>
                                <span className="activity-legend-label">
                                    {words(scale.length > 0 ? scale[scale.length - 1] : 0)}
                                </span>
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

                <div className="activity-actions">
                    <button className="activity-more" onClick={loadPrevious} disabled={loading}>
                        {loading ? "Loading..." : "Load previous year"}
                    </button>
                </div>
            </div>
        </BasePage>
    );
};
