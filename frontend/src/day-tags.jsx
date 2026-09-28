import React, { useEffect, useState } from "react";
import { deleteDateTag, fetchDateTags, insertDateTag } from "./requests.js";
import { capitalize, ClickOutsideTracker, dateToString, getDateNoTime } from "./utils.jsx";

//
// Tags on the day itself, with no entry behind them. The add button is revealed by
// hovering the row, unless open, which is how today's row and the day page keep it out.
//
export const DayTags = ({ date, dayTags, open = false }) => {

    const [adding, setAdding] = useState(false);

    if (!dayTags) {
        return null;
    }

    const key = dateToString(date);
    const tags = dayTags.byDay[key] || [];

    // Row dates carry the time of whatever entry started them, so the day is taken back to
    // the 23:59 local the entries are stored at, or a day could hold the same tag twice.
    const functionalDatetime = () =>
        getDateNoTime(date.getFullYear(), date.getMonth(), date.getDate()).toISOString();

    const onAdd = (name) => {
        setAdding(false);
        insertDateTag(name, functionalDatetime(), (tag) => dayTags.add(key, tag));
    };

    const onRemove = (tag) => {
        if (window.confirm(`Remove "${capitalize(tag.name)}" from this day?`)) {
            deleteDateTag(tag.id, () => dayTags.remove(key, tag.id));
        }
    };

    return (
        <div className={`day-tags${open ? ' day-tags-open' : ''}`}>
            {tags.map((tag) => (
                <span key={tag.id} className="day-tag">
                    {capitalize(tag.name)}
                    <button className="day-tag-remove" onClick={() => onRemove(tag)}>&times;</button>
                </span>
            ))}
            {adding ?
                <DayTagPicker onPick={onAdd} clear={() => setAdding(false)} /> :
                <button className="day-tag-add" onClick={() => setAdding(true)}>+ tag</button>
            }
        </div>
    );
};

const DayTagPicker = ({ onPick, clear }) => {

    const [search, setSearch] = useState("");
    const [options, setOptions] = useState([]);

    useEffect(() => {
        fetchDateTags(search).then((tags) => tags === undefined || setOptions(tags));
    }, [search]);

    return (
        <ClickOutsideTracker callback={clear}>
            <div className="day-tag-picker">
                <input className="day-tag-input" autoFocus value={search} placeholder="Tag this day"
                    onChange={(event) => setSearch(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' && search.trim().length > 0) {
                            onPick(search);
                        } else if (event.key === 'Escape') {
                            clear();
                        }
                    }} />
                {options.length > 0 &&
                    <div className="day-tag-options">
                        {options.map((tag) => (
                            <button key={tag.id} className="day-tag-option" onClick={() => onPick(tag.name)}>
                                {capitalize(tag.name)}
                            </button>
                        ))}
                    </div>
                }
            </div>
        </ClickOutsideTracker>
    );
};
