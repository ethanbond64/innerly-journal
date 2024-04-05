import React, { useEffect, useState } from "react";
import { homeRoute, viewRoute } from "./constants.js";
import { insertTextEntry } from "./requests.js";
import { useNavigate, useParams } from "react-router-dom";
import { getDateNoTime } from "./utils.js";


export const WritePage = () => {
    
    const { functionalDate } = useParams();

    let functionalDatetime = null;

    if (functionalDate && functionalDate.length === 10 && functionalDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const dateParts = functionalDate.split('-');
        functionalDatetime = getDateNoTime(dateParts[0], dateParts[1] - 1, dateParts[2]);
    }

    return <WritePageBase functionalDatetime={functionalDatetime} />;
};

export const EditPage = () => {
    const { entryId } = useParams();
    return <WritePageBase entryId={entryId} />;
};

export const WritePageBase = ({ entryId = null, functionalDatetime = null }) => {

    const navigate = useNavigate();
    const [showHeader, setShowHeader] = useState(true);

    const onClick = () => {
        if (entryId) {
            // TODO update entry
        } else {
            let funcationlDatetimeInput = functionalDatetime ? functionalDatetime.toISOString() : null;
            insertTextEntry(document.getElementById('writeto').value, funcationlDatetimeInput, (data) => {
                navigate(viewRoute + data.id); 
            });
        }
    };

    let timeoutId;

    const handleMouseEnter = () => {
        clearTimeout(timeoutId);
        setShowHeader(true);
    };

    const handleMouseLeave = () => {
        timeoutId = setTimeout(() => {
            setShowHeader(false);
        }, 3500);
    };

    useEffect(() => {

        // TODO fetch entry if entryId, set text area value

        handleMouseLeave();

        return () => {
            clearTimeout(timeoutId);
        };
    }, []); 

    return (
        <main style={{ height: `90vh`, padding: '0', marginBottom: '0' }} className="container" >
                <div className="row text-center" style={{ height: '90%' }}>
                    <div className="col-md-2 hidden-sm hidden-xs text-left" >
                        <a href={homeRoute} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
                            <img src="/images/innerly_wordmark_200616_03.png" style={{ opacity: showHeader ? 1 : 0, marginTop: '30px', }} className="img-responsive md-margin-right" width="170" height="80" id="innerlyImage" title="Innerly" alt="Innerly" />
                        </a>
                    </div>
                    <div className="col-lg-8 col-md-10" style={{ height: '97%' }}>
                        <div id="session-details" className="writeto-display" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} style={{ textAlign: 'left', border: 'none', overflow: 'visible', paddingTop: '50px' }}>
                            <div>
                                <a href={homeRoute} className="btn btn-warning btn-block hidden-xl hidden-lg hidden-md hidden-sm" style={{ width: 'auto', float: 'left' }}>
                                    <b><i className="fa fa-chevron-left" aria-hidden="true"></i></b>
                                    <span>Back</span>
                                </a>
                                <span className={`disappear hidden-xs`} style={{ padding: '12px', opacity: showHeader ? 1 : 0 }}>Write about any thoughts, experiences, or ideas</span>
                                <button id="submitbtn" type="submit" onClick={onClick} className="btn btn-info btn-block" style={{ width: 'auto', float: 'right', color: 'white', marginRight: '12px' }}>
                                    <span className="nremove hidden-xs" >{showHeader ? 'Save ' : null}</span>
                                    <b><i className="fa fa-chevron-right" aria-hidden="true"></i></b>
                                </button>
                            </div>
                            <div id="progressbar">
                                <div style={{ height: '0px', width: '0%'}}></div>
                            </div>
                        </div>
                        <div className="form-group" style={{ height: '97%' }}>
                            <textarea className="form-control form-control-inner" id="writeto" name="entry" style={{ marginTop: '20px' }} ></textarea>
                        </div>
                        <div className="writeto-display"></div>
                    </div>
                    <div className="col-lg-2 hidden-md hidden-sm hidden-xs"></div>
                </div>
        </main>
    );
};
