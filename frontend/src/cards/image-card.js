import React from "react";


export const ImageCard = ({ entry, setPath }) => {
    
    const baseUrl = "http://localhost:8000/api/";
    const url = baseUrl + entry.entry_data.path;

    const onClick = () => {
        console.log("clicked");
        console.log(url);
        console.log(setPath);
        if (setPath) {
            setPath(url);
        }
    }
    
    return (
        <div className={`col-xs-4 itemactive`} style={{ cursor: 'pointer'}} onClick={onClick}>
            <div style={{
                backgroundImage: `url(${url})`, padding: '0px', backgroundPosition: 'center', backgroundSize: 'cover'
            }} className={`well swell entryLoaded`} id="unit" >
                {/* <a className="delButton" onClick={this.goToDelete} href={`${innerlyUrls.delete}${this.props.id}`} style={{ 'color': 'transparent' }}>
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
                } */}
            </div>
        </div>
    );
}