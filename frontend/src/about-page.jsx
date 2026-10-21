import React, { useEffect, useState } from 'react';
import { BasePage } from './base-page.jsx';
import { cancelUpdate, checkForUpdates, downloadUpdate, isDesktop, restartUpdate, updateStatus } from './desktop.js';

export const AboutPage = () => {
    const [changelog, setChangelog] = useState('Loading changelog…');
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState({ releases: [] });
    const [version, setVersion] = useState('');
    const [message, setMessage] = useState('');
    const releases = status.releases || [];
    const selected = releases.find(release => release.version === version);
    const downloading = ['downloading', 'verifying', 'installing'].includes(status.state);
    const ready = status.ready && status.version === version;

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
        const refresh = async () => {
            try {
                const next = await updateStatus();
                if (!active) return;
                setStatus(next);
                setVersion(previous => previous || next.version || next.releases?.find(release => !release.unavailable)?.version || '');
            } catch { /* An update-status failure must not interrupt the journal. */ }
        };
        refresh();
        // Only an operation in progress reports anything worth polling for.
        if (!busy && !downloading) return () => { active = false; };
        const timer = setInterval(refresh, 500);
        return () => { active = false; clearInterval(timer); };
    }, [busy, downloading]);

    const perform = async action => {
        setBusy(true);
        setMessage('');
        try { await action(); }
        catch (error) { setMessage(error?.message || 'Unable to update. Check your connection and try again.'); }
        finally {
            try { setStatus(await updateStatus()); } catch { /* keep the last known state */ }
            setBusy(false);
        }
    };

    const check = () => perform(async () => {
        const next = await checkForUpdates();
        setStatus(next);
        setVersion(previous => next.releases?.some(release => release.version === previous && !release.unavailable)
            ? previous : next.releases?.find(release => !release.unavailable)?.version || '');
        setMessage(next.releases?.length ? '' : "You're up to date.");
    });

    return <BasePage allowGuest>
        <div className="wrapper lg-margin-top">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <h2 style={{ margin: 0 }}>Changelog</h2>
                <button className="btn btn-default" disabled={busy || downloading || !isDesktop()} onClick={check}>
                    {busy && status.state === 'checking' ? 'Checking…' : 'Check for Updates'}
                </button>
            </div>
            {status.disabled && <p>{status.disabled}</p>}
            {releases.length > 0 && <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <select aria-label="Update version" value={version} disabled={busy || downloading}
                        onChange={event => { setVersion(event.target.value); setMessage(''); }}>
                        {!version && <option value="">No compatible update</option>}
                        {releases.map(release => <option key={release.version} value={release.version} disabled={!!release.unavailable}>
                            v{release.version}{release.unavailable ? ' — unavailable' : ''}
                        </option>)}
                    </select>
                    {ready ? <button className="btn btn-info" disabled={busy} onClick={() => perform(() => restartUpdate(version))}>
                        Install and Restart
                    </button> : <button className="btn btn-default" disabled={busy || downloading || !selected || !!selected.unavailable || !!status.disabled}
                        onClick={() => perform(() => downloadUpdate(version))}>Download</button>}
                    {downloading && <button className="btn btn-default" onClick={() => perform(cancelUpdate)}>Cancel Download</button>}
                </div>
                {downloading && <p role="status">
                    {status.state === 'downloading' ? `Downloading v${status.version}… ${status.total > 0 ? Math.min(100, Math.round(status.written / status.total * 100)) + '%' : ''}` : 'Verifying update…'}
                </p>}
                {ready && <p role="status">v{status.version} is verified and ready. Restart only when you are ready.</p>}
                {releases.map(release => <details key={release.version} style={{ marginTop: '10px' }}>
                    <summary>v{release.version} — {new Date(release.publishedAt).toLocaleDateString()}{release.unavailable ? ' — unavailable' : ''}</summary>
                    {release.unavailable && <p>{release.unavailable}</p>}
                    <pre style={{ whiteSpace: 'pre-wrap', color: 'var(--dm-text)', background: 'var(--bgeb)' }}>{release.notes || 'No release notes.'}</pre>
                </details>)}
            </div>}
            {message && <p role="status">{message}</p>}
            {new Date(status.lastChecked).getTime() > 0 && <p>Last checked: {new Date(status.lastChecked).toLocaleString()}</p>}
            <pre style={{ whiteSpace: 'pre-wrap', color: 'var(--dm-text)', background: 'var(--bgeb)' }}>{changelog}</pre>
        </div>
    </BasePage>;
};
