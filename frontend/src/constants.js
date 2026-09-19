
// Routes
export const signupRoute = '/signup';
export const loginRoute = '/login';
export const homeRoute = '/'
export const writeRoute = '/write';
export const viewRoute = '/view/';
export const dayRoute = '/day/';
export const editRoute = '/edit/';
export const settingsRoute = '/settings';
export const activityRoute = '/activity';

// Local Storage
export const innerlyUser = 'innerly-user';
export const innerlyToken = 'innerly-token';
export const innerlyTypewriter = 'innerly-typewriter';

// Typewriter mode
export const TYPEWRITER_LINE_DEFAULT = 0.25; // 25% from top of viewport
export const TYPEWRITER_LINE_MIN = 0.1;
export const TYPEWRITER_LINE_MAX = 0.85;

// How long the server keeps the key that locks and unlocks entries, capped at 7 days.
export const LOCK_TTL_UNIT_SECONDS = {
    seconds: 1,
    minutes: 60,
    hours: 3600,
    days: 86400
};
export const LOCK_TTL_MAX_SECONDS = 7 * 86400;
export const LOCK_TTL_DEFAULT = { value: 1, unit: 'hours' };

// The largest count that still fits under the cap for a given unit.
export const lockTtlMax = (unit) => Math.floor(LOCK_TTL_MAX_SECONDS / LOCK_TTL_UNIT_SECONDS[unit]);
