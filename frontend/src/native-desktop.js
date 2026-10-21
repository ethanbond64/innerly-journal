import * as journal from '../bindings/innerly/internal/journal/app.js';
import * as updates from '../bindings/innerly/updateservice.js';
import { Browser, System, Window } from '@wailsio/runtime';

// beta.33 injects OS/architecture after WebViewDidFinishNavigation, which
// can run after ES modules. Wait for its configuration event on native macOS;
// ordinary browsers must not issue an IPC Environment() call to detect Wails.
export const waitForNativeDesktop = () => {
    if (System.IsDesktop() || !window.webkit?.messageHandlers?.external) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const configured = () => {
            if (!System.IsDesktop()) return;
            clearTimeout(timeout);
            window.removeEventListener('wails:runtime-config-ready', configured);
            resolve();
        };
        const timeout = setTimeout(() => {
            window.removeEventListener('wails:runtime-config-ready', configured);
            reject(new Error('Desktop runtime did not become ready.'));
        }, 10000);
        window.addEventListener('wails:runtime-config-ready', configured);
        configured();
    });
};

export const nativeDesktop = {
    journal,
    checkForUpdates: updates.Check,
    updateStatus: updates.Status,
    downloadUpdate: updates.Download,
    cancelUpdate: updates.Cancel,
    restartUpdate: updates.Restart,
    isDesktop: () => System.IsDesktop(),
    isMac: () => System.IsMac(),
    openURL: (url) => Browser.OpenURL(url),
    setBackground: (r, g, b) => Window.SetBackgroundColour(r, g, b, 255),
};
