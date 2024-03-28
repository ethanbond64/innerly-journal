import React from "react";  


export const TextCard = ({ entry }) => {

    let sensitive = false;
    let snippet = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed ac purus sit amet";
    let topics = ["Topic 1", "Topic 2"];

    const onClick = () => {
        console.log("Clicked on text card");
    }

    return (
        <div className={`col-xs-3 col-xs-4 itemactive`}>
        <div className={`well swell entryLoaded`} id="unit" style={{ cursor: 'pointer' }} onClick={onClick}>
            <h3 id="unitTitle">{entry && entry.entry_data ? entry.entry_data.title : "Untitled"}</h3>
            <p id="unitSnip" className="hidden-xs"
                style={sensitive ? { 'color': 'transparent', 'textShadow': '0 0 6px var(--dm-text)', 'padding': '2px' } : {}} >
                {snippet}
            </p>
            <span id="unitTopics">
                {(topics.length === 1) ?
                    `${topics[0]}` :
                    topics.map((topic, i) => (
                        (i === topics.length - 1) ? `${topic}` : `${topic} | `
                    )
                )}
            </span>
        </div>
    </div>
    );
}