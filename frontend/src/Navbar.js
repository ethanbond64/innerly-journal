import React from "react";
import innerlyUrls from "./utils/InnerlyUrls";


class Navbar extends React.Component {

    constructor(props) {
        super(props);

        let userInitial = document.getElementsByName('user-initial')[0].getAttribute('content');
        let showAdmin = document.getElementsByName('show-admin-links')[0].getAttribute('content') === 'True';
        this.state = {
            userinitial:userInitial, showadmin:showAdmin, prequery:""
        }
        this.handleChange = this.handleChange.bind(this);
        this.handleEnter = this.handleEnter.bind(this);
        this.handleSubmit = this.handleSubmit.bind(this);
        this.handleViewChange = this.handleViewChange.bind(this);
        this.handleFilterChange = this.handleFilterChange.bind(this);
    }

    handleChange (e) {
        this.setState({prequery:e.target.value});
        if (e.target.value === "") {
            // Call explicitly instead of calling handleSubmit because the above setState can load slower sometimes
            this.props.setquery("");
            this.props.incrementNonScrollEventCount();
        }
    }

    handleEnter (e) {
        if (e.key === 'Enter') {
            this.handleSubmit(e);
            this.props.incrementNonScrollEventCount();
        }
    }

    handleSubmit () {
        this.props.setquery(this.state.prequery);
        this.props.incrementNonScrollEventCount();
    }

    handleViewChange (e) {
        this.props.setviewtype(e.target.value);
        if (e.target.value === "monthview") {
            this.props.setfiltertype("all");
        }
        this.props.incrementNonScrollEventCount();
    }

    handleFilterChange (e) {
        this.props.setfiltertype(e.target.value);
        this.props.incrementNonScrollEventCount();
    }

    render () {
        return (
            <nav className={`navbar navbar-default navbar-fixed-top`} style={{zIndex:1000}}>
                <div className={``} style={{float:'left'}}>
                    <a href={innerlyUrls.index} className={`hidden-sm hidden-xs`} >
                        <img src="/static/images/innerly_wordmark_200616_02.png" style={{ marginTop: '0px', marginLeft: '30px' }}
                                className={`img-responsive sm-margin-top`} width="150" height="73" title="Innerly" alt="Innerly" />
                    </a>
                    <a href={innerlyUrls.index} className={`hidden-xl hidden-lg hidden-md`} >
                            <img src="/static/images/apple-touch-icon128.png"
                                className={`img-responsive sm-margin-top`} width="40" height="40" title="Innerly" alt="Innerly"
                                style={{ marginTop: '20px', marginLeft: '15px', borderRadius: '5px' }} />
                    </a>
                </div>
                <div className={``} style={{ float: 'right' }}>
                    <button type="button" className={`custom-letter-box dropdown-toggle`} data-toggle="dropdown" aria-haspopup="true" aria-expanded="false" style={{ marginTop: '25px', borderColor: 'transparent', backgroundColor: 'transparent' }}>
                        <div className={`avatar-circle`}>
                            <span className={`initials`}>{this.state.userinitial}</span>
                        </div>
                    </button>
                    <ul className={`dropdown-menu pull-right`} style={{ float: 'right' }}>
                        {this.state.showadmin ? <li><a href={innerlyUrls.adminDash}>Admin-Dash</a></li> : null}
                        {this.state.showadmin ? <li role="separator" className="divider"></li> : null}
                        {this.state.showadmin ? <li><a href={innerlyUrls.growth}>Growth</a></li> : null}
                        {this.state.showadmin ? <li role="separator" className="divider"></li> : null}
                        {this.state.showadmin ? <li><a href={innerlyUrls.users}>Users</a></li> : null}
                        {this.state.showadmin ? <li role="separator" className="divider"></li> : null}
                        <li>
                            <a href={innerlyUrls.settings}><i className={`fa fa-cog`} aria-hidden="true"></i>&nbsp;Settings</a>
                        </li>
                        <li role="separator" className={`divider`}></li>
                        <li><a href={innerlyUrls.logout}><b>Log out</b></a></li>
                    </ul>
                </div>
                <div className="container" style={{textAlign:'center', maxWidth:'84%'}}>
                    <div className={`well owell`} style={{ marginBottom: '3px', padding:'7px' }}>
                        <div className={`input-group sm-margin-bottom`} style={{ margin: '7px', paddingLeft: '15px', paddingRight: '5px', maxWidth: '1154px', marginTop: '10px' }}>
                            <input type="text" className="form-control" id="cardSearch" name="cardSearch" value={this.state.prequery} onChange={this.handleChange} onKeyPress={this.handleEnter}
                                placeholder="Press enter to search" style={{ color: 'var(--dm-text)' }} />
                            <span className="input-group-addon" style={{ backgroundColor: 'var(--well-grey)', borderLeft: '1px solid rgb(181, 181, 181)' }}>
                                <button type="submit" id="cardSearchButton"
                                    style={{ backgroundColor: 'Transparent', backgroundRepeat: 'no-repeat', outline: 'none', border: 'none', color: 'var(--dm-text)' }}><i
                                        className={`fa fa-fw fa-search`} type="submit" onClick={this.handleSubmit}></i></button>
                            </span>
                        </div>
                        <div className={`input-group`} style={{ paddingRight: '15px', paddingLeft: '25px', marginTop: '10px', marginBottom: '6px', maxWidth: '1154px' }}>
                            <select value={this.props.viewtype} onChange={this.handleViewChange}>
                                <option value="dayview">Day View</option>
                                <option value="monthview">Month View</option>
                                <option value="gallery" disabled={true}>Gallery</option>
                            </select>
                            <select value={this.props.filtertype} disabled={this.props.viewtype === "monthview" ? true : null} onChange={this.handleFilterChange} style={{ marginLeft: '30px' }}>
                                <option value="all">All Entries</option>
                                <option value="image_upload_s3">Photos</option>
                                <option value="text">Text</option>
                                <option value="link">All Links</option>
                                <option value="spotify">Spotify</option>
                                <option value="youtube">YouTube</option>
                                <option value="soundcloud">SoundCloud</option>
                                <option value="wikipedia">Wikipedia</option>
                            </select>
                        </div>
                    </div>
                </div>
            </nav>
        );
    }

}

export default Navbar;



