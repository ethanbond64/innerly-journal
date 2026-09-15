// The only module that touches window.location / window.history. Switch `mode` to
// 'hash' if the host cannot serve index.html for unknown paths (e.g. a Wails asset
// server); every href and path read below follows from it.
const mode = 'browser';

const listeners = new Set();

export const toHref = (path) => (mode === 'hash' ? '#' + path : path);

export const readPath = () => (mode === 'hash'
    ? window.location.hash.slice(1) || '/'
    : window.location.pathname + window.location.search);

export const getState = () => window.history.state;

// pushState/replaceState fire no event, so subscribers are notified here.
const go = (method, path, state = null) => {
    window.history[method](state, '', toHref(path));
    listeners.forEach((fn) => fn());
};

export const push = (path, state) => go('pushState', path, state);
export const replace = (path, state) => go('replaceState', path, state);

export const subscribe = (fn) => {
    listeners.add(fn);
    window.addEventListener('popstate', fn);
    return () => {
        listeners.delete(fn);
        window.removeEventListener('popstate', fn);
    };
};
