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
            </div>
        </div>
    );
}