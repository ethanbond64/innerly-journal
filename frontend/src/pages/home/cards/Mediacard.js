import React from "react";
import { Link } from 'react-router-dom';
import innerlyUrls from "../../../utils/InnerlyUrls";

const s3_type = "image_upload_s3";
const thumbnail_paths = {
    "youtube": ["/static/images/yt_logo_rgb_dark.png", 18],
    "soundcloud": ["/static/images/Soundcloud_logo_white.png", null],
    "spotify": ["/static/images/Spotify_Logo_RGB_Green.png", 23],
    "wikipedia": ["/static/images/Wikipedia-logo-white.png", 23],
}

class Mediacard extends React.Component {

    constructor(props) {
        super(props);
        this.goToLinkExt = this.goToLinkExt.bind(this);
        this.goToDelete = this.goToDelete.bind(this);
    }

    goToLinkExt() {
        window.open(this.props.media.link, "_blank");
    }

    goToDelete() {
        window.location = `${innerlyUrls.delete}${this.props.id}`;
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
            <div className={`col-sm-${this.props.colsize || `4 col-xs-4`} ${active_class}`}>
                <Link onClick={() => {
                    // CACHE IMAGE FOR FASTER VIEWING
                    localStorage.setItem("urlcache", this.props.media.thumbnail);
                    localStorage.setItem("cacheimgid", this.props.media.media_id);
                }
                } to={this.props.media.type === s3_type ? `${innerlyUrls.home}/view/${this.props.media.media_id}` : `${innerlyUrls.home}`} >
                    <div style={{
                        backgroundImage: `url(${this.props.media.thumbnail})`, padding: '0px', backgroundPosition: 'center', backgroundSize: 'cover'
                    }} className={`well swell entryLoaded`} id="unit" >
                        <a className="delButton" onClick={this.goToDelete} href={`${innerlyUrls.delete}${this.props.id}`} style={{ 'color': 'transparent' }}>
                            <i className={`fa fa-trash-o`} style={{ color: 'var(--dm-text)' }} aria-hidden="true"></i>
                            delete
                        </a>
                        {
                            (this.props.media.type !== s3_type) && this.props.title &&
                            <a id="media-title" className="mediaLabel" onClick={this.goToLinkExt} rel="noreferrer" target="_blank" href={this.props.media.link}>{`${this.props.title}`}</a>
                        }
                        {
                            (this.props.media.type !== s3_type) &&
                            <a className={`mediaLabel mediaBottom`} onClick={this.goToLinkExt} rel="noreferrer" target="_blank" href={this.props.media.link}>
                                <img id="logo-image" alt="" src={thumbnail_paths[this.props.media.site][0]} style={{ height: thumbnail_paths[this.props.media.site][1] }} />
                                <i className={`fa fa-chevron-right hidden-xs`}
                                    aria-hidden="true" style={{ float: 'right', paddingTop: '4px' }}></i>
                            </a>
                        }
                    </div>
                </Link>
            </div>
        );
    }
}

export default Mediacard;