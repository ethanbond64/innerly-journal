import React, { useEffect, useState } from 'react';
import Moment from 'react-moment';
import { TextCard } from './cards/text-card.js';
import { BlankCard } from './cards/blank-card.js';
import { ImageCard } from './cards/image-card.js';
import { LinkCard } from './cards/link-card.js';

export const Row = ({ row, setImagePath }) =>  {

    const [entryGroups, setEntryGroups] = useState([]);

    const replace = (entry, index) => {
        console.log('replace', entry, index);
        setEntryGroups((prev) => {

            let outerIndex = Math.floor(index / 3);
            let innerIndex = index % 3;
            let newGroups = [...prev];
            let newGroup = [...newGroups[outerIndex]];

            newGroup[innerIndex] = entry;
            newGroups[outerIndex] = newGroup;

            return padGroups(newGroups);
        });
    };

    useEffect(() => {

        let group = []
        let groups = [];
        let blanksRequired = true;
        let localEntries = [...row.entries];

        for (let i = 0; i < localEntries.length; i++) {

            let entry = localEntries[i];
            blanksRequired = blanksRequired && entry.entry_type !== 'blank'
            
            if (group.length === 3) {
                groups.push(group);
                group = [];
            }

            group.push(entry);
        }

        //
        // Pad the final group with blanks if incomplete.
        //
        if (group.length > 0 || blanksRequired) {
            let blanks = 3 - group.length;
            for (let i = 0; i < blanks; i++) {
                group.push({ entry_type: 'blank' });
            }
            groups.push(group);
        }

        groups = padGroups(groups);

        setEntryGroups(groups);
    }, [row.entries]);

    const createCard = (entry, replace) => {
        switch (entry.entry_type) {
            case "text":
                return <TextCard entry={entry} />;
            case "file":
                return <ImageCard entry={entry} setPath={setImagePath} replace={replace} />;
            case "link":
                return <LinkCard entry={entry} replace={replace} />;
            default:  
                return <BlankCard datetime={row.date} replace={replace} />;
        }
    };

    return entryGroups.map((entries, i) => (
        <div className={`well owell`} style={{ marginBottom: "0px" }}>
            <div className={`row animated fadeIn shadow-sm`}>
                <div className="col-sm-3">
                    { i > 0 ? 
                        null :
                        <h3 id="title" className="datelabel" >
                            <Moment date={row.date} format="MMMM Do, YYYY" />
                        </h3>
                    }
                </div>
                <div className="col-sm-8">
                    <div className="row" id="day_carousel">
                        {entries.map((entry, j) => createCard(entry, (e) => replace(e, i * 3 + j)))}
                    </div>
                </div>
            </div>
        </div>
    ));
}

const padGroups = (groups) => {
    console.log('padGroups', groups);
    let containsBlanks = groups.some((group) => group.some((entry) => entry.entry_type === 'blank'));
    if (!containsBlanks) {
        let newGroup = [];
        for (let i = 0; i < 3; i++) {
            newGroup.push({ entry_type: 'blank' });
        }
        groups.push(newGroup);
    }
    return groups;
}