// Hash routes stay inside the Wails asset server.

const listeners = new Set();

export const toHref = (path) => '#' + path;
export const readPath = () => window.location.hash.slice(1) || '/';

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
