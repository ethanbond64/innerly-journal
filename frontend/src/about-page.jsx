import React, { useEffect, useState } from 'react';
import { Link } from './router.jsx';
import { checkForUpdates, desktopApp, isDesktop } from './desktop.js';
import { useDarkMode } from './dark-mode.js';

export const AboutPage = () => {
    useDarkMode();
    const [version, setVersion] = useState('');
    const [changelog, setChangelog] = useState('Loading changelog…');
    const [checking, setChecking] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (isDesktop()) desktopApp().Version().then(setVersion).catch(() => setVersion('Unavailable'));
        else setVersion('Desktop app required');
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

    return <main className="container" style={{ paddingTop: '32px' }}>
        <Link to="/">Back</Link>
        <h1>About &amp; Updates</h1>
        <p>Innerly {version}</p>
        <button className="btn btn-default" disabled={checking || !isDesktop()} onClick={check}>
            {checking ? 'Checking…' : 'Check for Updates'}
        </button>
        <p role="status">{message}</p>
        <p className="text-muted">Checks the latest published release. In-app installation is not enabled yet.</p>
        <h2>Changelog</h2>
        <p className="text-muted">From master; may include changes that have not been released.</p>
        <pre style={{ whiteSpace: 'pre-wrap', color: 'inherit', background: 'var(--bgeb)' }}>{changelog}</pre>
    </main>;
};
