import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { insertLinkEntry, insertFileEntry } from "../requests.js";
import { writeRoute } from "../constants.js";
import { dateToString, equalsDate, getTodaysDate } from "../utils.js";

export const BlankCard = ({ datetime, replace }) => {

    let today = equalsDate(getTodaysDate(), datetime);
    const imageRef = useRef(null);
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);

    const onClickWrite = () => {
        let param = "";
        if (!today) {
            param = "/" + dateToString(datetime);
        }
        navigate(writeRoute + param);
    }

    const wrappedReplace = (data) => {
        setLoading(false);
        replace(data);
    };

    const onChangeLink = (e) => {
        insertEntry(insertLinkEntry, e.target.value);
    };

    const onClickImage = () => {
        if (imageRef.current) {
            imageRef.current.click();
        }
    }

    const onChangeImage = (e) => {
        insertEntry(insertFileEntry, e.target.files[0]);
    }

    const insertEntry = (insertFunction, target) => {
        setLoading(true);
        let now = new Date();
        let functional_datetime = equalsDate(now, datetime) ? null : datetime.toISOString();
        insertFunction(target, wrappedReplace, functional_datetime, (e) => {
            // TODO post eror somwhere
            setLoading(false);
        });
    }

    return (
        <div className={`col-xs-4 blank_unit itemactive`}>
            <div className={`well swell ${today ? 'todayblank' : ''}`} id="unit">
                { loading ? 
                <img src="./images/innerly-loader.gif" alt="loading gif" /> : 
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