import React from "react";
import Moment from 'react-moment';
import { useNavigate } from "react-router-dom";
import { equalsDate, getUserData } from "../utils";

export const TextCard = ({ entry }) => {

    const navigate = useNavigate();
    const userData = getUserData();

    let sensitive = userData && userData.settings && (userData.settings.sensitivity === 'blur' ||userData.settings.sensitivity === 'both' );
    let sensitiveTitle = userData && userData.settings && userData.settings.sensitivity === 'both';
    let title = !sensitiveTitle && entry.entry_data && entry.entry_data.title ? entry.entry_data.title : null;
        
    if (title === null) {
        let functionalDate = new Date(entry.functional_datetime);
        let memory = !equalsDate(functionalDate, new Date(entry.created_on));

        title = memory && !sensitiveTitle ? "Untitled Memory" : (<Moment date={functionalDate} format="h A" />)
    }

    const color = getColor(entry.entry_data.sentiment);
    const preview = entry.entry_data && entry.entry_data.text ? entry.entry_data.text : "";
    const tags = entry.tags;


    const onClick = () => {
        navigate(`/view/${entry.id}`);
    }

    return (
        <div className={`col-xs-4 itemactive`}>
        <div className={`well swell entryLoaded`} id="unit" style={{ cursor: 'pointer', backgroundColor: color }} onClick={onClick}>
            <h3 id="unitTitle">{title}</h3>
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
};

const getColor = (sentiment) => {
    if (sentiment === 'positive') {
        return 'var(--well-green)';
    } else if (sentiment === 'negative') {
        return 'var(--well-red)';
    } else {
        return 'var(--well-grey)';
    }
};
