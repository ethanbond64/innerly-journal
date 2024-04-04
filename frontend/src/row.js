import React, { useEffect, useState } from 'react';
import Moment from 'react-moment';
import { TextCard } from './cards/text-card.js';
import { BlankCard } from './cards/blank-card.js';
import { ImageCard } from './cards/image-card.js';
import { LinkCard } from './cards/link-card.js';

export const Row = ({ row, setImagePath }) =>  {

    const [entryGroups, setEntryGroups] = useState([]);
    // const [cardGroups, setCardGroups] = useState([]);

    const replace = (entry, index) => {
        console.log('replace', entry, index);
        setEntryGroups((prev) => {
            let outerIndex = Math.floor(index / 3);
            let innerIndex = index % 3;

            let newGroups = [...prev];
            let newGroup = [...newGroups[outerIndex]];
            newGroup[innerIndex] = entry;
            newGroups[outerIndex] = newGroup;
            return newGroups;
        });
        // setEntries((prev) => {
        //     let newEntries = [...prev];
        //     if (index >= newEntries.length) { 
        //         newEntries[index] = entry;
        //     } else {
        //         while (newEntries.length < index) {
        //             newEntries.push({ entry_type: 'blank' });
        //         }
        //         newEntries.push(entry);
        //     }
        //     return newEntries;
        // });
    };

    useEffect(() => {
        let localEntries = [...row.entries];

        if (localEntries.length === 0 || localEntries % 3 !== 0) {
            let required = 3 - (localEntries.length % 3);
            for (let i = 0; i < required; i++) {
                localEntries.push({ entry_type: 'blank' });
            }
        }

        let group = []
        let groups = [];
        let blanksRequired = true;

        for (let i = 0; i < localEntries.length; i++) {

            let entry = localEntries[i];
            
            if (entry.entry_type === 'blank') {
                blanksRequired = false;
            }
            
            if (group.length === 3) {
                groups.push(group);
                group = [];
            }

            group.push(entry);
        }

        if (group.length > 0 || blanksRequired) {
            
            let blanks = 3 - group.length;

            for (let i = 0; i < blanks; i++) {
                group.push({ entry_type: 'blank' });
            }

            groups.push(group);
        }


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

    // useEffect(() => {

    //     const createCard = (entry, replace) => {
    //         switch (entry.entry_type) {
    //             case "text":
    //                 return <TextCard entry={entry} />;
    //             case "file":
    //                 return <ImageCard entry={entry} setPath={setImagePath} replace={replace} />;
    //             case "link":
    //                 return <LinkCard entry={entry} replace={replace} />;
    //             default:  
    //                 return <BlankCard datetime={row.date} replace={replace} />;
    //         };
    //     };

    //     let localCards = entries.map((entry, i) => createCard(entry, (e) => replace(e, i)));
    //     let hasBlankEntry = entries.some(entry => entry.entry_type === 'blank');
    //     if (!hasBlankEntry) {
    //         let blanksRequired = 3 - (localCards.length % 3);
    //         if (localCards.length !== 0) {
    //             console.log('local ents', entries);
    //             console.log('blanks required', blanksRequired);
    //             console.log('local cards len', localCards.length);
    //         }
    //         for (let i = 0; i < blanksRequired; i++) {
    //             localCards.push(<BlankCard datetime={row.date} replace={e => replace(e, localCards.length)}/>);
    //         }
    //         console.log('local cards len', localCards.length);
    //     }   

    //     setCardGroups(Array.from({ length: Math.ceil(localCards.length / 3) }, (_, index) => localCards.slice(index * 3, index * 3 + 3)));
    // }, [row.date, setImagePath, entries])

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