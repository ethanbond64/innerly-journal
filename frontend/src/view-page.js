import React, { useState } from "react";
import { useParams } from "react-router-dom";
import Moment from 'react-moment';
import { homeRoute } from "./constants";

export const ViewPage = () => {

    let { entryId } = useParams();

    const [title, setTitle] = useState(null);
    const [time, setTime] = useState(null);
    const [text, setText] = useState("Lorem ipsum");
    const [sentiment, setSentiment] = useState("Neutral");
    const [sentimentColor, setSentimentColor] = useState("#cbf6ff");
    const [isMemory, setIsMemory] = useState(false);
    const [locked, setLocked] = useState(false);

    return (
        <main className={`container sm-margin-top`}>
            <div class="container sm-margin-top">
                <div className="row text-left lg-margin-top" style={{ paddingBottom: "8%" }}>
                    <div className="col-sm-8">
                        <div className="row text-left">
                            <div className="col-md-10 text-left">

                                {title ?
                                    <h1 id="titleTrigger" style={{ marginBottom: "5px" }}>title</h1> :
                                    <h2 id="untitledTrigger" class="text-muted" style={{ marginBottom: "5px" }}>Untitled (click to add)</h2>
                                }
                                <input className="form-control" id="viewTitle" name="viewTitle" type="text"
                                    value={title ? title : ""} placeholder="Press enter to save" />

                                <h3 className="text-muted" style={{ marginLeft: "3px", marginTop: "0px" }}>
                                    <Moment date={time} format={`MMM Do ${isMemory ? "" : "ha"}`} />
                                </h3>
                            </div>
                            <div className="col-md-2">
                                <div className="row">
                                    <div className="col-xs-12">
                                        <span className="badge badge-secondary"
                                            style={{ backgroundColor: (isMemory ? "#d09500" : "#1cb2b5"), marginTop: "18px" }}>{isMemory ? "Memory" : "Live"}</span>
                                    </div>
                                    <div className="col-xs-12">
                                        <a href="TODO EDIT URL">
                                            <span className="badge badge-secondary">Edit</span>
                                        </a>
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
                                <span style={{ float: "left" }} ><i className={locked ? "fa fa- lock" : "fa fa-unlock"} aria-hidden="true"
                                    style={{ color: "var(--dm-text)", fontSize: "xx-large" }}></i></span>
                                <span className="badge badge-secondary" id="editLabels"
                                    style={{
                                        cursor: "pointer", color: "#263859", backgroundColor: "#fcfcfc"
                                    }}> Edit Labels</span>
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
                            <div className="modal hide" id="exampleModal" role="dialog" tabindex="-1"
                                aria-labelledby="exampleModalLabel" aria-hidden="true">
                                <div className="modal-dialog" role="document">
                                    <div className="modal-content">
                                        <div className="modal-header">
                                            <h3 className="modal-title" id="exampleModalLabel">Correct Emotion</h3>
                                            <p>Sometimes the model analyzes your emotion and gets it wrong. Help make Innerly better
                                                by selecting a
                                                more appropriate emotion.</p>
                                        </div>
                                        <div className="modal-body">
                                            <div className="custom-control custom-radio">
                                                <input type="radio" id="PositiveSelection" name="emotionSelection" value="Positive"
                                                    className="custom-control-input" />
                                                <label className="custom-control-label" for="PositiveSelection"
                                                    style={{ color: "var(--dm-text)" }}>Positive</label>
                                            </div>
                                            <div className="custom-control custom-radio">
                                                <input type="radio" id="NeutralSelection" name="emotionSelection" value="Neutral"
                                                    className="custom-control-input" checked />
                                                <label className="custom-control-label" for="NeutralSelection"
                                                    style={{ color: "var(--dm-text)" }} > Neutral</label>
                                            </div>
                                            <div className="custom-control custom-radio">
                                                <input type="radio" id="NegativeSelection" name="emotionSelection" value="Negative"
                                                    className="custom-control-input" />
                                                <label className="custom-control-label" for="NegativeSelection"
                                                    style={{ color: "var(--dm-text)" }}>Negative</label>
                                            </div>
                                        </div>
                                        <div className="modal-footer">
                                            <button type="button" className="btn btn-info" data-dismiss="modal">Close</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <div id="emotion-circle" style={{ backgroundColor: sentimentColor }}>
                                    <h3 className="text-center emotion-center" id="originalSentiment">{sentiment}</h3>
                                    <h3 id="emotion-label">Emotion</h3>
                                </div>
                                <div className="text-center toggleFormOn" style={{
                                    paddingTop: "10px"
                                }} >
                                    <span style={{ color: "var(--dm-text)", cursor: "pointer" }} type="button" data- toggle="modal"
                                        data-target="#exampleModal" href="#">click to change</span>
                                </div>
                            </div>
                            <hr style={{ marginTop: "40p", fontSize: "1px", background: "#111111", height: "1px", opacity: "0.5" }} />
                            <div id="topiclist">
                                <h2 style={{ marginTop: "0px", marginBottom: "12px" }} > Topics</h2>
                                <p className="text-muted">Topics related to your entry</p>

                                <h3 className="text-muted">No Topics Found</h3>
                                <div>
                                    <hr style={{
                                        fontSize: "1px", background: "#111111", height: "1px", opacity: "0.1", marginBottom: "0px"
                                    }} />
                                    <h3 style={{ marginTop: "5px" }}>
                                        <i style={{ fontSize: "large" }} className="fa fa-times-circle-o removeableto toggleFormOn"
                                            aria-hidden="true"></i>
                                    </h3>
                                </div>
                            </div>
                            <hr style={{ fontSize: "1px", background: "#111111", height: "1px", opacity: "0.5" }} />
                            <div>
                                <h2 style={{
                                    marginTop: "0px", marginBottom: "12px"
                                }}>Details</h2>
                                <p className="text-muted">(People, Places, Organizations...)</p>
                                <div id="thinglist">
                                    <h3 className="text-muted">No Details Found</h3>
                                    <div>
                                        <hr style={{
                                            fontSize: "1px", background: "#111111", height: "1px", opacity: "0.1", marginBottom: "0px"
                                        }} />
                                        <h3 style={{ marginTop: "5px" }}>
                                            <i style={{ fontSize: "large" }} className="fa fa-times-circle-o removeableth toggleFormOn"
                                                aria-hidden="true"></i>
                                        </h3>
                                    </div>
                                </div>
                                <div className="toggleFormOn">
                                    <hr style={{
                                        fontSize: "1px", background: "#111111", height: "1px", opacity: "0.1", marginBottom: "12px"
                                    }} />
                                    <span id="add-thing-toggle"
                                        style={{ marginTop: "15px !important", padding: "8px", backgroundColor: "#1cb2b5", borderRadius: "6px", width: "max-content", cursor: "pointer", color: "#fff", fontSize: "larger" }}>
                                        <i style={{ fontSize: "large" }} className="fa fa-plus" aria-hidden="true"></i>
                                        Add Detail
                                    </span>
                                    <input type="text" name="add-thing" id="add-thing"
                                        style={{ display: "none", height: "30px", borderRadius: "3px", border: "1px solid #548ee6", paddingLeft: "3px;" }}
                                        placeholder="Press enter to add" />
                                </div>
                            </div>
                            <hr style={{ fontSize: "1px", background: "#111111", height: "1px", opacity: "0.5" }} />
                            <div>
                                <h2 style={{ marginTop: "0px", marginBottom: "12px" }}>Size</h2>
                                <div className="row text-center">
                                    <div className="col-lg-6">
                                        <h4 className="text-left">Stat</h4>
                                    </div>
                                    <div className="col-lg-6">
                                        <h4>Stat</h4>
                                    </div>
                                </div>
                            </div>
                            <div style={{ marginTop: "10px", textAlign: "center" }}>
                                <button id="lockButton" className="btn btn-lg btn-info" type="button" data-toggle="modal"
                                    data-target="#lockModal" style={{ display: "inline" }}>{locked ? "Unlock Entry" : "Lock Entry"}</button>
                                <button id="unlockButton" className="btn btn-lg btn-info" type="button" data-toggle="modal"
                                    data-target="#lockModal" onclick="unlockHandler()">Unlock Entry</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="row text-center">
                <a href={homeRoute} className="btn btn-lg btn-danger"
                    onClick="return confirm('Are you sure you want to delete this entry?');"><i className="fa fa-trash-o"
                        aria-hidden="true"></i>
                    &nbsp; <b>Delete this Entry</b></a>
            </div>
        </main>
    );
}

function getSentiment(sentIdx) {
    if (sentIdx === 1) {
        return "Negative";
    } else if (sentIdx === 3) {
        return "Positive";
    } else {
        return "Neutral";
    }
}

function getSentimentColor(sentIdx) {
    if (sentIdx === 1) {
        return "#ffdada";
    } else if (sentIdx === 3) {
        return "#c8ffe1";
    } else {
        return "#cbf6ff";
    }
}