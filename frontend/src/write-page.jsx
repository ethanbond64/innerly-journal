import React, { useEffect, useState, useRef } from "react";
import moment from 'moment';
import { homeRoute, viewRoute } from "./constants.js";
import { fetchEntry, insertTextEntry, updateTextEntry } from "./requests.js";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { getDateNoTime } from "./utils.jsx";

const ARROW_LINE = 0.25; // 25% from top of viewport

// Measures the pixel offset of the caret within the textarea's scroll area
// using a hidden mirror div to account for word-wrap accurately.
function getCaretOffsetTop(textarea, selectionIndex) {
    const idx = selectionIndex !== undefined ? selectionIndex : textarea.selectionEnd;
    const cs = window.getComputedStyle(textarea);
    const mirror = document.createElement('div');

    mirror.style.cssText = `
        position: absolute;
        top: -9999px;
        left: -9999px;
        width: ${textarea.clientWidth}px;
        font-family: ${cs.fontFamily};
        font-size: ${cs.fontSize};
        font-weight: ${cs.fontWeight};
        line-height: ${cs.lineHeight};
        letter-spacing: ${cs.letterSpacing};
        padding-top: ${cs.paddingTop};
        padding-right: ${cs.paddingRight};
        padding-bottom: 0px;
        padding-left: ${cs.paddingLeft};
        border-top-width: ${cs.borderTopWidth};
        border-right-width: ${cs.borderRightWidth};
        border-bottom-width: 0px;
        border-left-width: ${cs.borderLeftWidth};
        border-style: solid;
        box-sizing: border-box;
        white-space: pre-wrap;
        word-break: break-word;
        overflow: hidden;
    `;

    mirror.textContent = textarea.value.substring(0, idx);
    const marker = document.createElement('span');
    marker.textContent = '​'; // zero-width space to mark caret position
    mirror.appendChild(marker);
    document.body.appendChild(mirror);

    const top = marker.offsetTop;
    const height = marker.offsetHeight;
    document.body.removeChild(mirror);

    return { top, height };
}

function smoothScrollTo(element, targetScrollTop, duration = 350) {
    const start = element.scrollTop;
    const diff = targetScrollTop - start;
    if (Math.abs(diff) < 2) return;

    const startTime = performance.now();
    const tick = (now) => {
        const t = Math.min((now - startTime) / duration, 1);
        const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // ease-in-out
        element.scrollTop = start + diff * ease;
        if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}


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
    };

    const heading = functionalDatetime ? (<> Write an entry for the date {moment(functionalDatetime).format("MMMM Do YYYY")}</>) :
        "Write about any thoughts, experiences, or ideas";

    return <WritePageBase onSumbit={onSubmit} heading={heading} functionalDatetime={functionalDatetime} />;
};

export const EditPage = () => {

    const location = useLocation();
    const navigate = useNavigate();
    const { entryId } = useParams();
    const [text, setText] = useState(location.state ? location.state.text : null);
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
            if (text === null) {
                setText(data.entry_data.text ? data.entry_data.text : '');
            }
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

    const heading = (<>Editing: <i><b>{title ? title : "Untitled"}</b></i>{functionalDatetime ? <> from {moment(functionalDatetime).format("MMMM Do YYYY")}</> : null}</>);

    return text === null ? null : <WritePageBase onSumbit={onSubmit} heading={heading} initialId={entryId} text={text} />;
};

export const WritePageBase = ({ onSumbit, heading, functionalDatetime = null,
                                initialId = null, text = '' }) => {

    const navigate = useNavigate();
    const [showHeader, setShowHeader] = useState(true);
    const [untrackedChanges, setUntrackedChanges] = useState(false);
    const [asyncSaving, setAsyncSaving] = useState(false);
    const [entryId, setEntryId] = useState(initialId);

    const textareaRef = useRef(null);
    const modeRef = useRef('typewriter'); // 'typewriter' | 'free'
    const lastProgScrollRef = useRef(0); // timestamp of last programmatic scroll

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

    // Any scroll within 500ms of a programmatic scroll is considered programmatic.
    // This covers the full 350ms smooth-scroll animation plus margin.
    const isProgrammaticScroll = () => Date.now() - lastProgScrollRef.current < 500;

    // Scrolls the textarea so the caret sits at the arrow line.
    const scrollCaretToArrow = (textarea, animate = false) => {
        const arrowY = window.innerHeight * ARROW_LINE;
        const rect = textarea.getBoundingClientRect();
        const { top: caretTop, height: caretHeight } = getCaretOffsetTop(textarea);
        const targetScrollTop = caretTop + caretHeight - (arrowY - rect.top);

        lastProgScrollRef.current = Date.now();
        if (animate) {
            smoothScrollTo(textarea, Math.max(0, targetScrollTop));
        } else {
            textarea.scrollTop = Math.max(0, targetScrollTop);
        }
    };

    // Returns the caret's current Y position in viewport coordinates.
    const getCaretViewportBottom = (textarea) => {
        const rect = textarea.getBoundingClientRect();
        const { top: caretTop, height: caretHeight } = getCaretOffsetTop(textarea);
        return rect.top + caretTop + caretHeight - textarea.scrollTop;
    };

    // User scrolled manually. If the caret is now below the arrow line, enter FREE mode.
    const handleTextareaScroll = () => {
        if (isProgrammaticScroll()) return;
        const textarea = textareaRef.current;
        if (!textarea || modeRef.current === 'free') return;

        const arrowY = window.innerHeight * ARROW_LINE;
        if (getCaretViewportBottom(textarea) > arrowY) {
            modeRef.current = 'free';
        }
    };

    const onTextChange = () => {
        // Autosave logic (unchanged)
        setUntrackedChanges(true);
        if (!asyncSaving) {
            setAsyncSaving(true);
            if (entryId === null) {
                // TODO need to suspend tags and sentiment analysis until the user clicks save.
                setTimeout(() => {
                    setUntrackedChanges(false);
                    const writeTo = textareaRef.current;
                    if (writeTo) {
                        insertTextEntry(writeTo.value, functionalDatetime, data => {
                            setEntryId(data.id);
                            setAsyncSaving(false);
                        }); // TODO need fn datetime
                    }
                }, 3000); // TODO handle failure
            } else {
                setTimeout(() => {
                    setUntrackedChanges(false);
                    const writeTo = textareaRef.current;
                    if (writeTo) {
                        updateTextEntry(entryId, { text: writeTo.value }, null, () => {
                            setAsyncSaving(false);
                        });
                    }
                }, 3000); // TODO handle failure
            }
        }

        // Typewriter autoscroll
        const textarea = textareaRef.current;
        if (!textarea) return;

        const arrowY = window.innerHeight * ARROW_LINE;
        const caretViewportBottom = getCaretViewportBottom(textarea);

        if (modeRef.current === 'typewriter') {
            // Caret passed below the arrow — scroll it back up to the line.
            if (caretViewportBottom > arrowY) {
                scrollCaretToArrow(textarea, false);
            }
        } else {
            // FREE mode: if the caret is above the arrow (user scrolled past the text,
            // then started typing at the end), snap back and re-enter typewriter mode.
            if (caretViewportBottom < arrowY) {
                scrollCaretToArrow(textarea, true);
                modeRef.current = 'typewriter';
            }
        }
    };

    // Arrow click: move cursor to end, animate scroll to arrow line, re-enter typewriter mode.
    const handleArrowClick = () => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
        scrollCaretToArrow(textarea, true);
        modeRef.current = 'typewriter';
    };

    const onSubmitInner = (e) => {
        e.preventDefault();
        const text = textareaRef.current.value;
        if (entryId === null) {
            onSumbit(text);
        } else {
            updateTextEntry(entryId, { text }, null, (data) => {
                navigate(viewRoute + data.id);
            });
        }
    };

    return (
        <main style={{ height: '90vh', padding: '0', marginBottom: '0' }} className="container">
            {/* Fixed arrow marking the autoscroll line at 25% from top */}
            <div
                onClick={handleArrowClick}
                style={{
                    position: 'fixed',
                    top: `${ARROW_LINE * 100}vh`,
                    left: '1rem',
                    transform: 'translateY(-50%)',
                    opacity: showHeader ? 0.5 : 0,
                    transition: 'opacity 0.5s',
                    cursor: 'pointer',
                    fontSize: '1.2rem',
                    color: '#888',
                    zIndex: 1000,
                }}
                title="Return to typewriter mode"
            >
                <i className="fa fa-chevron-right" aria-hidden="true" />
            </div>

            <div className="row text-center" style={{ height: '90%' }}>
                <div className="col-md-2 hidden-sm hidden-xs text-left">
                    <a href={homeRoute} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
                        <img src="/images/innerly_wordmark_200616_03.png" style={{ opacity: showHeader ? 1 : 0, marginTop: '30px' }} className="img-responsive md-margin-right" width="170" height="80" id="innerlyImage" title="Innerly" alt="Innerly" />
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
                                <span className="nremove hidden-xs">{showHeader ? 'Save ' : null}</span>
                                <b><i className="fa fa-chevron-right" aria-hidden="true"></i></b>
                            </button>
                            <span style={{ float: 'right', marginRight: '8px', fontSize: 'xx-large', textAlign: 'center', marginTop: '-6px', color: (untrackedChanges ? '#ffcc00' : '#00ff00') }}>•</span>
                        </div>
                        <div id="progressbar">
                            <div style={{ height: '0px', width: '0%' }}></div>
                        </div>
                    </div>
                    <div className="form-group" style={{ height: '97%' }}>
                        <textarea
                            ref={textareaRef}
                            className="form-control form-control-inner"
                            id="writeto"
                            name="entry"
                            onChange={onTextChange}
                            onScroll={handleTextareaScroll}
                            style={{ marginTop: '20px', paddingBottom: '75vh' }}
                            defaultValue={text}
                        />
                    </div>
                    <div className="writeto-display"></div>
                </div>
                <div className="col-lg-2 hidden-md hidden-sm hidden-xs"></div>
            </div>
        </main>
    );
};
