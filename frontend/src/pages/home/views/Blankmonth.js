import React from "react";
import moment from "moment";
import Dayrow from "./Dayrow";


function getIsodates(month, year, isCurrent = false) {
    let isos = (new Array(31)).fill('').map((v, i) => new Date(year, month - 1, i + 1)).filter(v => v.getMonth() === month - 1).map(v => v.toISOString().split('T')[0]).reverse();

    if (isCurrent) {
        let today_iso = new Date().toISOString().split("T")[0];
        var newIsos = []
        let seen = false;
        isos.forEach(iso => {
            if (iso === today_iso) {
                seen = true;
            }
            if (seen) {
                newIsos.push(iso);
            }
        });
        isos = newIsos
    }
    return isos;
}


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

class Blankmonth extends React.Component {

    constructor(props) {
        super(props);

        let today = new Date();
        var isCurrent = (this.props.month === today.getMonth() && this.props.year === today.getFullYear())

        this.state = {
            viewtype: "dayview", collapseId: this.props.collapseId, display: this.props.allLoaded || false,
            filter: this.props.filter, is_current: isCurrent, isodates: getIsodates(this.props.month + 1, this.props.year, isCurrent),
            lastNonScrollEventCount: this.props.nonScrollEventCount
        };

        this.onClick = this.onClick.bind(this);
    }


    componentWillReceiveProps(nextProps) {
        this.setState({ filter: nextProps.filter });

        // We want to know there is a change coming from the button, not a just a scroll query
        // So, we check that the count has changed
        if (this.state.lastNonScrollEventCount !== nextProps.nonScrollEventCount) {
            this.setState({ viewtype: nextProps.viewtype });
        }

        this.setState({ lastNonScrollEventCount: nextProps.nonScrollEventCount });

        if (nextProps.filter !== "all") {
            this.setState({ display: false });
        } else if (!this.state.display && nextProps.msg === this.state.collapseId) {
            this.setState({ display: true });
        } else if (nextProps.viewtype !== "dayview") {
            this.setState({ display: false });
        }

        // if (this.props.viewtype  !== this.state.lastpropsviewtype){
        // this.setState({ viewtype: nextProps.viewtype, lastpropsviewtype: nextProps.viewtype });
        // }
    }

    onClick() {
        if (this.state.viewtype === "monthview") {
            this.setState({ viewtype: "dayview" });
        } else {
            this.setState({ viewtype: "monthview" });
        }
        // this.setState(prevState => ({viewtype: !prevState.viewtype}));
    }

    render() {

        var content = (
            <div>
                {
                    this.state.isodates.map((isodate, i) => (
                        <Dayrow isodate={isodate} ents={[]} fromexp={true} />
                    ))
                }
            </div>
        );

        var header_display = this.state.is_current && this.state.viewtype !== "monthview" ? 'none' : 'block';

        return (
            <div className="row" style={{ marginLeft: '-7px', marginRight: '-7px', display: this.state.display ? 'block' : 'none' }}>
                {
                    this.state.viewtype === "gallery" || this.state.filter !== "all"
                        ?
                        <div style={{ display: 'none' }}></div>
                        :
                        <div className={`col-sm-11 col-xs-12 well`} style={{ width: '100%', marginTop: '20px', height: '40px', paddingTop: '2px', background: `linear-gradient(to right,  ${month_colors[this.props.month]} 0%,${month_colors[~~((this.props.month + 1) % 12)]} 100%)`, display: header_display }}>
                            <h3 style={{ opacity: 1, marginTop: '4px', display: 'inline-block' }} >{`${moment().month(this.props.month).format("MMMM")} ${this.props.year}`} &nbsp;</h3>
                            <span style={{ opacity: 1, marginTop: '4px', display: 'inline-block', fontSize: 'large', color: 'var(--dm-text)', marginBottom: '5px' }}>0 entries</span>
                            {/* <span style={{ opacity: 1, marginTop: '4px', display: 'inline-block', fontSize: 'large', color: 'var(--dm-text)', backgroundColor: '#fff', padding: '3px', borderRadius: '6px' }} onClick={this.onClick}>Expand</span> */}

                            <div className={`btn btn-sm btn-info`} style={{ display: 'inline-block', marginBottom: '10px', marginLeft: '10px' }} onClick={this.onClick}>{this.state.viewtype === "monthview" ? `Expand` : `Collapse`}</div>
                        </div>

                }
                {this.state.viewtype === "monthview" ? <div className={`well owell`}></div> : content}

            </div>
        );
    }

}

export default Blankmonth;