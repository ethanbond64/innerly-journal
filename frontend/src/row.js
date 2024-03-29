import React, { useState } from 'react';
import Moment from 'react-moment';
import { TextCard } from './cards/text-card';
import { BlankCard } from './cards/blank-card';
import { ImageCard } from './cards/image-card';
import { LinkCard } from './cards/link-card';

export const Row = ({ row }) =>  {

    const [index, setIndex] = useState(0);

    const onClickPrevious = () => {
        setIndex(index - 1);
    }

    const onClickNext = () => {
        setIndex(index + 1);
    }

    const cards = row.entries.map((entry) => {
         switch (entry.entry_type) {
            case "text":
                return <TextCard entry={entry} />;
            case "file":
                return <ImageCard entry={entry} />;
            case "link":
                return <LinkCard entry={entry} />;
            default:  
                return <div>TODO</div>;
        }  
    });

    while (cards.length < 3) {
        cards.push(<BlankCard />);
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