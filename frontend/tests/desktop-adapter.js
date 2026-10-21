// Loaded only by Vite's test mode, never by the production desktop bundle.
export const testDesktop = {
    get journal() { return window.__innerlyTestDesktop.journal; },
    isDesktop: () => !!window.__innerlyTestDesktop,
    checkForUpdates: () => window.__innerlyTestDesktop.checkForUpdates(),
    updateStatus: () => window.__innerlyTestDesktop.updateStatus(),
    isMac: () => true,
    openURL: (url) => window.__innerlyTestDesktop.openURL(url),
    setBackground: () => {},
};
