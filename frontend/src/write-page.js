import React, { useEffect, useState } from "react";
import Moment from "react-moment";
import { homeRoute, viewRoute } from "./constants.js";
import { fetchEntry, insertTextEntry, updateTextEntry } from "./requests.js";
import { useNavigate, useParams } from "react-router-dom";
import { getDateNoTime } from "./utils.js";
import { PageLoader } from "./page-loader.js";


export const WritePage = () => {

    const navigate = useNavigate();
    const { functionalDate } = useParams();
    
    let functionalDatetime = null;

    if (functionalDate && functionalDate.length === 10 && functionalDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const dateParts = functionalDate.split('-');
        functionalDatetime = getDateNoTime(dateParts[0], dateParts[1] - 1, dateParts[2]);
    }

    const onSubmit = (text) => {

        insertTextEntry(text, functionalDatetime, (data) => {
            navigate(viewRoute + data.id); 
        });
    }

    const heading = functionalDatetime ? (<> Write an entry for the date <Moment date={functionalDatetime} format="MMMM Do YYYY" /></>) :
        "Write about any thoughts, experiences, or ideas";

    return <WritePageBase onSumbit={onSubmit} heading={heading} />;
};

export const EditPage = () => {

    const navigate = useNavigate();
    const { entryId } = useParams();
    const [text, setText] = useState(null);
    const [title, setTitle] = useState(null);
    const [functionalDatetime, setFunctionalDatetime] = useState(null);
    
    useEffect(() => {
        if (!entryId) {
            navigate(homeRoute);
        }

        fetchEntry(entryId, (data) => {
            if (data.entry_type !== 'text' || !data.entry_data) {
                navigate(homeRoute);
            }
            setText(data.entry_data.text ? data.entry_data.text : '');
            setTitle(data.entry_data.title ? data.entry_data.title : null);
            setFunctionalDatetime(data.functional_datetime ? new Date(data.functional_datetime) : null);
        });

    }, [entryId, navigate]);

    const onSubmit = (text) => {
        if (entryId) {
            updateTextEntry(entryId, { text }, null, (data) => {
                navigate(viewRoute + data.id); 
            });
        }
    };

    const heading = (<>Editing: <i><b>{title ? title : "Untitled"}</b></i>{functionalDatetime ? <> from <Moment date={functionalDatetime} format="MMMM Do YYYY" /></> : null}</>);

    return text === null ? null : <WritePageBase onSumbit={onSubmit} heading={heading} text={text} />;
};

export const WritePageBase = ({  onSumbit, heading, text = '' }) => {

    const [showHeader, setShowHeader] = useState(true);

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
        handleMouseLeave();
        return () => {
            clearTimeout(timeoutId);
        };
    }, []); 

    const onSubmitInner = (e) => {
        e.preventDefault();
        const text = document.getElementById('writeto').value;
        onSumbit(text);
    }

    // TODO title on edit

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
                                <span className={`disappear hidden-xs`} style={{ padding: '12px', opacity: showHeader ? 1 : 0 }}>{heading}</span>
                                <button id="submitbtn" type="submit" onClick={onSubmitInner} className="btn btn-info btn-block" style={{ width: 'auto', float: 'right', color: 'white', marginRight: '12px' }}>
                                    <span className="nremove hidden-xs" >{showHeader ? 'Save ' : null}</span>
                                    <b><i className="fa fa-chevron-right" aria-hidden="true"></i></b>
                                </button>
                            </div>
                            <div id="progressbar">
                                <div style={{ height: '0px', width: '0%'}}></div>
                            </div>
                        </div>
                        <div className="form-group" style={{ height: '97%' }}>
                            <textarea className="form-control form-control-inner" id="writeto" name="entry" style={{ marginTop: '20px' }} defaultValue={text}></textarea>
                        </div>
                        <div className="writeto-display"></div>
                    </div>
                    <div className="col-lg-2 hidden-md hidden-sm hidden-xs"></div>
                </div>
        </main>
    );
};
