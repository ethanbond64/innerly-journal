import { useEffect, useRef, useState } from "react";
import { ClickOutsideTracker, getLockTtl } from "./utils.jsx";
import { authenticateLock, onLockAuthExpired } from "./requests.js";

const LOCK_TIMEOUT_PROMPT = "Enter password to continue.";

// Quotes back the lifetime the user picked, since that is how long this modal stays away.
const lockTimeoutSubtitle = () => {
    const { value, unit } = getLockTtl();
    const period = value === 1 ? unit.slice(0, -1) : `${value} ${unit}`;
    return `Password is required to lock your entries, but must be re-entered every ${period}.`;
};

// One modal, two uses:
//  - unlocking an entry: the parent passes prompt/callback/cancel and decides when to render it.
//  - a lapsed lock key: mounted once at the app root with watchLockTimeout, it shows itself whenever a
//    request answers 401 with 'lock-auth-expired', and closes only once /api/lock/auth takes the password.
//    A timeout wins over the passed prompt, since nothing else can proceed until the key is cached again.
export const PasswordModal = ({ prompt = null, callback = (p) => {}, cancel = null, watchLockTimeout = false }) => {

    // A ref rather than getElementById, since more than one of these can be mounted at once.
    const passwordRef = useRef(null);
    const [lockTimeout, setLockTimeout] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        return watchLockTimeout ? onLockAuthExpired(() => setLockTimeout(true)) : undefined;
    }, [watchLockTimeout]);

    const onSubmit = () => {
        let password = passwordRef.current.value;
        passwordRef.current.value = '';

        if (!lockTimeout) {
            callback(password);
            return;
        }

        setError(null);
        authenticateLock(password,
            () => setLockTimeout(false),
            () => setError("Incorrect password, please try again."));
    };

    const onKeyDown = (e) => {
        if (e.charCode === 13 || e.keyCode === 13) {
            e.preventDefault();
            e.stopPropagation();
            onSubmit();
        }
    };

    // A lapsed key can only be cleared by entering the password, so there is nothing to cancel.
    const closeable = Boolean(cancel) && !lockTimeout;

    const onCancel = () => {
        if (closeable) {
            passwordRef.current.value = '';
            cancel();
        }
    };

    if (!lockTimeout && !prompt) {
        return null;
    }

    return (
            <div className="modal" id="lockModal" style={{ display: 'block', zIndex: '1006', padding: '30px' }}>
                <div className="modal-dialog" role="document" style={{ padding: '30px' }}>
                    <ClickOutsideTracker callback={onCancel}>
                        <div className="modal-content" >
                            {
                                closeable ?
                                <span className={`closemodal`} onClick={onCancel} style={{ color: 'var(--dm-text)' }}>&times;</span>
                                : null
                            }
                            <div className="modal-header" style={{ padding: '8px' }}>
                                <h3 className="modal-title" id="lockModalLabel">{lockTimeout ? LOCK_TIMEOUT_PROMPT : prompt}</h3>
                                {
                                    lockTimeout ?
                                    <p className="text-muted" id="lockModalSubtitle" style={{ marginTop: '8px', marginBottom: '0px' }}>{lockTimeoutSubtitle()}</p>
                                    : null
                                }
                            </div>
                            <div className="modal-body" style={{ textAlign: "center", margin: "0 auto", padding: '10px'}}>
                                <input type="password" id="password" ref={passwordRef} onKeyDown={onKeyDown} className="form-control" style={{width: "50%", margin: '6px', display: 'inline-block'}} />
                                <button type="button" id="passcodeSave" onClick={onSubmit} className="btn btn-info">Go</button>
                                {
                                    error ?
                                    <p className="text-danger" id="lockModalError" style={{ marginTop: '10px', marginBottom: '0px' }}>{error}</p>
                                    : null
                                }
                            </div>
                        </div>
                    </ClickOutsideTracker>
                </div>
            </div>
    );
}
