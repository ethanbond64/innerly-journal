import React from "react";
import Dayrow from "./Dayrow";
import Daycollapse from "../collapse/Daycollapse";
import Mediacard from "../cards/Mediacard";
import Textcard from "../cards/Textcard";
import moment from "moment";
import Monthcollapse from "../collapse/Monthcollapse";

// colors
// jan #3366ff
// feb #00ccff
// mar #00cc99
// apr #66ff66
// may #ffff00
// jun #ffcc00
// jul #ff6600
// aug #ff3399
// sep #996600
// oct #993399
// nov #333399
// dec #000066

const month_opacity = 0.4;

const month_colors = [
    `rgba(0, 0, 102, ${month_opacity})`,
    `rgba(51, 102, 255, ${month_opacity})`,
    `rgba(0, 204, 255, ${month_opacity})`,
    `rgba(0, 204, 153, ${month_opacity})`,
    `rgba(102, 255, 102, ${month_opacity})`,
    `rgba(255, 255, 0, ${month_opacity})`,
    `rgba(255, 204, 0, ${month_opacity})`,
    `rgba(255, 102, 0, ${month_opacity})`,
    `rgba(255, 51, 153, ${month_opacity})`,
    `rgba(153, 102, 0, ${month_opacity})`,
    `rgba(153, 51, 153, ${month_opacity})`,
    `rgba(51, 51, 153, ${month_opacity})`,
];

class Monthblock extends React.Component {

    constructor(props) {
        super(props);
        let n_ents = 0;
        let thumbnail_ents = [];
        let text_ents = [];
        let today = new Date();
        // thumbnail chooser
        this.props.days.forEach((day) => {
            n_ents += day.ents.length;
            if (thumbnail_ents.length < 4) {
                day.ents.forEach((ent) => {
                    if (ent.media) {
                        thumbnail_ents.push(ent);
                    } else if (text_ents.length < 4) {
                        text_ents.push(ent);
                    }
                });
            }
        });

        thumbnail_ents = thumbnail_ents.concat(text_ents);
        thumbnail_ents = thumbnail_ents.slice(0, 4);

        let days = this.props.days;
        let today_iso = today.toISOString().split('T')[0];

        if (this.props.isCurrent && today_iso !== days[0].isodate) {
            days = [{ isodate: today_iso, ents: [] }, ...days];
        }

        this.state = {
            viewtype: this.props.viewtype || "dayview", filter: this.props.filter, n_ents: n_ents,
            thumbnail_ents: thumbnail_ents, is_current: this.props.isCurrent, days: days,
            collapseId: this.props.collapseId, lastNonScrollEventCount: this.props.nonScrollEventCount
        };

        this.onClick = this.onClick.bind(this);
        this.createContent = this.createContent.bind(this);
    }

    componentWillReceiveProps(nextProps) {
        this.setState({ filter: nextProps.filter });

        // We want to know there is a change coming from the button, not a just a scroll query
        // So, we check that the count has changed
        if (this.state.lastNonScrollEventCount !== nextProps.nonScrollEventCount) {
            this.setState({ viewtype: nextProps.viewtype });
        }

        this.setState({ lastNonScrollEventCount: nextProps.nonScrollEventCount });
    }

    onClick() {
        if (this.state.viewtype === "monthview") {
            this.setState({ viewtype: "dayview" });
        } else {
            this.setState({ viewtype: "monthview" });
        }
        // this.setState(prevState => ({viewtype: !prevState.viewtype}));
    }

    getMonthEnd(isodate) {
        let month = isodate.split('-')[1];
        let year = isodate.split('-')[0];
        // add 1 because the collapse end dates are excluded
        let ndays = new Date(year, month, 0).getDate() + 1;
        return isodate.slice(0, 8) + ndays;
    }

    createContent() {

        var content = [];
        this.state.days.forEach((daydata, i) => {

            // FROM LAST - if not first 
            if (i > 0 && this.state.filter === "all") {
                content.push(<Daycollapse day1={this.state.days[i - 1].isodate} day2={this.state.days[i].isodate} />);
            } else if (!this.state.is_current && this.state.filter === "all") {
                content.push(<Daycollapse day1={this.getMonthEnd(this.state.days[i].isodate)} day2={this.state.days[i].isodate} />);
            }
            content.push(<Dayrow {...daydata} filter={this.state.filter} />);
            // if (i === days.length - 1 && this.state.filter === "all"){
            //     content.push(<Daycollapse day1={days[i].isodate} day2={days[i].isodate.slice(0, 8) + '00'} />);
            // }
        });

        let finIsodate = this.state.days[this.state.days.length - 1].isodate;

        // Last one
        if (this.state.filter === "all" && finIsodate.slice(8, 10) !== "01") {
            content.push(<Daycollapse day1={finIsodate} day2={finIsodate.slice(0, 8) + '00'} collapseId={this.state.collapseId} msgSetter={this.props.msgSetter} />);
            // Check that collapse ID month is not the next one
        } else if (this.state.filter === "all" && this.state.collapseId && this.state.collapseId.includes('-')) {

            let firstMonth = parseInt(finIsodate.split('-')[1]) - 1;
            let firstYear = parseInt(finIsodate.split('-')[0]);
            let secondMonth = parseInt(this.state.collapseId.split('-')[1]);
            let secondYear = parseInt(this.state.collapseId.split('-')[0]);
            // console.log(firstMonth,firstYear,secondMonth,secondYear);
            if (!((firstMonth - 1 === secondMonth && firstYear === secondYear) || (firstMonth === 0 && secondMonth === 11 && firstYear - 1 === secondYear))) {
                content.push(<Monthcollapse collapseId={this.state.collapseId} msgSetter={this.props.msgSetter} prevMonth={firstMonth} prevYear={firstYear} nextMonth={secondMonth} />);
            }
        }

        // console.log('TYPES');
        // console.log(content[content.length - 1].type == Daycollapse);
        // console.log(content[content.length - 1].type == Dayrow);
        // FINAL COLLAPSE DEPENDENT ON NEXT MONTH

        return content;
    }

    // TEMP?
    handleExpand = () => {
        this.props.msgSetter(this.state.collapseId);
    }

    render() {

        var content = this.createContent();

        var thumbnail_content = (
            <div className={`well owell`}>
                <div className={`row animated fadeIn shadow-sm`}>
                    {this.state.thumbnail_ents.map((entdata, i) => (
                        entdata.media
                            ? <Mediacard {...entdata} rowidx={0} startidx={0} nsiblings={4} colsize={i === 3 ? '3 hidden-xs' : '3 col-xs-4'} />
                            : <Textcard {...entdata} rowidx={0} startidx={0} nsiblings={4} colsize={i === 3 ? '3 hidden-xs' : '3 col-xs-4'} />
                    ))}
                </div>
            </div>
        );

        var header_display = this.state.is_current && this.state.viewtype !== "monthview" ? 'none' : 'block';

        return (
            <div className="row" style={{ marginLeft: '-7px', marginRight: '-7px' }}>
                {
                    this.state.viewtype === "gallery" || this.state.filter !== "all"
                        ?
                        <div style={{ display: 'none' }}></div>
                        :
                        <div className={`col-sm-11 col-xs-12 well`} style={{ width: '100%', marginTop: '20px', height: '40px', paddingTop: '2px', background: `linear-gradient(to right,  ${month_colors[this.props.month]} 0%,${month_colors[~~((this.props.month + 1) % 12)]} 100%)`, display: header_display }}>
                            <h3 style={{ opacity: 1, marginTop: '4px', display: 'inline-block' }} >{`${moment().month(this.props.month).format("MMMM")} ${this.props.year}`} &nbsp;</h3>
                            <span style={{ opacity: 1, marginTop: '4px', display: 'inline-block', fontSize: 'large', color: 'var(--dm-text)', marginBottom: '5px' }}>{`${this.state.n_ents} entries`}</span>
                            {/* <span style={{ opacity: 1, marginTop: '4px', display: 'inline-block', fontSize: 'large', color: 'var(--dm-text)', backgroundColor: '#fff', padding: '3px', borderRadius: '6px' }} onClick={this.onClick}>Expand</span> */}

                            <div className={`btn btn-sm btn-info`} style={{ display: 'inline-block', marginBottom: '10px', marginLeft: '10px' }} onClick={this.onClick}>{this.state.viewtype === "monthview" ? `Expand` : `Collapse`}</div>
                        </div>

                }
                {this.state.viewtype === "monthview" ? thumbnail_content : content}

            </div>
        );
    }
}

export default Monthblock;
