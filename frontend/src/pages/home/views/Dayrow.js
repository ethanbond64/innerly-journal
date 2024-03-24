import React from "react";
import Mediacard from "../cards/Mediacard";
import Textcard from "../cards/Textcard";
import moment from "moment";
import Blankcard from "../cards/Blankcard";

class Dayrow extends React.Component {

    constructor(props) {
        super(props);
        this.state = { startIdx: 0, filter: this.props.filter, nShown: this.props.ents.length };
        this.onClickNext = this.onClickNext.bind(this);
        this.onClickPrev = this.onClickPrev.bind(this);
    }

    componentWillReceiveProps(nextProps) {
        this.setState({ filter: nextProps.filter });
    }


    onClickNext() {
        if (this.state.startIdx + 3 <= this.state.nShown) {
            this.setState(prevState => ({
                startIdx: (prevState.startIdx + 1)
            }));
        }
    }

    onClickPrev() {
        if (this.state.startIdx > 0) {
            this.setState(prevState => ({
                startIdx: (prevState.startIdx - 1)
            }));
        }
    }

    render() {

        let filterEnts = [];
        let today = new Date();
        let today_iso = today.toISOString().split('T')[0];

        let isToday = (this.props.isodate === today_iso);

        this.props.ents.forEach((entdata, i) => {
            if (this.state.filter === "all") {
                filterEnts.push(entdata);
            } else if (this.state.filter === "text" && entdata.media === null) {
                filterEnts.push(entdata);
            } else if (entdata.media !== null && entdata.media.type === this.state.filter) {
                // All links filter and photo filter
                filterEnts.push(entdata);
            } else if (entdata.media !== null && entdata.media.site === this.state.filter) {
                filterEnts.push(entdata);
            }
        });

        if (filterEnts.length === 0 && this.props.isodate !== today_iso && !this.props.fromexp) {
            return (<div style={{ display: 'none' }}></div>);
        }

        return (
            <div className={`well owell`} style={{ marginBottom: "0px" }}>
                <div className={`row animated fadeIn shadow-sm`}>
                    <div className="col-sm-3">
                        <h3 id="title" className="datelabel" >{moment(this.props.isodate).format('MMMM Do, YYYY')}</h3>
                    </div>
                    <div className="col-sm-8">
                        <div className="row" id="day_carousel">
                            <span className="prevBtn" onClick={this.onClickPrev} style={{ display: (filterEnts.length > 2 ? 'block' : 'none') }} >&#10094;</span>
                            {
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
                            }
                            <span className="nextBtn" onClick={this.onClickNext} style={{ display: (filterEnts.length > 2 ? 'block' : 'none') }} >&#10095;</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

export default Dayrow;