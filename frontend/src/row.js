import React, { useState } from 'react';
import Moment from 'react-moment';
import { TextCard } from './cards/text-card';
import { BlankCard } from './cards/blank-card';

export const Row = ({ row }) =>  {

    const [index, setIndex] = useState(0);

    const onClickPrevious = () => {
        setIndex(index - 1);
    }

    const onClickNext = () => {
        setIndex(index + 1);
    }

    let cards = row.entries.map((entry) => {
         switch (entry.entry_type) {
            case "text":
                return <TextCard {...entry} />;
            // case "media":
            //     return <Mediacard {...entry} />;
            // case "link":
            //     return <Mediacard {...entry} />;
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
                        {/* {
                            isToday ? <Blankcard today={true} rowidx={0} startidx={this.state.startIdx} nsiblings={filterEnts.length + isToday} isodate={this.props.isodate} /> : <div style={{ display: 'none' }}></div>
                        }
                        {
                            filterEnts.map((entdata, i) => (
                                entdata.media ? <Mediacard {...entdata} rowidx={i + isToday} startidx={this.state.startIdx} nsiblings={filterEnts.length + isToday} /> : <Textcard {...entdata} rowidx={i} startidx={this.state.startIdx} nsiblings={filterEnts.length + isToday} />
                            ))
                        }
                        {
                            (filterEnts.length > (2 - isToday)) ? <Blankcard rowidx={filterEnts.length + isToday} startidx={this.state.startIdx} nsiblings={filterEnts.length + isToday} isodate={this.props.isodate} />
                                : Array.from(Array(3 - (filterEnts.length + isToday)).keys()).map((el, i) => (
                                    <Blankcard rowidx={filterEnts.length + i + isToday} startidx={this.state.startIdx} nsiblings={filterEnts.length + isToday} isodate={this.props.isodate} />
                                ))
                        } */}
                        <span className="nextBtn" onClick={onClickNext} >&#10095;</span>
                    </div>
                </div>
            </div>
        </div>
    );
}