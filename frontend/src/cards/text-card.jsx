import React from "react";
import { Link } from "../router.jsx";
import { getUserData } from "../utils.jsx";
import { getEntryTitle, getSentimentColor } from "../entry-display.js";

export const TextCard = ({ entry }) => {

    const userData = getUserData();

    let sensitive = userData && userData.settings && (userData.settings.sensitivity === 'blur' ||userData.settings.sensitivity === 'both' );
    const title = getEntryTitle(entry, userData);
    const color = getSentimentColor(entry);
    const preview = entry.entry_data && entry.entry_data.text ? entry.entry_data.text : "";
    const locked = entry.entry_data && entry.entry_data.locked === true;
    const tags = entry.tags;


    return (
        <Link to={`/view/${entry.id}`}>
            <div className={`col-xs-4 itemactive`}>
                <div className={`well swell entryLoaded`} id="unit" style={{ cursor: 'pointer', backgroundColor: color }}>
                    <h3 id="unitTitle">{title}</h3>
                    {locked && <span className="fa fa-lock" style={{ color: "var(--dm-text)", fontSize: "20px"}}></span>}
                    <p id="unitSnip" className="hidden-xs"
                        style={sensitive ? { 'color': 'transparent', 'textShadow': '0 0 6px var(--dm-text)', 'padding': '2px' } : {}} >
                        {preview}
                    </p>
                    <span id="unitTopics">
                        {tags ? tags.map((topic, i) => ((i === tags.length - 1 || tags.length  === 1  ? topic : `${topic} | `))) : null}
                    </span>
                </div>
            </div>
        </Link>
    );
};
