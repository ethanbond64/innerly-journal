import React from "react";

const monthAbrs = [
    "Jan", "Feb", "Mar", "Apr",
    "May", "Jun", "Jul", "Aug",
    "Sep", "Oct", "Nov", "Dec"
]

class Monthcollapse extends React.Component {

    // Passed in msg button and first data
    constructor(props) {
        super(props);
        
        this.onClick = this.onClick.bind(this);
        this.createLabel = this.createLabel.bind(this);

        this.state = {opened: false, label: this.createLabel()};
    }

    createLabel() {
        // props preMonth & collapseId
        let firstMonth = this.props.prevMonth === 0 ? 11 : this.props.prevMonth - 1;
        let secondMonth = this.props.nextMonth === 11 ? 0 : this.props.nextMonth + 1;

        return firstMonth === secondMonth ? monthAbrs[firstMonth] + " " + this.props.prevYear 
            : monthAbrs[firstMonth] + " ... " + monthAbrs[secondMonth];
        // month after premonth  to month before collapse
    }

    handleExpand = () => {
        this.props.msgSetter(this.props.collapseId);
    }

    onClick() {
        this.handleExpand();
        this.setState(prevState => ({ opened: true }));
    }

    render() {

        if (!this.state.opened) return (
            <div className="c_well" style={{ textAlign: 'center' }}>
                <div className={`row sm-margin-bottom`}>
                    <div className="col-sm-3"></div>
                    <div className="col-sm-8">
                        <button className="c_button" onClick={this.onClick}>
                            <span id="day1">{this.state.label}</span>
                                {/* this.state.override
                                    ? <span id="day2">{`... ` + monthAbrs[parseInt(this.props.collapseId.split('-')[1])] + ` 1`}</span>
                                    : <span id="day2">
                                        {(this.state.isodates.length > 1) ? `... ` + moment(this.state.isodates[this.state.isodates.length - 1]).format('MMM D') : ``}
                                    </span> */}
                        </button>
                    </div>
                </div>
            </div>
        );

        return (
            <div style={{display: 'none'}}>
            </div>
        );
    }
}

export default Monthcollapse;