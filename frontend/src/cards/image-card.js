import React from "react";


export const ImageCard = ({ entry, setPath, replace }) => {
    
    const baseUrl = "http://localhost:8000/api/";
    const url = baseUrl + entry.entry_data.path;

    const onClick = () => {
        console.log('click');
        if (setPath) {
            setPath(url);
        }
    };

    const onClickDelete = (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('delete');
        if (replace) {
            replace({ entry_type: 'blank' });
        }
    }
    
    return (
        <div className={`col-xs-4 itemactive`} style={{ cursor: 'pointer'}} onClick={onClick}>
            <div style={{
                backgroundImage: `url(${url})`, padding: '0px', backgroundPosition: 'center', backgroundSize: 'cover'
            }} className={`well swell entryLoaded`} id="unit" >
                <button className="delButton" onClick={onClickDelete} style={{ 'color': 'transparent' }}>
                    <i className={`fa fa-trash-o`} style={{ color: 'var(--dm-text)' }} aria-hidden="true"></i>
                    delete
                </button>
            </div>
        </div>
    );
}