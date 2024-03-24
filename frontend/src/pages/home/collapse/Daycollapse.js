import React from "react";
import moment from "moment";
import Dayrow from "../views/Dayrow";

const monthAbrs = [
    "Jan", "Feb", "Mar", "Apr",
    "May", "Jun", "Jul", "Aug",
    "Sep", "Oct", "Nov", "Dec"
]

class Daycollapse extends React.Component {

    constructor(props) {
        super(props);
        let isodates = [];
        let voidme = false;

        // NOTE: DAY 1 is BIGGER than DAY 2 !!!!

        let iso_month = this.props.day1.slice(0, 8);
        let day1 = parseInt(this.props.day1.split('-')[2]);
        let day2 = parseInt(this.props.day2.split('-')[2]);

        // dont want the days to be the same or next to each other
        if ((day1 === day2 + 1) || (day1 === day2)) {
            voidme = true;
        }

        if (!voidme) {
            for (let i = day2 + 1; i < day1; i++) {
                if (i < 10) {
                    isodates.push(iso_month + '0' + i);
                } else {
                    isodates.push(iso_month + i);
                }
            }
        }

        let overrideDay2 = false;
        if (this.props.collapseId) {
            let firstMonth = parseInt(iso_month.split('-')[1]);
            let firstYear = parseInt(iso_month.split('-')[0]);
            let secondMonth = parseInt(this.props.collapseId.split('-')[1]);
            let secondYear = parseInt(this.props.collapseId.split('-')[0]);
            if (!((firstMonth - 1 === secondMonth && firstYear === secondYear) || (firstMonth === 0 && secondMonth === 11 && firstYear - 1 === secondYear))) {
                overrideDay2 = true;
            }
        }

        isodates = isodates.reverse();

        this.state = { isodates: isodates, voidme: voidme, opened: false, override: overrideDay2 };

        this.onClick = this.onClick.bind(this);
    }

    handleExpand = () => {
        this.props.msgSetter(this.props.collapseId);
    }

    onClick() {
        this.setState({ opened: true });
        if (this.state.override) this.handleExpand();
        // this.setState(prevState => ({ opened: true }));
    }

    render() {

        if (this.state.voidme) {
            return (<div style={{ display: 'none' }}></div>);
        }

        let ovday2 = 0;
        if (this.state.override) {
            ovday2 = parseInt(this.props.collapseId.split('-')[1]) + 1;
            if (ovday2 === 12) ovday2 = 0;
        }

        if (!this.state.opened) return (
            <div className="c_well" style={{ textAlign: 'center' }}>
                <div className={`row sm-margin-bottom`}>
                    <div className="col-sm-3"></div>
                    <div className="col-sm-8">
                        <button className="c_button" onClick={this.onClick}>
                            <span id="day1">{moment(this.state.isodates[0]).format('MMM D')} </span>
                            {
                                this.state.override
                                    ? <span id="day2">{`... ` + monthAbrs[ovday2] + ` 1`}</span>
                                    : <span id="day2">
                                        {(this.state.isodates.length > 1) ? `... ` + moment(this.state.isodates[this.state.isodates.length - 1]).format('MMM D') : ``}
                                    </span>

                            }
                        </button>
                    </div>
                </div>
            </div>
        );

        return (
            <div>
                {
                    this.state.isodates.map((isodate, i) => (
                        <Dayrow isodate={isodate} ents={[]} fromexp={true} />
                    ))
                }
            </div>
        );
    }
}

export default Daycollapse;