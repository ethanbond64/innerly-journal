import React, { createContext, useCallback, useContext, useEffect, useSyncExternalStore } from "react";
import { getState, push, readPath, replace, subscribe, toHref } from "./history.js";

const LocationContext = createContext({ path: '/', state: null });
const ParamsContext = createContext({});

export const Router = ({ children }) => {
    const path = useSyncExternalStore(subscribe, readPath);
    return <LocationContext.Provider value={{ path, state: getState() }}>{children}</LocationContext.Provider>;
};

export const useLocation = () => useContext(LocationContext);
export const useParams = () => useContext(ParamsContext);
export const useNavigate = () => useCallback((to, { replace: asReplace = false, state } = {}) =>
    (asReplace ? replace : push)(to, state), []);

export const useSearchParams = () => [new URLSearchParams(useLocation().path.split('?')[1] || '')];

// Navigating during render would warn, so it happens on commit instead.
export const Navigate = ({ to, replace: asReplace = false }) => {
    useEffect(() => { (asReplace ? replace : push)(to); }, [to, asReplace]);
    return null;
};

// A real anchor, so hover, right-click and cmd-click behave normally. Everything else
// is routed in-app: a full page navigation would reload the webview under Wails.
export const Link = ({ to, onClick, children, ...props }) => {
    const handleClick = (e) => {
        if (onClick) {
            onClick(e);
        }
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
            return;
        }
        e.preventDefault();
        push(to);
    };

    return <a href={toHref(to)} onClick={handleClick} {...props}>{children}</a>;
};

// Patterns are flat: a literal path, optionally ending in one ':param'.
const matchPath = (pattern, path) => {
    const patternParts = pattern.split('/');
    const pathParts = path.split('?')[0].split('/');

    if (patternParts.length !== pathParts.length) {
        return null;
    }

    const params = {};
    for (let i = 0; i < patternParts.length; i++) {
        if (patternParts[i].startsWith(':')) {
            params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
        } else if (patternParts[i] !== pathParts[i]) {
            return null;
        }
    }
    return params;
};

export const Route = () => null;

export const Routes = ({ children }) => {
    const { path } = useLocation();

    for (const route of React.Children.toArray(children)) {
        const params = matchPath(route.props.path, path);
        if (params) {
            return <ParamsContext.Provider value={params}>{route.props.element}</ParamsContext.Provider>;
        }
    }
    return null;
};
