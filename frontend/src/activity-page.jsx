import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BasePage } from "./base-page.jsx";
import { fetchActivity } from "./requests.js";
import { buildActivityWeeks, buildMonthLabels, buildWordScale, lightestMix, weeksShown, wordCountMix } from "./activity-grid.js";
import { writeRoute } from "./constants.js";
import { dateToString } from "./utils.jsx";

// Only every other weekday is labelled, the way GitHub does it, so the labels
// have room to breathe next to 12px cells.
const weekdayLabels = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

const monthShort = new Intl.DateTimeFormat('en-US', { month: 'short' });

const monthAndYear = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' });

const longDate = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

const sentimentModes = { sentiment: 'sentiment', words: 'words' };

// One block is a whole grid's worth of days, so anchoring that much further
// back each time gives blocks that abut without overlapping.
const blockDays = weeksShown * 7;

// Shades are mixed per day rather than picked from a handful of classes, so the
// scale is as fine-grained as the year's own spread of entry lengths.
const greenMix = (percent) => `color-mix(in srgb, var(--well-green) ${percent}%, transparent)`;

// The legend shows the same span the cells are mixed across.
const ramp = `linear-gradient(to right, ${greenMix(lightestMix)}, ${greenMix(100)})`;

const words = (count) => `${count.toLocaleString()} word${count === 1 ? '' : 's'}`;

const entries = (count) => `${count.toLocaleString()} ${count === 1 ? 'entry' : 'entries'}`;

const shiftBack = (date, blocks) => new Date(date.getFullYear(), date.getMonth(), date.getDate() - blocks * blockDays);

const newBlock = (anchor) => ({ key: dateToString(anchor), anchor: anchor, rows: null, error: null });

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

// One year of the grid: its own black panel, captioned with the span it covers
// and what was written in it.
const ActivityYear = ({ block, mode, scale }) => {

    const scroller = useRef(null);

    const months = useMemo(() => buildMonthLabels(block.weeks), [block.weeks]);

    // A year does not fit on a narrow screen, so each grid scrolls and starts
    // parked on its most recent week.
    useEffect(() => {
        if (scroller.current !== null) {
            scroller.current.scrollLeft = scroller.current.scrollWidth;
        }
    }, [block.weeks]);

    const first = block.weeks[0].days[0].date;
    const last = block.weeks[block.weeks.length - 1].days[6].date;
    const written = block.rows === null ? [] : block.rows;
    const total = written.reduce((sum, row) => sum + (row.words || 0), 0);

    return (
        <div className="activity-panel">

            <div className="activity-caption">
                <span className="activity-span">{monthAndYear.format(first)} &ndash; {monthAndYear.format(last)}</span>
                <span className="activity-totals">
                    {block.error !== null ? block.error : null}
                    {block.error === null && block.rows === null ? "Loading..." : null}
                    {block.error === null && block.rows !== null ? `${entries(written.length)}, ${words(total)}` : null}
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

                        <div className="activity-months">
                            {months.map((label) => (
                                <span key={label.column} className="activity-month" style={{ gridColumn: label.column + 1 }}>
                                    {monthShort.format(label.date)}
                                </span>
                            ))}
                        </div>

                        <div className="activity-grid">
                            {block.weeks.map((week) => week.days.map((day) => {

                                if (day.future) {
                                    return <div key={day.key} className="activity-cell activity-cell-future"></div>;
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

    // Fixed for the life of the page, so that every block is anchored to the
    // same day and the grids stay aligned with each other.
    const today = useMemo(() => new Date(), []);

    const [mode, setMode] = useState(sentimentModes.sentiment);
    const [blocks, setBlocks] = useState(() => [newBlock(today)]);
    const requested = useRef(new Set());

    const setBlock = useCallback((key, patch) => {
        setBlocks((current) => current.map((block) => block.key === key ? { ...block, ...patch } : block));
    }, []);

    // Each block fetches its own window once, the year it covers ending on its
    // anchor. Blocks already asked for are remembered so a re-render (or a
    // second pass in strict mode) does not fetch them again.
    useEffect(() => {
        blocks.forEach((block) => {

            if (requested.current.has(block.key)) {
                return;
            }

            requested.current.add(block.key);

            fetchActivity(blockDays, block.key, () => setBlock(block.key, { error: "Unable to load activity." }))
                .then((data) => {
                    if (data !== undefined) {
                        setBlock(block.key, { rows: data });
                    }
                });
        });
    }, [blocks, setBlock]);

    const years = useMemo(() => blocks.map((block) => ({
        ...block,
        weeks: buildActivityWeeks(block.rows === null ? [] : block.rows, block.anchor, today)
    })), [blocks, today]);

    // One scale across every year on the page, so the same shade means the same
    // thing in all of them.
    const scale = useMemo(() => buildWordScale(years.flatMap((year) => year.weeks)), [years]);

    const loading = blocks.some((block) => block.rows === null && block.error === null);

    const loadPrevious = () => setBlocks((current) => [...current, newBlock(shiftBack(today, current.length))]);

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
                    <ActivityYear key={year.key} block={year} mode={mode} scale={scale} />
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
