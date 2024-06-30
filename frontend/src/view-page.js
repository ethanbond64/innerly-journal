import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import Moment from 'react-moment';
import { editRoute, homeRoute } from "./constants.js";
import { deleteEntry, fetchEntry, fetchLockedEntry, lockEntry, unlockEntry, updateTextEntry } from "./requests.js";
import { BasePage } from "./base-page.js";
import { ClickOutsideTracker, equalsDate } from "./utils.js";
import { PasswordModal } from "./password-modal.js";

export const ViewPage = ({ entryInput = null }) => {

    const { entryId } = useParams();
    const navigate = useNavigate();
    const titleRef = useRef(null);

    const [entry, setEntry] = useState(entryInput);
    const [title, setTitle] = useState(null);
    const [sentiment, setSentiment] = useState("Neutral");
    const [text, setText] = useState("");
    const [locked, setLocked] = useState(false);
    const [passwordModalParams, setPasswordModalParams] = useState(null);

    const [editingTitle, setEditingTitle] = useState(false);
    const [editingSentiment, setEditingSentiment] = useState(false);

    useEffect(() => {
        
        if (!entryId) {
            navigate(homeRoute);
        }

        if (entry === null) {
            fetchEntry(entryId, setEntry);
        }
    }, [entry, entryId, navigate]);

    useEffect(() => {
        if (entry && entry.entry_data && entry.entry_data.title) {
            setTitle(entry.entry_data.title);
        }
        
        if (entry && entry.entry_data && entry.entry_data.locked) {
            setLocked(true);
            setPasswordModalParams({
                prompt: "Enter password to view entry.",
                callback: openLockedEntry,
                cancel: null
            });
        }

        if (entry && entry.entry_data && entry.entry_data.text && !entry.entry_data.locked) {
            setText(entry.entry_data.text);
        }

        if (entry && entry.entry_data && entry.entry_data.sentiment) {
            setSentiment(capitalize(entry.entry_data.sentiment));
        }
    }, [entry]);

    const onClickEdit = () => {
        navigate(editRoute + entryId, {replace: false, state: {text: text}});
    };

    const onClickCurrentTitle = () => {
        setEditingTitle(true);
        titleRef.current.focus(); // TODO - this doesn't work
    }

    const onChangeTitle = (e) => {
        setTitle(e.target.value);
    }

    const onKeyDown = (e) => {
        if (e.charCode === 13 || e.keyCode === 13) {
            e.preventDefault();
            e.stopPropagation();
            onSaveTitle();
        }
    }
    
    const onSaveTitle = () => {
        setEditingTitle(false);
        updateTextEntry(entryId, { title }, null, resp => {});
    }

    const onChangeSentiment = (sentiment) => {
        setEditingSentiment(false);
        setSentiment(capitalize(sentiment));
        updateTextEntry(entryId, { sentiment }, null, resp => {});
    }

    const onClickDelete = () => {
        if (window.confirm('Are you sure you want to delete this entry?')) {
            deleteEntry(entryId, resp => {
                if (resp) {
                    navigate(homeRoute);
                }
            });
        }
    };

    const openLockedEntry = (password) => {
        fetchLockedEntry(entryId, password, data => {
            setText(data.entry_data.text);
            setPasswordModalParams(null);
        })
    };
        

    const onClickLock = () => {
        if (!locked) {
            setPasswordModalParams({
                prompt: "Enter password to lock entry.",
                callback: onLockEntry,
                cancel: () => setPasswordModalParams(null)
            });
        } 
    };

    const onLockEntry = (password) => {
        lockEntry(entryId, password, data => {
            setLocked(true);
            setPasswordModalParams(null);
        });
    };

    const onClickUnlock = () => {
        if (locked) {
            setPasswordModalParams({
                prompt: "Enter password to unlock entry.",
                callback: onUnlockEntry,
                cancel: () => setPasswordModalParams(null)
            });
        } 
    };

    const onUnlockEntry = (password) => {
        unlockEntry(entryId, password, data => {
            setLocked(false);
            setPasswordModalParams(null);
        });
    };

    let wordCount = text.split(" ").length;
    let sentenceCount = text.split(/[.!?]/).length;

    let tags = entry && entry.tags ? entry.tags : [];
    let memory = entry && ! equalsDate(new Date(entry.functional_datetime), new Date(entry.created_on));

    return (
        <BasePage>
            {
                passwordModalParams ?
                <PasswordModal prompt={passwordModalParams.prompt} callback={passwordModalParams.callback} cancel={passwordModalParams.cancel} /> : null
            }
            <div class="container sm-margin-top">
                <div className="row text-left lg-margin-top" style={{ paddingBottom: "8%" }}>
                    <div className="col-sm-8">
                        <div className="row text-left">
                            <div className="col-md-10 text-left">
                                {editingTitle ? 
                                    <ClickOutsideTracker callback={onSaveTitle}>
                                        <input className="form-control form-control-inner" id="viewTitle" name="viewTitle" type="text" ref={titleRef}
                                            defaultValue={title ? title : ""} onKeyDown={onKeyDown} onChange={onChangeTitle} placeholder="Press enter to save" />
                                    </ClickOutsideTracker> : 
                                    <>{title ?
                                        <h1 id="titleTrigger" style={{ marginBottom: "5px" }} onClick={onClickCurrentTitle}>{title}</h1> :
                                        <h2 id="untitledTrigger" class="text-muted" style={{ marginBottom: "5px" }} onClick={onClickCurrentTitle}>Untitled (click to add)</h2>
                                    }
                                    </>
                                }
                                <h3 className="text-muted" style={{ marginLeft: "3px", marginTop: "0px" }}>
                                    {entry && entry.functional_datetime ? 
                                        <Moment date={entry.functional_datetime} format={`MMM Do ${memory ? "" : "ha"}`} /> : null 
                                    }
                                </h3>
                            </div>
                            <div className="col-md-2">
                                <div className="row">
                                    <div className="col-xs-12">
                                        <span className="badge badge-secondary"
                                            style={{ backgroundColor: (memory ? "#d09500" : "#1cb2b5"), marginTop: "18px" }}>{memory ? "Memory" : "Live"}</span>
                                    </div>
                                    <div className="col-xs-12">
                                        <span onClick={onClickEdit} className="badge badge-secondary" style={{ cursor: 'pointer' }}>Edit</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="lg-margin-top text-center">
                            <div id="read-entry" className="text-left" style={{ fontSize: "18px", color: "var(--dm-text)" }}>
                                {text}
                            </div>
                        </div>
                    </div>
                    <div className="col-sm-4">
                        <div className="well">
                            <div style={{ textAlign: "right" }} >
                                <span style={{ float: "left" }} >
                                    <i className={locked ? "fa fa-lock" : "fa fa-unlock"} aria-hidden="true" style={{ color: "var(--dm-text)", fontSize: "xx-large" }}></i>
                                </span>
                                <div className="wrapper toggleFormOn" style={{ padding: "0px", margin: "0px", backgroundColor: "transparent", border: "none" }}>
                                    <span id="cancelButton" style={{ cursor: "pointer", color: "#263859", backgroundColor: "#fcfcfc" }}
                                        className="badge badge-secondary" >
                                        Cancel</span>
                                </div>
                                <span id="saveButton" className="badge badge-secondary toggleFormOn"
                                    style={{
                                        color: "#ffffff", backgroundColor: "#3c60d8", cursor: "pointer"
                                    }}>
                                    Save
                                </span>
                            </div>
                            { editingSentiment ?
                                (<div>
                                    <ClickOutsideTracker callback={() => setEditingSentiment(false)}>
                                        <div id="emotion-change" onClick={() => onChangeSentiment("positive")} style={{ backgroundColor: getSentimentColor("Positive") }}>
                                            <h3 className="text-center emotion-center-change" id="originalSentiment" >Positive</h3>
                                        </div>
                                        <div id="emotion-change" onClick={() => onChangeSentiment("neutral")} style={{ backgroundColor: getSentimentColor("Neutral") }}>
                                            <h3 className="text-center emotion-center-change" id="originalSentiment">Neutral</h3>
                                        </div>
                                        <div id="emotion-change" onClick={() => onChangeSentiment("negative")} style={{ backgroundColor: getSentimentColor("Negative") }}>
                                            <h3 className="text-center emotion-center-change" id="originalSentiment">Negative</h3>
                                        </div>
                                        <div className="text-center" style={{
                                            paddingTop: "10px"
                                        }} >
                                            <span style={{ color: "var(--dm-text)" }} >select preferred sentiment</span>
                                            
                                        </div>
                                    </ClickOutsideTracker>
                                </div>):
                                (<div>
                                    <div id="emotion-circle" style={{ backgroundColor: getSentimentColor(sentiment), cursor: "pointer" }} onClick={() => setEditingSentiment(true)}>
                                        <h3 className="text-center emotion-center" id="originalSentiment">{sentiment}</h3>
                                        <h3 id="emotion-label">Emotion</h3>
                                    </div>
                                    <div className="text-center" style={{
                                        paddingTop: "10px"
                                    }} >
                                        <span style={{ color: "var(--dm-text)" }} >(click to change)</span>
                                    </div>
                                </div>)}
                            <hr style={{ marginTop: "40p", fontSize: "1px", background: "#111111", height: "1px", opacity: "0.5" }} />
                            <div id="topiclist">
                                <h2 style={{ marginTop: "0px", marginBottom: "12px" }} >Tags</h2>
                                <p className="text-muted">Tags for this entry</p>
                                <div>
                                    {tags.length === 0 ? <h3 className="text-muted">No Tags Found</h3> : null}
                                    {tags.map((tag, i) => (
                                        <>  
                                            {i > 0 ?
                                            <hr style={{
                                                fontSize: "1px", background: "#111111", height: "1px", opacity: "0.1", marginBottom: "0px"
                                            }} /> :
                                            null }

                                            <h3 style={{ marginTop: "5px" }}>
                                                {capitalize(tag)}
                                            </h3>
                                        </>
                                    ))}
                                </div>
                            </div>
                            <hr style={{ fontSize: "1px", background: "#111111", height: "1px", opacity: "0.5" }} />
                            <div>
                                <h2 style={{marginTop: '0px', marginBottom: '12px'}}>Size</h2>
                                <div class="row text-center">
                                    <div class="col-lg-6">
                                        <h4 class="text-left">Word Count</h4>
                                    </div>
                                    <div class="col-lg-6">
                                        <h4>{wordCount}</h4>
                                    </div>
                                </div>
                                <div class="row text-center">
                                    <div class="col-lg-6">
                                        <h4 class="text-left">Sentence Count</h4>
                                    </div>
                                    <div class="col-lg-6">
                                        <h4>{sentenceCount}</h4>
                                    </div>
                                </div>
                            </div>
                            <div style={{ marginTop: "10px", textAlign: "center" }}>
                                {
                                    locked ?
                                    <button id="lockButton" className="btn btn-lg btn-info" type="button" onClick={onClickUnlock}
                                    style={{ display: "inline" }}>Unlock Entry</button> :
                                    <button id="lockButton" className="btn btn-lg btn-info" type="button" onClick={onClickLock}
                                    style={{ display: "inline" }}>Lock Entry</button>
                                }
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="row text-center">
                <button className="btn btn-lg btn-danger"
                    onClick={onClickDelete}><i className="fa fa-trash-o"
                        aria-hidden="true"></i>
                    &nbsp; <b>Delete this Entry</b>
                </button>
            </div>
        </BasePage>
    );
};

const capitalize = (string) => {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

const getSentimentColor = (sentiment) => {
    if (sentiment === "Negative") {
        return "#ffdada";
    } else if (sentiment === "Positive") {
        return "#c8ffe1";
    } else {
        return "#cbf6ff";
    }
};