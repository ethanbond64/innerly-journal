import * as journal from '../bindings/innerly/internal/journal/app.js';
import { Browser, System, Window } from '@wailsio/runtime';

// beta.33 injects OS/architecture after WebViewDidFinishNavigation, which
// can run after ES modules. Wait for its configuration event on native macOS;
// ordinary browsers must not issue an IPC Environment() call to detect Wails.
export const waitForNativeDesktop = () => {
    if (System.IsDesktop() || !window.webkit?.messageHandlers?.external) return Promise.resolve();
    return new Promise((resolve) => {
        window.addEventListener('wails:runtime-config-ready', resolve, { once: true });
    });
};

export const nativeDesktop = {
    journal,
    isDesktop: () => System.IsDesktop(),
    isMac: () => System.IsMac(),
    openURL: (url) => Browser.OpenURL(url),
    setBackground: (r, g, b) => Window.SetBackgroundColour(r, g, b, 255),
};
