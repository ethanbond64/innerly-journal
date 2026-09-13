import { getUserData, setUserData } from "./utils.jsx";
import { updateUser } from "./requests.js";
import { TYPEWRITER_LINE_DEFAULT, TYPEWRITER_LINE_MIN, TYPEWRITER_LINE_MAX } from "./constants.js";

export const clampTypewriterLine = (line) => {
    if (typeof line !== 'number' || isNaN(line)) return TYPEWRITER_LINE_DEFAULT;
    return Math.min(Math.max(line, TYPEWRITER_LINE_MIN), TYPEWRITER_LINE_MAX);
};

// Reads the typewriter settings off the locally cached user, falling back to defaults.
export const getTypewriterSettings = (userData = getUserData()) => {
    const settings = userData && userData.settings ? userData.settings : {};
    const typewriter = settings.typewriter && typeof settings.typewriter === 'object' ? settings.typewriter : {};
    return {
        enabled: typewriter.enabled === undefined ? true : !!typewriter.enabled,
        line: clampTypewriterLine(typewriter.line),
    };
};

// Persists a partial typewriter settings update and refreshes the cached user.
export const saveTypewriterSettings = (update, callback = () => {}, onError = () => {}) => {
    const userData = getUserData();
    if (!userData) return;

    const typewriter = { ...getTypewriterSettings(userData), ...update };
    typewriter.line = clampTypewriterLine(typewriter.line);

    // Update the cache optimistically so the setting applies without a round trip.
    setUserData({ ...userData, settings: { ...(userData.settings || {}), typewriter } });

    updateUser(userData.id, { settings: { typewriter } }, (data) => {
        setUserData(data);
        callback(data);
    }, onError);
};
