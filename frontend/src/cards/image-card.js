import React from "react";
import { deleteEntry } from "../requests";


export const ImageCard = ({ entry, setPath, replace }) => {
    
    const baseUrl = "http://localhost:8000/api/";
    const url = baseUrl + entry.entry_data.path;

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
            </div>
        </div>
    );
}