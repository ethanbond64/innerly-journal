import React, { useEffect, useState } from 'react';
import { BasePage } from './base-page.jsx';
import { checkForUpdates, isDesktop, updateStatus } from './desktop.js';

export const AboutPage = () => {
    const [changelog, setChangelog] = useState('Loading changelog…');
    const [status, setStatus] = useState({ current: '', disabled: '' });
    const [checking, setChecking] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        const controller = new AbortController();
        fetch('https://raw.githubusercontent.com/ethanbond64/innerly-once/master/CHANGELOG.md', { signal: controller.signal, cache: 'no-cache' })
            .then(response => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.text();
            })
            .then(setChangelog)
            .catch(error => {
                if (error.name !== 'AbortError') setChangelog('Unable to load the changelog. Please try again later.');
            });
        return () => controller.abort();
    }, []);

    useEffect(() => {
        if (!isDesktop()) return;
        let active = true;
        // An update-status failure must not interrupt the journal.
        updateStatus().then(next => { if (active) setStatus(next); }).catch(() => {});
        return () => { active = false; };
    }, []);

    // Wails' update window reports progress and owns the install and restart.
    const check = async () => {
        setChecking(true);
        setMessage('');
        try { await checkForUpdates(); }
        catch (error) { setMessage(error?.message || 'Unable to check for updates. Check your connection and try again.'); }
        finally { setChecking(false); }
    };

    return <BasePage allowGuest>
        <div className="wrapper lg-margin-top">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <h2 style={{ margin: 0 }}>Changelog</h2>
                <button className="btn btn-default" disabled={checking || !isDesktop() || !!status.disabled} onClick={check}>
                    {checking ? 'Checking…' : 'Check for Updates'}
                </button>
            </div>
            {status.current && <p>Installed version: v{status.current}</p>}
            {status.disabled && <p>{status.disabled}</p>}
            {message && <p role="status">{message}</p>}
            <pre style={{ whiteSpace: 'pre-wrap', color: 'var(--dm-text)', background: 'var(--bgeb)' }}>{changelog}</pre>
        </div>
    </BasePage>;
};
