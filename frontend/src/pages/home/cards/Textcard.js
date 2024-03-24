import React from "react";
import moment from "moment";

class Textcard extends React.Component {


    constructor(props) {
        super(props);
        console.log("props", props.locked);
        let title_display = "Memory";
        if (!this.props.title || this.props.title === "" || this.props.title === " ") {
            if (!this.props.from_memory) title_display = moment(this.props.time).format('h A');
        } else {
            title_display = this.props.title;
        }
        this.state = { title: title_display };
        this.onClick = this.onClick.bind(this);
    }

    onClick() {
        window.location = `/archive/${this.props.id}`;
    }

    render() {

        // let active_class = (this.props.rowidx >= this.props.startidx && this.props.rowidx < this.props.startidx + 3) || (this.props.rowidx < this.props.startidx && this.props.rowidx < (this.props.startidx + 3) % this.props.nsiblings) ? 'itemactive' : 'item';
        let active_class = "item";
        if (this.props.rowidx >= this.props.startidx) {
            if (this.props.rowidx < this.props.startidx + 3) {
                active_class = "itemactive";
            }
        } else {
            if (this.rowidx < (this.props.startidx + 3) % (this.props.nsiblings)) {
                active_class = "itemactive";
            }
        }

        return (
            <div className={`col-xs-${this.props.colsize || 4} ${active_class}`}>
                <div className={`well swell entryLoaded`} id="unit" style={{ cursor: 'pointer' }} onClick={this.onClick}>
                    <h3 id="unitTitle"> {this.props.locked ? <i class="fa fa-lock" aria-hidden="true" id="lockIcon"
                        style={{ "color": "var(--dm-text)", "fontSize": "x-large" }}></i> : <span></span>}  {`${this.state.title}`}</h3>
                    <p id="unitSnip" className="hidden-xs"
                        style={this.props.sensitive ? { 'color': 'transparent', 'textShadow': '0 0 6px var(--dm-text)', 'padding': '2px' } : {}} >
                        {`${this.props.snippet}`}
                    </p>
                    <span id="unitTopics">
                        {
                            (this.props.topics.length === 1) ?
                                `${this.props.topics[0]}` :
                                this.props.topics.map((topic, i) => (
                                    (i === this.props.topics.length - 1) ? `${topic}` : `${topic} | `
                                ))
                        }
                    </span>
                </div>
            </div>
        );
    }
}

export default Textcard;