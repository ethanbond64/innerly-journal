import React from "react";
import { deleteEntry } from "../requests";


export const ImageCard = ({ entry, setPath, replace, heading = null, footer = null }) => {
    
    const baseUrl = "http://localhost:8000";
    const path = entry.entry_data.path;
    const url = path.includes('https://') ? path : baseUrl + path;

    const onClick = () => {
        if (setPath) {
            setPath(url);
        }
    };

    const onClickDelete = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (replace && window.confirm("Are you sure you want to delete this entry?")) {
            deleteEntry(entry.id, (resp) => {
                if (resp) {
                    replace({ entry_type: 'blank' });
                }
            });
        }
    }
    
    return (
        <div className={`col-xs-4 itemactive`} style={{ cursor: 'pointer'}} onClick={onClick}>
            <div style={{
                backgroundImage: `url(${url})`, padding: '0px', backgroundPosition: 'center', backgroundSize: 'cover'
            }} className={`well swell entryLoaded`} id="unit" >
                <button className="delButton" onClick={onClickDelete} style={{ 'color': 'transparent' }}>
                    <i className={`fa fa-trash-o`} style={{ color: 'white' }} aria-hidden="true"></i>
                    delete
                </button>
                {heading && <div id="media-title" className="mediaLabel">{heading}</div>}
                {footer && <div className={`mediaLabel mediaBottom`} >
                    <span>{footer}</span>
                    <i className={`fa fa-chevron-right hidden-xs`} aria-hidden="true" style={{ float: 'right', paddingTop: '4px' }}></i>
                </div>}
            </div>
        </div>
    );
}