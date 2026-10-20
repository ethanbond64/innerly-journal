import React, { useEffect, useState } from 'react';
import { BasePage } from './base-page.jsx';
import { checkForUpdates, isDesktop } from './desktop.js';

export const AboutPage = () => {
    const [changelog, setChangelog] = useState('Loading changelog…');
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

    const check = async () => {
        setChecking(true);
        setMessage('');
        try { setMessage(await checkForUpdates()); }
        catch { setMessage('Unable to check for updates. Please try again later.'); }
        finally { setChecking(false); }
    };

    return <BasePage allowGuest>
        <div className="wrapper lg-margin-top">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <h2 style={{ margin: 0 }}>Changelog</h2>
                <button className="btn btn-default" disabled={checking || !isDesktop()} onClick={check}>
                    {checking ? 'Checking…' : 'Check for Updates'}
                </button>
            </div>
            {message && <p role="status">{message}</p>}
            <pre style={{ whiteSpace: 'pre-wrap', color: 'var(--dm-text)', background: 'var(--bgeb)' }}>{changelog}</pre>
        </div>
    </BasePage>;
};
