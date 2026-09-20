import React, { useEffect, useState } from "react";
import { useNavigate } from "./router.jsx";
import { BasePage } from "./base-page.jsx";
import { getUserData, setUserData, clearLocalStorage, getLockTtl } from "./utils.jsx";
import { loginRoute } from "./constants.js";
import { PageLoader } from "./page-loader.jsx";
import { Notification } from "./notification.jsx";
import { updatePassword, updateUser, importEntries, getImportStatus, getImportFiles, cancelImport } from "./requests.js";
import { useDarkMode } from "./dark-mode.js";
import { getTypewriterSettings, saveTypewriterSettings } from "./typewriter.js";
import { TYPEWRITER_LINE_MIN, TYPEWRITER_LINE_MAX, LOCK_TTL_UNIT_SECONDS, lockTtlMax } from "./constants.js";

export const SettingsPage = () => {

    const navigate = useNavigate();
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [userData, setUserDataComponent] = useState(null);
    const [editingPassword, setEditingPassword] = useState(false);
    const [passwordMessage, setPasswordMessage] = useState(null); // null | { text, type }
    const [importFiles, setImportFiles] = useState([]);
    const [importPath, setImportPath] = useState("");
    const [importPasscode, setImportPasscode] = useState("");
    const [importStatus, setImportStatus] = useState(null); // null | { status, total, processed, failures, errors }
    const [submitting, setSubmitting] = useState(false);
    const [typewriter, setTypewriter] = useState(() => getTypewriterSettings());
    const [lockTtl, setLockTtl] = useState(() => getLockTtl());

    const { isDarkMode, setDarkMode } = useDarkMode();

    const onChangeTheme = (e) => {
        setDarkMode(e.target.checked);
    };

    const onClickUpdatePassword = () => {
        let oldPassword = document.getElementById('oldPassword').value;
        let newPassword = document.getElementById('newPassword').value;
        let newPasswordConfirm = document.getElementById('newPasswordConfirm').value;
        
        if (!oldPassword || !newPassword || !newPasswordConfirm) {
            setPasswordMessage({ text: "Please fill out all fields to update password.", type: "error" });
            return;
        }
        if (newPassword !== newPasswordConfirm) {
            setPasswordMessage({ text: "New passwords do not match.", type: "error" });
            return;
        }
        
        updatePassword(oldPassword, newPassword, (reencrypted) => {
            setPasswordMessage({
                text: reencrypted
                    ? `Password updated successfully. ${reencrypted} locked ${reencrypted === 1 ? 'entry' : 'entries'} re-encrypted.`
                    : "Password updated successfully.",
                type: "success"
            });
            setEditingPassword(false);
        }, (e) => {
            setPasswordMessage({ text: e, type: "error" });
        });
    };

    const onToggleTypewriter = (e) => {
        setTypewriter(saveTypewriterSettings({ enabled: e.target.checked }));
    };

    // Slide freely, only persist once the user lets go.
    const onChangeTypewriterLine = (e) => {
        setTypewriter((prev) => ({ ...prev, line: Number(e.target.value) }));
    };

    const onCommitTypewriterLine = () => {
        setTypewriter(saveTypewriterSettings({ line: typewriter.line }));
    };

    const onToggleLockByDefault = (e) => {
        updateUser(userData.id, { settings: { lock_by_default: e.target.checked } }, (data) => {
            setUserData(data);
            setUserDataComponent(data);
        });
    };

    // Anything past the 7 day ceiling is saved as the ceiling for whichever unit is selected.
    const saveLockTtl = (value, unit) => {
        const max = lockTtlMax(unit);
        const capped = Math.min(Math.max(value, 1), max);

        setLockTtl({ value: capped, unit });

        if (capped !== value) {
            setError("Lock timeout cannot exceed 7 days.");
        }

        updateUser(userData.id, { settings: { lock_ttl_value: capped, lock_ttl_unit: unit } }, (data) => {
            setUserData(data);
            setUserDataComponent(data);
        });
    };

    const onChangeLockTtlValue = (e) => {
        setLockTtl((prev) => ({ ...prev, value: e.target.value }));
    };

    // Typing is free, the value is only checked and saved once the field is left.
    const onCommitLockTtlValue = () => {
        const value = parseInt(lockTtl.value, 10);
        saveLockTtl(Number.isNaN(value) ? 1 : value, lockTtl.unit);
    };

    const onChangeLockTtlUnit = (e) => {
        saveLockTtl(parseInt(lockTtl.value, 10) || 1, e.target.value);
    };

    const onSelectSensitivity = (e) => {
        let newSensitivity = e.target.value;
        updateUser(userData.id, { settings: { sensitivity: newSensitivity } }, (data) => {
            setUserData(data);
            setUserDataComponent(data);
        });
    };

    const onStartImport = () => {
        if (!importPath.trim()) return;
        setSubmitting(true);
        setError(null);
        importEntries(importPath.trim(), importPasscode, () => {
            setSubmitting(false);
            setImportPath("");
            setImportPasscode("");
            // Start polling
            pollImportStatus();
        }, (e) => {
            setSubmitting(false);
            setError(typeof e === 'string' ? e : "Import failed.");
        });
    };

    const pollImportStatus = () => {
        getImportStatus((data) => {
            if (data) setImportStatus(data);
        });
    };

    useEffect(() => {
        let localUserData = getUserData();
        if (localUserData) {
            setUserDataComponent(localUserData);
        } else {
            clearLocalStorage();
            navigate(loginRoute);
        }
        // Check for an existing import job on mount
        pollImportStatus();
        getImportFiles((files) => setImportFiles(files));
    // eslint-disable-next-line
    }, []);

    // Poll every 5 seconds while an import is running
    useEffect(() => {
        if (!importStatus || importStatus.status !== "running") return;
        const interval = setInterval(() => {
            getImportStatus((data) => {
                if (data) setImportStatus(data);
            });
        }, 5000);
        return () => clearInterval(interval);
    // eslint-disable-next-line
    }, [importStatus?.status]);


    if (!userData) {
        return <PageLoader />;
    }

    let lockByDefault = !(userData && userData.settings && userData.settings.lock_by_default === false);

    let sensitivity = userData && userData.settings && userData.settings.sensitivity ? userData.settings.sensitivity : "default";

    return (
        <BasePage>
            <div class="md-margin-top"></div>
            <Notification message={error} clear={() => setError(null)} type="error" />
            <Notification message={success} clear={() => setSuccess(null)} type="success" />
            <div class="row">
                <div class="col-md-4"></div>
                <div class="col-md-4 md-margin-top">
                    <h2>Settings</h2>
                    <h4 class="text-muted margin-bottom">{userData.email}</h4>
                    <div class="well" style={{ height: '65px' }}>
                        <h4 style={{ display: 'inline-block', float: 'left', marginTop: '0px'}}>Dark Mode</h4>
                        <div class="toggle-container" style={{ display: 'inline-block', float: 'right'}}>
                            <input type="checkbox" id="switch" name="theme" onChange={onChangeTheme} defaultChecked={isDarkMode}/>
                            <label className="switch-label" for="switch">Toggle</label>
                        </div>
                    </div>
                    <div class="well">
                        <h4 style={{ display: 'inline-block', float: 'left', marginTop: '0px'}}>Typewriter Mode</h4>
                        <div class="toggle-container" style={{ display: 'inline-block', float: 'right'}}>
                            <input type="checkbox" id="typewriterSwitch" name="typewriter" onChange={onToggleTypewriter} checked={typewriter.enabled}/>
                            <label className="switch-label" for="typewriterSwitch">Toggle</label>
                        </div>
                        <div style={{ clear: 'both' }}></div>
                        <p class="text-muted" style={{ marginTop: '10px' }}>
                            Keeps the line you are writing on fixed while the text scrolls underneath it.
                        </p>
                        {typewriter.enabled && (
                            <>
                                <label for="typewriterLine">Line position: {Math.round(typewriter.line * 100)}% from top</label>
                                <input
                                    class="typewriter-range"
                                    type="range"
                                    id="typewriterLine"
                                    min={TYPEWRITER_LINE_MIN}
                                    max={TYPEWRITER_LINE_MAX}
                                    step="0.01"
                                    value={typewriter.line}
                                    onChange={onChangeTypewriterLine}
                                    onMouseUp={onCommitTypewriterLine}
                                    onTouchEnd={onCommitTypewriterLine}
                                    onKeyUp={onCommitTypewriterLine}
                                />
                                <p class="text-muted">You can also drag the arrow on the writing page.</p>
                            </>
                        )}
                    </div>
                    <div class="well">
                        <h4 style={{ display: 'inline-block', float: 'left', marginTop: '0px'}}>Lock New Entries</h4>
                        <div class="toggle-container" style={{ display: 'inline-block', float: 'right'}}>
                            <input type="checkbox" id="lockByDefaultSwitch" name="lockByDefault" onChange={onToggleLockByDefault} checked={lockByDefault}/>
                            <label className="switch-label" for="lockByDefaultSwitch">Toggle</label>
                        </div>
                        <div style={{ clear: 'both' }}></div>
                        <p class="text-muted" style={{ marginTop: '10px' }}>
                            Encrypts each new entry with your password before it is stored, so it is never
                            written in the clear. You will need your password to read it again later.
                        </p>
                        <label for="lockTtlValue"><strong>Stay unlocked for</strong></label>
                        <div class="form-inline">
                            <input
                                class="form-control"
                                id="lockTtlValue"
                                type="number"
                                min="1"
                                max={lockTtlMax(lockTtl.unit)}
                                step="1"
                                style={{ width: '90px', marginRight: '10px' }}
                                value={lockTtl.value}
                                onChange={onChangeLockTtlValue}
                                onBlur={onCommitLockTtlValue}
                            />
                            <select class="form-control" id="lockTtlUnit" value={lockTtl.unit} onChange={onChangeLockTtlUnit}>
                                {Object.keys(LOCK_TTL_UNIT_SECONDS).map((unit) => (
                                    <option key={unit} value={unit}>{unit}</option>
                                ))}
                            </select>
                        </div>
                        <p class="text-muted" style={{ marginTop: '10px' }}>
                            How long the server holds the key after you enter your password, up to 7 days.
                            Shorter is safer, longer means fewer prompts while writing.
                        </p>
                    </div>
                    <div class="list-group well">
                        <h4>Credentials</h4>
                        <Notification
                            message={passwordMessage ? passwordMessage.text : null}
                            clear={() => setPasswordMessage(null)}
                            type={passwordMessage ? passwordMessage.type : 'error'}
                            inline
                        />
                        { editingPassword ?
                        <>
                            <div class="form-group sm-margin-bottom">
                                <label for="password"><strong>Current Password</strong>
                                </label>
                                <input class="form-control" id="oldPassword" maxlength="128" minlength="8" name="oldPassword" required="" type="password" placeholder="" />
                            </div>
                            <div class="form-group sm-margin-bottom">
                                <label for="password"><strong>New Password</strong>
                                </label>
                                <input class="form-control" id="newPassword" maxlength="128" minlength="8" name="newPassword" required="" type="password" placeholder="" />
                            </div>
                            <div class="form-group sm-margin-bottom">
                                <label for="newPasswordConfirm">
                                    <strong>Confirm New Password</strong>
                                </label>
                                <input class="form-control" id="newPasswordConfirm" maxlength="128" minlength="8" name="newPasswordConfirm" type="password" placeholder="" />
                                <button onClick={() => { setEditingPassword(false); setPasswordMessage(null); }} class="btn btn-md btn-info" type="button" style={{ marginTop: '10px', marginRight: '10px' }}>Cancel</button>
                                <button onClick={onClickUpdatePassword} class="btn btn-md btn-info" type="button" style={{ marginTop: '10px'}}>Update</button>
                            </div>
                        </> : 
                        <span onClick={() => { setEditingPassword(true); setPasswordMessage(null); }} class="list-group-item" style={{ cursor: 'pointer', 'borderRadius': '.25rem!important' }}>
                            Click here to update password
                        </span>}
                    </div>
                    <div class="well">
                        <h4>Text Sensitivity</h4>
                        <label for="default" className="radioLabel">Default - Show titles, Show thumbnails</label>
                        <input type="radio" id="default" name="sensitivity" value="default" className="radioInline" onChange={onSelectSensitivity} defaultChecked={sensitivity === "default"}/>
                        <label for="blur" className="radioLabel">Blur - Show titles, Blur thumbnails</label>
                        <input type="radio" id="blur" name="sensitivity" value="blur" className="radioInline" onChange={onSelectSensitivity} defaultChecked={sensitivity === "blur"} />
                        <label for="both" className="radioLabel">Both - Hide titles, Blur thumbnails</label>
                        <input type="radio" id="both" name="sensitivity" value="both" className="radioInline" onChange={onSelectSensitivity} defaultChecked={sensitivity === "both"} />
                    </div>
                    <div class="well">
                        <h4>Import Entries</h4>
                        {importStatus && importStatus.status === "running" ? (
                            <>
                                <p>Importing entries... {importStatus.processed} / {importStatus.total}</p>
                                <div class="import-progress-track">
                                    <div class="import-progress-bar" style={{ width: importStatus.total > 0 ? `${Math.round((importStatus.processed / importStatus.total) * 100)}%` : '0%' }}></div>
                                </div>
                                {importStatus.failures > 0 && (
                                    <p class="text-muted import-hint">{importStatus.failures} failed so far</p>
                                )}
                                <button onClick={() => cancelImport(() => pollImportStatus(), (e) => setError(e))} class="btn btn-md btn-info import-hint" type="button">Cancel</button>
                            </>
                        ) : importStatus && (importStatus.status === "complete" || importStatus.status === "failed" || importStatus.status === "cancelled") ? (
                            <>
                                <p>
                                    {importStatus.status === "complete" ? "Import complete." : importStatus.status === "cancelled" ? "Import cancelled." : "Import failed."}
                                    {" "}{importStatus.processed} entries imported.
                                </p>
                                {importStatus.failures > 0 && (
                                    <>
                                        <p class="text-muted">{importStatus.failures} entries failed to import:</p>
                                        <div class="import-failures">
                                            {importStatus.errors.map((err, i) => (
                                                <div key={i} class="import-failure-item">
                                                    <strong>Entry {err.entry_id || "?"}</strong> ({err.entry_type})
                                                    <br />
                                                    <span class="text-muted">{err.error}</span>
                                                    {err.link && <><br /><span class="text-muted">Link: {err.link}</span></>}
                                                    {err.file && <><br /><span class="text-muted">File: {err.file}</span></>}
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                                <button onClick={() => setImportStatus(null)} class="btn btn-md btn-info import-hint" type="button">Dismiss</button>
                            </>
                        ) : (
                            <>
                                <p class="text-muted">Select a .zip archive from ~/.innerly/imports/ to import entries.</p>
                                {importFiles.length > 0 ? (
                                    <select class="form-control import-path-input" value={importPath} onChange={(e) => setImportPath(e.target.value)}>
                                        <option value="">Select a file...</option>
                                        {importFiles.map((f) => <option key={f} value={f}>{f}</option>)}
                                    </select>
                                ) : (
                                    <p class="text-muted">No .zip files found in ~/.innerly/imports/</p>
                                )}
                                <p class="text-muted import-hint">Optional: supply passcode (6 integers) to decrypt locked entries.</p>
                                <input class="form-control import-path-input" type="password" placeholder="Passcode" value={importPasscode} onChange={(e) => setImportPasscode(e.target.value)} />
                                <button onClick={onStartImport} class="btn btn-md btn-info" type="button" disabled={!importPath.trim() || submitting}>
                                    {submitting ? "Starting..." : "Import"}
                                </button>
                            </>
                        )}
                    </div>
                </div>
                <div class="col-md-4"></div>
            </div>
        </BasePage>
    );
};