import React, { useEffect, useState } from 'react';
import { Link } from './router.jsx';
import { formatLongDate } from './date-format.js';
import { dayRoute } from './constants.js';
import { MemoriesModal } from './memories-modal.jsx';
import { dateToString } from './utils.jsx';
import { TextCard } from './cards/text-card.jsx';
import { BlankCard } from './cards/blank-card.jsx';
import { ImageCard } from './cards/image-card.jsx';
import { LinkCard } from './cards/link-card.jsx';

export const Row = ({ row, setImagePath, label = null, minGroups = 0, linkDay = true, memories = [] }) =>  {

    const [entryGroups, setEntryGroups] = useState([]);
    const [showMemories, setShowMemories] = useState(false);

    const replace = (entry, index) => {
        setEntryGroups((prev) => {

            let outerIndex = Math.floor(index / 3);
            let innerIndex = index % 3;
            let newGroups = [...prev];
            let newGroup = [...newGroups[outerIndex]];

            newGroup[innerIndex] = entry;
            newGroups[outerIndex] = newGroup;

            return padGroups(newGroups, minGroups);
        });
    };

    useEffect(() => {

        let group = []
        let groups = [];
        let blanksRequired = true;
        // Text entries always come first
        let localEntries = [...row.entries].sort((a, b) => textFirst(a) - textFirst(b));

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

        groups = padGroups(groups, minGroups);

        setEntryGroups(groups);
    }, [row.entries, minGroups]);

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
            { i === 0 && showMemories ?
                <MemoriesModal date={row.date} years={memories}
                    clear={() => setShowMemories(false)} /> :
                null
            }
            <div className={`row animated fadeIn shadow-sm`}>
                <div className="col-sm-3">
                    { i > 0 ? 
                        null :
                        <h3 id="title" className="datelabel" >
                            { linkDay ?
                                <Link className="datelabel-link" to={dayRoute + dateToString(row.date)}>
                                    {label === null ? formatLongDate(row.date) : label}
                                </Link> :
                                (label === null ? formatLongDate(row.date) : label)
                            }
                            { memories.length > 0 ?
                                <button type="button" className="memory-badge"
                                    onClick={() => setShowMemories(true)}>Memories</button> :
                                null
                            }
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

const textFirst = (entry) => entry.entry_type === 'text' ? 0 : 1;

const blankGroup = () => {
    let group = [];
    for (let i = 0; i < 3; i++) {
        group.push({ entry_type: 'blank' });
    }
    return group;
}

//
// There is always somewhere to add to: one group of blanks if every card is
// taken. minGroups then holds the row open to a minimum height, which the day
// page uses so a sparse day still fills the page.
//
const padGroups = (groups, minGroups = 0) => {
    let containsBlanks = groups.some((group) => group.some((entry) => entry.entry_type === 'blank'));
    if (!containsBlanks) {
        groups.push(blankGroup());
    }
    while (groups.length < minGroups) {
        groups.push(blankGroup());
    }
    return groups;
}