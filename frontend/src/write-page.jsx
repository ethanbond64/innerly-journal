import React, { useEffect, useState, useRef } from "react";
import { formatLongDateNoComma } from './date-format.js';
import { homeRoute, viewRoute } from "./constants.js";
import { Icon } from "./icon.jsx";
import { fetchEntry, fetchLockedEntry, insertTextEntry, updateTextEntry } from "./requests.js";
import { Link, useLocation, useNavigate, useParams } from "./router.jsx";
import { getDateNoTime } from "./utils.jsx";
import { putEntry } from "./entry-handoff.js";
import { PasswordModal } from "./password-modal.jsx";
import { clampTypewriterLine, getTypewriterSettings, saveTypewriterSettings } from "./typewriter.js";

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

function smoothScrollTo(element, targetScrollTop, duration = 350, onComplete) {
    const start = element.scrollTop;
    const diff = targetScrollTop - start;
    if (Math.abs(diff) < 2) {
        onComplete && onComplete();
        return;
    }

    const startTime = performance.now();
    const tick = (now) => {
        const t = Math.min((now - startTime) / duration, 1);
        const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // ease-in-out
        element.scrollTop = start + diff * ease;
        if (t < 1) {
            requestAnimationFrame(tick);
        } else {
            onComplete && onComplete();
        }
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
            putEntry(data);
            navigate(viewRoute + data.id);
        });
    };

    const heading = functionalDatetime ? (<> Write an entry for the date {formatLongDateNoComma(functionalDatetime)}</>) :
        "Write about any thoughts, experiences, or ideas";

    return <WritePageBase onSumbit={onSubmit} heading={heading} functionalDatetime={functionalDatetime} />;
};

export const EditPage = () => {

    const location = useLocation();
    const navigate = useNavigate();
    const { entryId } = useParams();
    const [text, setText] = useState(location.state ? location.state.text : null);
    const [title, setTitle] = useState(null);
    const [functionalDate, setFunctionalDate] = useState(null);
    const [passwordModalParams, setPasswordModalParams] = useState(null);

    useEffect(() => {
        if (!entryId) {
            navigate(homeRoute);
        }

        fetchEntry(entryId, (data) => {
            if (data.entry_type !== 'text' || !data.entry_data) {
                navigate(homeRoute);
            }

            setTitle(data.entry_data.title ? data.entry_data.title : null);
            setFunctionalDate(data.functional_datetime ? data.functional_datetime : null);

            if (text !== null) {
                return;
            }

            // The view page hands the plaintext over in location.state. Arriving any other way
            // (a link, a bookmark, a reload) hands over ciphertext instead, which must never
            // reach the editor: saving it would encrypt the ciphertext a second time.
            if (data.entry_data.locked) {
                setPasswordModalParams({
                    prompt: "Enter password to edit entry.",
                    callback: (password) => fetchLockedEntry(entryId, password, (unlocked) => {
                        setPasswordModalParams(null);
                        setText(unlocked.entry_data.text ? unlocked.entry_data.text : '');
                    }),
                    cancel: () => navigate(viewRoute + entryId)
                });
                return;
            }

            setText(data.entry_data.text ? data.entry_data.text : '');
        });

    }, [entryId, navigate]);

    const onSubmit = (text) => {
        if (entryId) {
            updateTextEntry(entryId, { text }, null, (data) => {
                putEntry(data);
                navigate(viewRoute + data.id);
            });
        }
    };

    const heading = (<>Editing: <i><b>{title ? title : "Untitled"}</b></i>{functionalDate ? <> from {formatLongDateNoComma(new Date(functionalDate))}</> : null}</>);

    if (text === null) {
        return passwordModalParams ? <PasswordModal {...passwordModalParams} /> : null;
    }

    return <WritePageBase onSumbit={onSubmit} heading={heading} initialId={entryId} text={text} />;
};

export const WritePageBase = ({ onSumbit, heading, functionalDatetime = null,
                                initialId = null, text = '' }) => {

    const navigate = useNavigate();
    const [showHeader, setShowHeader] = useState(true);

    const entryIdRef = useRef(initialId);
    const dirtyRef = useRef(false);   // text differs from what the server has
    const savingRef = useRef(false);  // a save request is in flight

    const [saveState, setSaveState] = useState('saved'); // drives the status dot only
    const textareaRef = useRef(null);
    const arrowRef = useRef(null);
    const lastProgScrollRef = useRef(0); // timestamp of last programmatic scroll

    const [typewriter, setTypewriter] = useState(() => getTypewriterSettings());
    const modeRef = useRef(typewriter.enabled ? 'typewriter' : 'free'); // 'typewriter' | 'free'
    const enabledRef = useRef(typewriter.enabled);
    const arrowLineRef = useRef(typewriter.line);
    const [dragging, setDragging] = useState(false);
    const dragStateRef = useRef(null);

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

    useEffect(() => {
        const positionArrow = () => {
            if (textareaRef.current && arrowRef.current) {
                const left = textareaRef.current.getBoundingClientRect().left;
                arrowRef.current.style.left = `${left - 38}px`;
            }
        };
        positionArrow();
        window.addEventListener('resize', positionArrow);
        return () => window.removeEventListener('resize', positionArrow);
    }, []);


    // Any scroll within 500ms of a programmatic scroll is considered programmatic.
    // This covers the full 350ms smooth-scroll animation plus margin.
    const isProgrammaticScroll = () => Date.now() - lastProgScrollRef.current < 500;

    // Scrolls the textarea so the caret sits at the arrow line.
    // Hides the scrollbar for the duration so it only appears during manual scrolls.
    const scrollCaretToArrow = (textarea, animate = false) => {
        const arrowY = window.innerHeight * arrowLineRef.current;
        const rect = textarea.getBoundingClientRect();
        const { top: caretTop, height: caretHeight } = getCaretOffsetTop(textarea);
        const targetScrollTop = caretTop + caretHeight - (arrowY - rect.top);

        lastProgScrollRef.current = Date.now();
        textarea.style.overflowY = 'hidden';

        if (animate) {
            smoothScrollTo(textarea, Math.max(0, targetScrollTop), 350, () => {
                textarea.style.overflowY = '';
            });
        } else {
            textarea.scrollTop = Math.max(0, targetScrollTop);
            requestAnimationFrame(() => { textarea.style.overflowY = ''; });
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
        if (!enabledRef.current || isProgrammaticScroll()) return;
        const textarea = textareaRef.current;
        if (!textarea || modeRef.current === 'free') return;

        const arrowY = window.innerHeight * arrowLineRef.current;
        if (getCaretViewportBottom(textarea) > arrowY) {
            modeRef.current = 'free';
        }
    };

    // Autosave: every 3 seconds, save if the text is dirty and nothing is in flight. A
    // failed save leaves the text dirty, so the next tick simply tries again.
    useEffect(() => {
        const onSaved = (data) => {
            savingRef.current = false;
            if (data && data.id) {
                entryIdRef.current = data.id;
            }
            // Edits made while the request was in flight are still unsaved.
            setSaveState(dirtyRef.current ? 'unsaved' : 'saved');
        };

        const onFailed = () => {
            savingRef.current = false;
            dirtyRef.current = true; // the text never reached the server
            setSaveState('failed');
        };

        const timer = setInterval(() => {
            const writeTo = textareaRef.current;
            if (!dirtyRef.current || savingRef.current || !writeTo) return;

            dirtyRef.current = false;
            savingRef.current = true;

            if (entryIdRef.current === null) {
                // TODO need to suspend tags and sentiment analysis until the user clicks save.
                insertTextEntry(writeTo.value, functionalDatetime, onSaved, onFailed);
            } else {
                updateTextEntry(entryIdRef.current, { text: writeTo.value }, null, onSaved, onFailed);
            }
        }, 3000);

        return () => clearInterval(timer);
    }, [functionalDatetime]);

    const onTextChange = () => {
        dirtyRef.current = true;
        // A failure stays red until a save actually succeeds.
        setSaveState(prev => prev === 'failed' ? prev : 'unsaved');

        // Typewriter autoscroll
        const textarea = textareaRef.current;
        if (!textarea || !enabledRef.current || dragStateRef.current) return;

        const arrowY = window.innerHeight * arrowLineRef.current;
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

    // Arrow drag: pick up the arrow and drop it on a new line. A press that never
    // moves is treated as a click (see the mouseup handler below).
    const handleArrowMouseDown = (e) => {
        e.preventDefault();
        dragStateRef.current = { startY: e.clientY, moved: false };
        setDragging(true);
    };

    useEffect(() => {
        if (!dragging) return;

        const onMove = (e) => {
            const dragState = dragStateRef.current;
            if (!dragState) return;
            if (Math.abs(e.clientY - dragState.startY) > 3) dragState.moved = true;

            const line = clampTypewriterLine(e.clientY / window.innerHeight);
            arrowLineRef.current = line;
            setTypewriter((prev) => ({ ...prev, line }));
        };

        const onUp = () => {
            const dragState = dragStateRef.current;
            dragStateRef.current = null;
            setDragging(false);
            if (!dragState) return;

            if (!dragState.moved) {
                handleArrowClick();
                return;
            }

            saveTypewriterSettings({ line: arrowLineRef.current });

            // Bring the caret back to the arrow's new home.
            const textarea = textareaRef.current;
            if (textarea && modeRef.current === 'typewriter') {
                scrollCaretToArrow(textarea, true);
            }
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    // eslint-disable-next-line
    }, [dragging]);

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
        if (entryIdRef.current === null) {
            onSumbit(text);
        } else {
            updateTextEntry(entryIdRef.current, { text }, null, (data) => {
                putEntry(data);
                navigate(viewRoute + data.id);
            });
        }
    };

    return (
        <main style={{ height: '90vh', padding: '0', marginBottom: '0' }} className="container">
            <style>{`
                .typewriter-arrow { border-left-color: black; }
                html[data-theme='dark'] .typewriter-arrow { border-left-color: white; }
                .typewriter-guide { border-top: 1px dashed rgba(0, 0, 0, 0.35); }
                html[data-theme='dark'] .typewriter-guide { border-top-color: rgba(255, 255, 255, 0.35); }
            `}</style>
            {/* Fixed arrow marking the autoscroll line, draggable to move the line */}
            {typewriter.enabled && <>
                {dragging && <div
                    className="typewriter-guide"
                    style={{
                        position: 'fixed',
                        left: 0,
                        right: 0,
                        top: `${typewriter.line * 100}vh`,
                        pointerEvents: 'none',
                        zIndex: 999,
                    }}
                />}
                <div
                    ref={arrowRef}
                    onMouseDown={handleArrowMouseDown}
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                    style={{
                        position: 'fixed',
                        top: `${typewriter.line * 100}vh`,
                        transform: 'translateY(-50%)',
                        padding: '16px',
                        cursor: dragging ? 'grabbing' : 'pointer',
                        zIndex: 1000,
                    }}
                    title="Click to return to typewriter mode, drag to move the line"
                >
                    <div
                        className="typewriter-arrow"
                        style={{
                            opacity: showHeader || dragging ? 1 : 0,
                            transition: 'opacity 0.5s',
                            width: 0,
                            height: 0,
                            borderTop: '8px solid transparent',
                            borderBottom: '8px solid transparent',
                            borderLeftWidth: '14px',
                            borderLeftStyle: 'solid',
                        }}
                    />
                </div>
            </>}

            <div className="row text-center" style={{ height: '90%' }}>
                <div className="col-md-2 hidden-sm hidden-xs text-left">
                    <Link to={homeRoute} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
                        <img src="/images/innerly_wordmark_200616_03.png" style={{ opacity: showHeader ? 1 : 0, marginTop: '30px' }} className="img-responsive md-margin-right" width="170" height="80" id="innerlyImage" title="Innerly" alt="Innerly" />
                    </Link>
                </div>
                <div className="col-lg-8 col-md-10" style={{ height: '97%' }}>
                    <div id="session-details" className="writeto-display" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} style={{ textAlign: 'left', border: 'none', overflow: 'visible', paddingTop: '50px' }}>
                        <div>
                            <Link to={homeRoute} className="btn btn-warning btn-block hidden-xl hidden-lg hidden-md hidden-sm" style={{ width: 'auto', float: 'left' }}>
                                <b><Icon name="chevron-left" /></b>
                                <span>Back</span>
                            </Link>
                            <span className={`disappear hidden-xs`} style={{ padding: '12px', opacity: showHeader ? 1 : 0 }}>{heading}</span>
                            <button id="submitbtn" type="submit" onClick={onSubmitInner} className="btn btn-info btn-block" style={{ width: 'auto', float: 'right', color: 'white', marginRight: '12px' }}>
                                <span className="nremove hidden-xs">{showHeader ? 'Save ' : null}</span>
                                <b><Icon name="chevron-right" /></b>
                            </button>
                            <span style={{ float: 'right', marginRight: '8px', fontSize: 'xx-large', textAlign: 'center', marginTop: '-6px', color: ({ failed: '#ff3b30', unsaved: '#ffcc00', saved: '#00ff00' })[saveState] }}>•</span>
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
