import React from "react";
import { homeRoute } from "./constants";
import { insertTextEntry } from "./requests";
import { useNavigate } from "react-router-dom";

export const WritePage = () => {

    const navigate = useNavigate();

    const onClick = () => {
        console.log('submit');
        insertTextEntry(document.getElementById('writeto').value, (data) => console.log(data));
        navigate(homeRoute);
    };

    return (
        <main style={{ height: `90vh`, padding: '0', marginBottom: '0' }} className="container" >
                <div className="row text-center" style={{ height: '90%' }}>
                    <div className="col-md-2 hidden-sm hidden-xs text-left" >
                        <a href={homeRoute}>
                            <img src="/images/innerly_wordmark_200616_03.png" className="img-responsive md-margin-right" width="170" height="80" id="innerlyImage" title="Innerly" style={{ marginTop: '30px', }} alt="Innerly" />
                        </a>
                    </div>
                    <div className="col-lg-8 col-md-10" style={{ height: '97%' }}>
                        <div id="session-details" className="writeto-display" style={{ textAlign: 'left', border: 'none', overflow: 'visible', paddingTop: '50px' }}>
                            <div>
                                <a href={homeRoute} className="btn btn-warning btn-block hidden-xl hidden-lg hidden-md hidden-sm" style={{ width: 'auto', float: 'left' }}>
                                    <b><i className="fa fa-chevron-left" aria-hidden="true"></i></b>
                                    <span>Back</span>
                                </a>
                                <span className="disappear hidden-xs" style={{ padding: '12px', }}>Write about any thoughts, experiences, or ideas</span>
                                <button id="submitbtn" type="submit" onClick={onClick} className="btn btn-info btn-block" style={{ width: 'auto', float: 'right', color: 'white', marginRight: '12px' }}>
                                    <span className="nremove hidden-xs" >Save</span>
                                    <span className="hidden-xl hidden-lg hidden-md hidden-sm">Save</span>
                                    <b><i className="fa fa-chevron-right" aria-hidden="true"></i></b>
                                </button>
                            </div>
                        </div>
                        <div className="form-group" style={{ height: '97%' }}>
                            <textarea className="form-control" id="writeto" name="entry"></textarea>
                        </div>
                        <div className="writeto-display"></div>
                    </div>
                    <div className="col-lg-2 hidden-md hidden-sm hidden-xs"></div>
                </div>
        </main>
    );
};
