import test from 'node:test';
import assert from 'node:assert/strict';
import { journalFetch, openExternal, setWindowBackground, desktopApp, setDesktopAdapter } from '../src/desktop.js';

const install = (methods) => {
    setDesktopAdapter({ journal: methods, isDesktop: () => true });
};

// Login returns user data without introducing a desktop bearer token.
test('desktop login has no bearer token', async () => {
    install({ Login: async (input) => ({ data: { id: 1, email: input.email } }) });
    const response = await journalFetch('/api/login', { method: 'POST', body: JSON.stringify({ email: 'owner@example.com', password: 'password' }) });
    assert.equal(response.ok, true);
    assert.deepEqual(await response.json(), { user: { id: 1, email: 'owner@example.com' } });
});

// Search parameters preserve literal ampersands and numeric pagination through the bridge.
test('desktop search passes query fields', async () => {
    install({ FetchEntries: async (query) => {
        assert.equal(query.search, 'one & two');
        assert.equal(query.limit, 30);
        assert.equal(query.offset, 60);
        return { data: [] };
    } });
    assert.equal((await journalFetch('/api/fetch/entries?search=one%20%26%20two&limit=30&offset=60')).ok, true);
});

// Lock expiry remains distinguishable from a wrong password or a missing session.
test('desktop lock expiry preserves retry marker', async () => {
    install({ InsertEntry: async () => ({ error: { code: 'lock-auth-expired', message: 'Password required' } }) });
    const response = await journalFetch('/api/insert/entries', { method: 'POST', body: JSON.stringify({ entry_type: 'text', entry_data: { text: 'private' } }) });
    assert.equal(response.status, 401);
    assert.equal((await response.json())['lock-auth-expired'], true);
});

// Locked reads send the password only to the password-authenticated read operation.
test('desktop private read preserves arguments', async () => {
    install({ FetchEntry: async (id, password) => {
        assert.equal(id, 42);
        assert.equal(password, 'password');
        return { data: { id } };
    } });
    const response = await journalFetch('/api/fetch/entries/42', { method: 'POST', body: JSON.stringify({ password: 'password' }) });
    assert.equal((await response.json()).data.id, 42);
});

// Import progress and file lists retain the existing settings-page response shapes.
test('desktop import response shapes', async () => {
    install({ ImportStatus: async () => ({ data: { status: 'complete', processed: 3 } }), ImportFiles: async () => ({ data: ['legacy.zip'] }) });
    assert.deepEqual(await (await journalFetch('/api/import/status')).json(), { status: 'complete', processed: 3 });
    assert.deepEqual(await (await journalFetch('/api/import/files')).json(), { files: ['legacy.zip'] });
});

// External navigation only opens credential-free HTTPS URLs in the system browser.
test('desktop external links require HTTPS', async () => {
    install({});
    const opened = [];
    setDesktopAdapter({ isDesktop: () => true, openURL: (url) => opened.push(url) });
    for (const url of ['http://example.com', 'file:///etc/passwd', 'https://user:pass@example.com', 'https://example.com']) {
        let prevented = false;
        await openExternal({ preventDefault: () => { prevented = true; } }, url);
        assert.equal(prevented, true);
    }
    assert.deepEqual(opened, ['https://example.com/']);
});

// Missing bindings must not silently send journal operations to an HTTP server.
test('missing desktop bindings fail explicitly', async () => {
    setDesktopAdapter(undefined);
    await assert.rejects(journalFetch('/api/version'), /desktop app/);
    assert.throws(desktopApp, /desktop app/);
    assert.equal(await openExternal({ preventDefault() {} }, 'https://example.com'), false);
    assert.equal(await setWindowBackground(255, 255, 255), false);
});

test('runtime rejections never fall back to webview navigation or break theme changes', async () => {
    setDesktopAdapter({ isDesktop: () => true, openURL: async () => { throw new Error('OS failure'); }, setBackground: async () => { throw new Error('window closed'); } });
    assert.equal(await openExternal({ preventDefault() {} }, 'https://example.com'), false);
    assert.equal(await setWindowBackground(23, 34, 59), false);
});

test('external navigation rejects other schemes, relative URLs and credentials before IPC', async () => {
    const opened = [];
    setDesktopAdapter({ isDesktop: () => true, openURL: (url) => opened.push(url) });
    for (const url of ['javascript:alert(1)', 'data:text/html,hello', 'mailto:owner@example.com', '//example.com', '#/write', 'wails://localhost/', 'https://user@example.com', 'https://:pass@example.com', null, {}]) {
        assert.equal(await openExternal({ preventDefault() {} }, url), false);
    }
    assert.deepEqual(opened, []);
});
