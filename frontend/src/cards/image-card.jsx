import React, { useState } from "react";
import { DeleteEntryDialog } from '../delete-entry-dialog.jsx';
import { Icon } from "../icon.jsx";


export const ImageCard = ({ entry, setPath, replace, heading = null, footer = null }) => {
    
    // Local images are served through the account-scoped /media/ handler.
    const url = entry.entry_data.path;
    const [showDelete, setShowDelete] = useState(false);

    const onClick = () => {
        if (setPath) {
            setPath(url);
        }
    };

    const onClickDelete = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (replace) setShowDelete(true);
    }
    
    return (
        <>
        {showDelete && <DeleteEntryDialog entryId={entry.id} onCancel={() => setShowDelete(false)}
            onDeleted={() => { setShowDelete(false); replace({ entry_type: 'blank' }); }} />}
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
        </>
    );
}