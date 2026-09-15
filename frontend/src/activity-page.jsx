import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "./router.jsx";
import { BasePage } from "./base-page.jsx";
import { fetchActivity } from "./requests.js";
import { buildMonthLabels, buildWordScale, buildYearWeeks, isDrawn, lightestMix, wordCountMix, yearWindow } from "./activity-grid.js";
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

// The sentiment legend, in the order it reads.
const sentimentKeys = [['negative', 'Negative'], ['positive', 'Positive'], ['neutral', 'Neutral']];

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
const ActivityYear = ({ block, mode, scale, today, current }) => {

    const scroller = useRef(null);

    const months = useMemo(() => buildMonthLabels(block.weeks, today), [block.weeks, today]);

    const todayKey = dateToString(today);

    // A year does not fit on a narrow screen, so each grid scrolls: a finished
    // year opens on January, the year in progress on today.
    useEffect(() => {

        const target = scroller.current;

        if (target === null || !current) {
            return;
        }

        const cell = target.querySelector('.activity-cell-today');

        if (cell !== null) {
            target.scrollLeft = cell.offsetLeft + cell.offsetWidth - target.clientWidth;
        }
    }, [block.weeks, current]);

    // Counted from the days actually drawn, so the caption always agrees with
    // the grid rather than with whatever the fetch happened to return.
    const drawn = block.weeks.flatMap((week) => week.days).filter(isDrawn);
    const written = drawn.reduce((sum, day) => sum + day.entries, 0);
    const total = drawn.reduce((sum, day) => sum + day.words, 0);
    const caption = block.error || (block.rows === undefined ? "Loading..." : `${entries(written)}, ${words(total)}`);

    return (
        <div className="activity-panel">

            <div className="activity-caption">
                <span className="activity-span">{block.year}</span>
                <span>{caption}</span>
            </div>

            <div className="activity-scroll" ref={scroller}>
                <div className="activity-chart">

                    <div className="activity-weekdays">
                        <div></div>
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

                                if (!isDrawn(day)) {
                                    return <div key={day.key} className="activity-cell activity-cell-blank"></div>;
                                }

                                const mix = mode === sentimentModes.words ? wordCountMix(day.words, scale) : null;
                                const shade = mode === sentimentModes.words || day.entries === 0 ? '' : ` activity-${day.sentiment}`;
                                const className = `activity-cell${shade}${day.key === todayKey ? ' activity-cell-today' : ''}`;

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
    const [shown, setShown] = useState(() => [today.getFullYear()]);
    const [loaded, setLoaded] = useState({});
    const requested = useRef(new Set());

    // Each year fetches its own window once. Years already asked for are
    // remembered so a re-render (or a second pass in strict mode) does not
    // fetch them again.
    useEffect(() => {
        shown.forEach((year) => {

            if (requested.current.has(year)) {
                return;
            }

            requested.current.add(year);

            const { days, before } = yearWindow(year, today);
            const store = (state) => setLoaded((current) => ({ ...current, [year]: state }));

            fetchActivity(days, before, () => store({ error: "Unable to load activity." }))
                .then((rows) => rows === undefined || store({ rows: rows }));
        });
    }, [shown, today]);

    const blocks = useMemo(() => shown.map((year) => ({
        year: year,
        ...loaded[year],
        weeks: buildYearWeeks(loaded[year]?.rows || [], year, today)
    })), [shown, loaded, today]);

    // One scale across every year on the page, so the same shade means the same
    // thing in all of them.
    const scale = useMemo(() => buildWordScale(blocks.flatMap((block) => block.weeks)), [blocks]);

    const loading = shown.some((year) => loaded[year] === undefined);

    const loadPrevious = () => setShown((current) => [...current, current[current.length - 1] - 1]);

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

                {blocks.map((block) => (
                    <ActivityYear key={block.year} block={block} mode={mode} scale={scale} today={today}
                        current={block.year === today.getFullYear()} />
                ))}

                <div className="activity-panel activity-legend-panel">
                    <div className="activity-legend">
                        {mode === sentimentModes.words ?
                            <>
                                <span className="activity-cell"></span>
                                <span className="activity-legend-label">Nothing written</span>
                                <span className="activity-legend-label">{scale.length > 0 ? scale[0] : 0}</span>
                                <span className="activity-legend-ramp" style={{ backgroundImage: ramp }}></span>
                                <span className="activity-legend-label">{words(scale[scale.length - 1] || 0)}</span>
                            </> :
                            <>
                                {sentimentKeys.map(([key, label]) => (
                                    <React.Fragment key={key}>
                                        <span className={`activity-cell activity-${key}`}></span>
                                        <span className="activity-legend-label">{label}</span>
                                    </React.Fragment>
                                ))}
                                <span className="activity-cell"></span>
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
