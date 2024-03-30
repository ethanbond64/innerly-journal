import axios from "axios";
import React, { useRef, useState } from "react";
import { insertLinkEntry, insertFileEntry } from "../requests";

export const BlankCard = ({ datetime, replace }) => {

    let today = false;
    const imageRef = useRef(null);
    const [loading, setLoading] = useState(false);

    let onClickWrite = () => {
        console.log('Write button clicked');
        window.location.href = '/write'; // TODO Use router and history
    }

    let onChangeLink = (e) => {
        setLoading(true);
        // TODO null datetime if Today
        let wrappedReplace = (data) => {
            setLoading(false);
            replace(data);
        };  
        insertLinkEntry(e.target.value, wrappedReplace, datetime.toISOString(), (e) => {
            // TODO post eror somwhere
            setLoading(false);
        }); 
    };

    let onClickImage = () => {
        if (imageRef.current) {
            imageRef.current.click();
        }
    }

    let onChangeImage = (e) => {
        setLoading(true);
        // TODO null datetime if Today
        insertFileEntry(e.target.files[0], replace, datetime.toISOString(), (e) => {
            // TODO post eror somwhere
            setLoading(false);
        });
    }

    return (
        <div className={`col-xs-4 blank_unit itemactive`}>
            <div className={`well swell ${today ? 'todayblank' : ''}`} id="unit">
                { loading ? 
                <img src="/images/innerly-loader.gif" /> : 
                <>
                    <p className="swellLabel" >+</p>
                    <button className={`btn btn-lg btn-info pretty-btn writeButton`} onClick={onClickWrite}><span className={`hidden-sm hidden-xs`}>Write an Entry</span><span className={`hidden-xl hidden-lg hidden-md`}>Write</span></button>
                    <input type="text" name="uploadLink" className="uploadLink" onChange={onChangeLink} placeholder="+Link (Spotify, YouTube, SoundCloud)" />
                    <div className={`inputBtn btn btn-lg btn-info pretty-btn`} onClick={onClickImage} ><span className={`hidden-sm hidden-xs`}>Add an Image</span><span className={`hidden-xl hidden-lg hidden-md`}>+ Image</span></div>
                    <input type="file" name="file" accept="image/*" ref={imageRef} onChange={onChangeImage} />
                    <input className={`upButton btn btn-lg btn-info pretty-btn deactivated`} type="button" value="Add Other" />
                </>}
            </div>
        </div>
    );
}