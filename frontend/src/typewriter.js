import { innerlyTypewriter, TYPEWRITER_LINE_DEFAULT, TYPEWRITER_LINE_MIN, TYPEWRITER_LINE_MAX } from "./constants.js";

export const clampTypewriterLine = (line) => {
    if (typeof line !== 'number' || isNaN(line)) return TYPEWRITER_LINE_DEFAULT;
    return Math.min(Math.max(line, TYPEWRITER_LINE_MIN), TYPEWRITER_LINE_MAX);
};

// Typewriter settings are client-side only, kept in local storage per device.
export const getTypewriterSettings = () => {
    let stored = {};
    try {
        const raw = localStorage.getItem(innerlyTypewriter);
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed && typeof parsed === 'object') stored = parsed;
    } catch (e) {
        // Unreadable or unavailable storage falls back to the defaults below.
    }

    return {
        enabled: stored.enabled === undefined ? true : !!stored.enabled,
        line: clampTypewriterLine(stored.line),
    };
};

// Merges a partial update into the stored settings and returns the result.
export const saveTypewriterSettings = (update) => {
    const typewriter = { ...getTypewriterSettings(), ...update };
    typewriter.enabled = !!typewriter.enabled;
    typewriter.line = clampTypewriterLine(typewriter.line);

    try {
        localStorage.setItem(innerlyTypewriter, JSON.stringify(typewriter));
    } catch (e) {
        // Storage full or blocked: the setting still applies for this session.
    }

    return typewriter;
};
