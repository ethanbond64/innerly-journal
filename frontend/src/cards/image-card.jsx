import React from "react";
import { deleteEntry } from "../requests.js";
import { Icon } from "../icon.jsx";


export const ImageCard = ({ entry, setPath, replace, heading = null, footer = null }) => {
    
    // Either an external URL, or an already-signed '/api/static/...' path on this origin.
    const url = entry.entry_data.path;

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
                    <Icon name="trash-o" style={{ color: 'white' }} />
                    delete
                </button>
                {heading && <div id="media-title" className="mediaLabel">{heading}</div>}
                {footer && <div className={`mediaLabel mediaBottom`} >
                    <span>{footer}</span>
                    <Icon name="chevron-right" className="hidden-xs" style={{ float: 'right', marginTop: '4px' }} />
                </div>}
            </div>
        </div>
    );
}