import { withSavedWriting } from './editor-saves.js';

let adapter;
// Also used by unit tests; browser UI fixtures replace only this boundary.
export const setDesktopAdapter = (value) => { adapter = value; };
export const initializeDesktop = async () => {
    if (import.meta.env?.MODE === 'test') {
        const { testDesktop } = await import('../tests/desktop-adapter.js');
        setDesktopAdapter(testDesktop);
    } else {
        const { nativeDesktop, waitForNativeDesktop } = await import('./native-desktop.js');
        await waitForNativeDesktop();
        setDesktopAdapter(nativeDesktop);
    }
};
export const checkForUpdates = () => {
    if (!isDesktop()) throw new Error('Innerly must run inside the desktop app.');
    return adapter.checkForUpdates();
};
export const updateStatus = () => adapter.updateStatus();
export const downloadUpdate = version => adapter.downloadUpdate(version);
export const cancelUpdate = () => adapter.cancelUpdate();
export const restartUpdate = version => withSavedWriting(() => adapter.restartUpdate(version));
export const isDesktop = () => !!adapter?.isDesktop();
export const isMacDesktop = () => isDesktop() && adapter.isMac();
export const desktopApp = () => {
    if (!isDesktop()) throw new Error('Innerly must run inside the desktop app.');
    return adapter.journal;
};
export const setWindowBackground = async (...rgb) => {
    if (!isDesktop()) return false;
    try {
        await adapter.setBackground(...rgb);
        return true;
    } catch {
        // Cosmetic native failures must not break journal/theme changes.
        return false;
    }
};

const response = (body, status = 200) => ({ ok: status < 400, status, statusText: body.message || '', json: async () => body });

const fileBase64 = (file) => new Promise((resolve, reject) => {
    if (file.size > 30 * 1024 * 1024) {
        reject(new Error('Image is too large.'));
        return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(new Error('Unable to read image.'));
    reader.readAsDataURL(file);
});

export const journalFetch = async (path, options = {}) => {
    if (!isDesktop()) throw new Error('Innerly must run inside the desktop app.');
    const app = desktopApp();
    const url = new URL(path, 'https://innerly.local');
    const route = url.pathname;
    const method = options.method || 'GET';
    let body = options.body ? (options.body instanceof FormData ? Object.fromEntries(options.body) : JSON.parse(options.body)) : {};
    if (body.file) {
        body = { ...body, filename: body.file.name, content_base64: await fileBase64(body.file) };
        delete body.file;
    }
    body.functional_datetime = body.functional_datetime || '';
    const query = Object.fromEntries(url.searchParams);
    for (const key of ['limit', 'offset', 'days']) query[key] = Number(query[key]) || 0;
    if (query.before === 'undefined' || query.before === 'null') query.before = '';
    const id = Number(route.split('/').pop());
    let result;
    if (route === '/api/login') result = await app.Login(body);
    else if (route === '/api/signup') result = await app.Signup(body);
    else if (route === '/api/update_password') result = await app.UpdatePassword(body);
    else if (route.startsWith('/api/update/users/')) result = await app.UpdateUser(id, body.settings || {});
    else if (route === '/api/insert/entries') result = await app.InsertEntry(body);
    else if (route.startsWith('/api/update/entries/')) result = await app.UpdateEntry(id, body);
    else if (route === '/api/fetch/entries') result = await app.FetchEntries(query);
    else if (route.startsWith('/api/fetch/entries/')) result = await app.FetchEntry(id, body.password || '');
    else if (route.startsWith('/api/delete/entries/')) result = await app.DeleteEntry(id);
    else if (route.startsWith('/api/lock/entries/')) result = await app.LockEntry(id, body.password || '');
    else if (route.startsWith('/api/unlock/entries/')) result = await app.UnlockEntry(id, body.password || '');
    else if (route === '/api/lock/auth') result = await app.AuthenticateLock(body.password || '');
    else if (route === '/api/insert/date_tags') result = await app.InsertDateTag(body);
    else if (route.startsWith('/api/delete/date_tags/')) result = await app.DeleteDateTag(id);
    else if (route === '/api/fetch/tagged_days') result = await app.FetchTaggedDays();
    else if (route === '/api/fetch/date_tags') result = await app.FetchDateTags(query);
    else if (route === '/api/fetch/tags') result = await app.FetchTags(query);
    else if (route === '/api/fetch/activity') result = await app.FetchActivity(query);
    else if (route === '/api/fetch/memories') result = await app.FetchMemories(query.date || '');
    else if (route === '/api/import/files') result = await app.ImportFiles();
    else if (route === '/api/import/status') result = await app.ImportStatus();
    else if (route === '/api/import') result = method === 'DELETE' ? await app.CancelImport() : await app.StartImport(body);
    else return response({ message: 'Not found' }, 404);
    if (result.error) {
        const status = { unauthorized: 401, 'lock-auth-expired': 401, 'invalid-input': 400, 'not-found': 404, conflict: 409 }[result.error.code] || 500;
        return response({ message: result.error.message, 'lock-auth-expired': result.error.code === 'lock-auth-expired' }, status);
    }
    if (route === '/api/login' || route === '/api/signup') return response({ user: result.data });
    if (route === '/api/import/status') return response(result.data);
    if (route === '/api/import/files') return response({ files: result.data });
    return response({ ...result, 'lock-auth-expired': false });
};

export const openExternal = async (event, link) => {
    event.preventDefault();
    if (!isDesktop() || typeof link !== 'string') return false;
    try {
        const url = new URL(link);
        if (url.protocol !== 'https:' || url.username || url.password) return false;
        await adapter.openURL(url.href);
        return true;
    } catch {
        // Invalid URLs and OS/browser failures must not trigger webview fallback.
        return false;
    }
};
