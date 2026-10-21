// Loaded only by Vite's test mode, never by the production desktop bundle.
export const testDesktop = {
    get journal() { return window.__innerlyTestDesktop.journal; },
    isDesktop: () => !!window.__innerlyTestDesktop,
    checkForUpdates: () => window.__innerlyTestDesktop.checkForUpdates(),
    updateStatus: () => window.__innerlyTestDesktop.updateStatus(),
    downloadUpdate: version => window.__innerlyTestDesktop.downloadUpdate(version),
    cancelUpdate: () => window.__innerlyTestDesktop.cancelUpdate(),
    restartUpdate: version => window.__innerlyTestDesktop.restartUpdate(version),
    isMac: () => true,
    openURL: (url) => window.__innerlyTestDesktop.openURL(url),
    setBackground: () => {},
};
