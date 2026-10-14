import { useState } from 'react';
import { desktopApp, isDesktop } from './desktop.js';

export const DesktopSettings = () => {
    const [error, setError] = useState(null);
    if (!isDesktop()) return null;
    const openWindow = async () => {
        setError(null);
        try {
            const result = await desktopApp().OpenWindow();
            if (result.error) setError(result.error.message);
        } catch {
            setError('Unable to open another window.');
        }
    };
    return <div className="well">
        <h4>Desktop windows</h4>
        <button className="btn btn-default" onClick={() => window.runtime.WindowUnfullscreen()}>Exit fullscreen</button>{' '}
        <button className="btn btn-default" onClick={openWindow}>Open another window</button>
        <p className="text-muted">Each window logs in independently. You can use different accounts at the same time.</p>
        {error && <p role="alert">{error}</p>}
    </div>;
};
