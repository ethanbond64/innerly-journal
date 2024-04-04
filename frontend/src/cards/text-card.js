import React from "react";
import { useNavigate } from "react-router-dom";

export const TextCard = ({ entry }) => {

    let sensitive = false;
    const preview = entry.entry_data && entry.entry_data.text ? entry.entry_data.text : "";
    const tags = entry.tags;
    const navigate = useNavigate();

    const onClick = () => {
        navigate(`/view/${entry.id}`);
    }

    return (
        <div className={`col-xs-4 itemactive`}>
        <div className={`well swell entryLoaded`} id="unit" style={{ cursor: 'pointer' }} onClick={onClick}>
            <h3 id="unitTitle">{entry && entry.entry_data ? entry.entry_data.title : "Untitled"}</h3>
            <p id="unitSnip" className="hidden-xs"
                style={sensitive ? { 'color': 'transparent', 'textShadow': '0 0 6px var(--dm-text)', 'padding': '2px' } : {}} >
                {preview}
            </p>
            <span id="unitTopics">
                {tags ? tags.map((topic, i) => ((i === tags.length - 1 || tags.length  === 1  ? topic : `${topic} | `))) : null}
            </span>
        </div>
    </div>
    );
}