import React, { useState } from 'react';
import Moment from 'react-moment';
import { TextCard } from './cards/text-card';
import { BlankCard } from './cards/blank-card';
import { ImageCard } from './cards/image-card';
import { LinkCard } from './cards/link-card';

export const Row = ({ row, setImagePath }) =>  {

    const [entries, setEntries] = useState(row.entries);

    const createCard = (entry, replace) => {
        switch (entry.entry_type) {
            case "text":
                return <TextCard entry={entry} />;
            case "file":
                return <ImageCard entry={entry} setPath={setImagePath} />;
            case "link":
                return <LinkCard entry={entry} />;
            default:  
                return <BlankCard datetime={row.date} replace={replace} />;
        };
    };

    const replace = (entry, offset) => {
        setEntries((prev) => {
            let newEntries = [...prev];
            for (let i = 0; i < offset; i++) {
                newEntries.push({ entry_type: 'blank' });
            }
            newEntries.push(entry);
            return newEntries;
        });
    };

    const cards = entries.map((entry, i) => createCard(entry, (e) => replace(e, i)));

    let hasBlankEntry = entries.some(entry => entry.entry_type == 'blank');
    let blanksRequired = cards.length % 3 == 0 && !hasBlankEntry ? 3 : 3 - (cards.length % 3);
    for (let i = 0; i < blanksRequired; i++) {
        cards.push(<BlankCard datetime={row.date} replace={e => replace(e, i)}/>);
    }

    let cardGroups = Array.from({ length: Math.ceil(cards.length / 3) }, (_, index) => cards.slice(index * 3, index * 3 + 3));

    return cardGroups.map((cards, i) => (
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
                        {cards.map((card) => card)}
                    </div>
                </div>
            </div>
        </div>
    ));
}