import React, { useState } from 'react';
import Moment from 'react-moment';
import { TextCard } from './cards/text-card';
import { BlankCard } from './cards/blank-card';
import { ImageCard } from './cards/image-card';
import { LinkCard } from './cards/link-card';

export const Row = ({ row, setImagePath }) =>  {

    const [index, setIndex] = useState(0);
    const [entries, setEntries] = useState(row.entries);

    const onClickPrevious = () => {
        setIndex(index - 1);
    }

    const onClickNext = () => {
        setIndex(index + 1);
    }

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

    const replace = (entry, i) => {
        console.log("replace called", i, entry)
        setEntries((prev) => {
            return [...prev, entry];
        });
    };

    const cards = entries.map((entry, i) => createCard(entry, (e) => replace(e, i)));

    let i = cards.length;
    while (cards.length < 3) {
        const idx = i;
        cards.push(<BlankCard datetime={row.date} replace={e => replace(e, idx)}/>);
        i++;
    }

    return (
        <div className={`well owell`} style={{ marginBottom: "0px" }}>
            <div className={`row animated fadeIn shadow-sm`}>
                <div className="col-sm-3">
                    <h3 id="title" className="datelabel" >
                        <Moment date={row.date} format="MMMM Do, YYYY" />
                    </h3>
                </div>
                <div className="col-sm-8">
                    <div className="row" id="day_carousel">
                        <span className="prevBtn" onClick={onClickPrevious} >&#10094;</span>
                        {cards.map((card) => card)}
                        <span className="nextBtn" onClick={onClickNext} >&#10095;</span>
                    </div>
                </div>
            </div>
        </div>
    );
}