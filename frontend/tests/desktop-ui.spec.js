import { test, expect } from '@playwright/test';

// Exercise the real React UI in WebKit and Chromium with an in-memory Wails boundary.
const desktop = async (page, { count = 1, media = false, expired = false } = {}) => {
    await page.addInitScript(({ count, media, expired }) => {
        const user = { id: 1, email: 'owner@example.com', settings: { lock_by_default: true } };
        const result = (data = null) => ({ data, success: true });
        const state = window.journalTest = { calls: [], expired, entries: [], pending: [], delay: false };
        for (let i = 0; i < count; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            state.entries.push({ id: i + 1, entry_type: media === 'link' ? 'link' : media ? 'file' : 'text', functional_datetime: date.toISOString(), tags: [],
                entry_data: { title: `Entry ${i + 1}`, text: `Text ${i + 1}`, sentiment: 'neutral', link: 'https://example.com/', path: '/images/apple-touch-icon128.png' } });
        }
        const methods = {
            CurrentUser: () => result(user),
            FetchEntry: (id) => result(state.entries.find(e => e.id === id)),
            FetchEntries: async (q) => {
                state.calls.push(['fetch', q]);
                const entries = state.entries.filter(e => !q.search || e.entry_data.title.includes(q.search)).slice(q.offset || 0, (q.offset || 0) + q.limit);
                if (state.delay) await new Promise(resolve => state.pending.push(resolve));
                return result(entries);
            },
            FetchTaggedDays: () => result([]), FetchDateTags: () => result([]), FetchTags: () => result([]),
            FetchMemories: () => result({ datetimes: [] }), ImportFiles: () => result([]),
            ImportStatus: () => ({ error: { code: 'not-found', message: 'No job' } }),
            AuthenticateLock: (password) => {
                if (password !== 'journal-password') return { error: { code: 'unauthorized', message: 'Wrong password' } };
                state.expired = false;
                return result();
            },
            InsertEntry: async (input) => {
                state.calls.push(['insert', input]);
                if (state.expired) return { error: { code: 'lock-auth-expired', message: 'Password required' } };
                if (state.delayInsert) await new Promise(resolve => state.pending.push(resolve));
                const entry = { id: 1000, entry_type: 'text', functional_datetime: new Date().toISOString(), entry_data: input.entry_data, tags: [], text_unlocked: true };
                state.entries.push(entry);
                return result(entry);
            },
            UpdateEntry: (id, input) => {
                state.calls.push(['update', id, input]);
                const entry = state.entries.find(e => e.id === id);
                entry.entry_data = { ...entry.entry_data, ...input.entry_data };
                return result(entry);
            },
            DeleteEntry: (id) => {
                state.calls.push(['delete', id]);
                if (state.deleteFailure) return { error: { code: 'internal', message: 'Cannot delete' } };
                state.entries = state.entries.filter(e => e.id !== id);
                return result();
            },
            OpenWindow: () => { state.calls.push(['window']); return result(); },
            Logout: () => result(),
        };
        window.go = { journal: { App: methods } };
        window.runtime = { WindowUnfullscreen: () => state.calls.push(['unfullscreen']), BrowserOpenURL: () => state.calls.push(['external']) };
    }, { count, media, expired });
};

test('empty editor focuses its caret and opts out of text completion', async ({ page }) => {
    await desktop(page);
    await page.goto('/#/write');
    const editor = page.locator('#writeto');
    await expect(editor).toBeFocused();
    const visibleHeight = await editor.evaluate(element => {
        const style = getComputedStyle(element);
        return element.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    });
    expect(visibleHeight).toBeGreaterThan(30);
    await expect(editor).toHaveAttribute('autocomplete', 'off');
    await expect(editor).toHaveAttribute('autocorrect', 'off');
    await expect(editor).toHaveAttribute('spellcheck', 'false');
    await page.keyboard.type('A new thought');
    await expect(editor).toHaveValue('A new thought');
});

test('password prompt takes focus and makes the editor inert; Save waits for autosave', async ({ page }) => {
    await desktop(page, { expired: true });
    await page.goto('/#/write');
    const editor = page.locator('#writeto');
    await editor.fill('Private draft');
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 6000 });
    await expect(page.locator('#password')).toBeFocused();
    await editor.evaluate(element => element.focus());
    await expect(editor).not.toBeFocused();
    await page.keyboard.type('not journal text');
    await expect(editor).toHaveValue('Private draft');
    await page.locator('#password').fill('wrong');
    await page.getByRole('button', { name: 'Go', exact: true }).click();
    await expect(page.getByText('Incorrect password, please try again.')).toBeVisible();
    await page.locator('#password').fill('journal-password');
    await page.getByRole('button', { name: 'Go', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.locator('#submitbtn').click();
    await expect(page).toHaveURL(/#\/view\/1000$/);
    const calls = await page.evaluate(() => window.journalTest.calls);
    expect(calls.filter(c => c[0] === 'insert')).toHaveLength(2); // expired attempt + retry
    expect(calls.find(c => c[0] === 'insert')[1].draft).toBe(true);
    expect(calls.find(c => c[0] === 'update')[2].draft).toBe(false);
});

for (const media of [false, true, 'link']) {
    test(`delete ${media === 'link' ? 'link' : media ? 'image' : 'text'} asks for confirmation, handles failure and deletes`, async ({ page }) => {
        await desktop(page, { media });
        await page.goto(media ? '/#/' : '/#/view/1');
        const remove = media ? page.getByRole('button', { name: 'delete', exact: true }) : page.getByRole('button', { name: 'Delete this Entry' });
        if (media) await page.locator('.entryLoaded').hover();
        await remove.click();
        await expect(page.getByRole('dialog', { name: 'Delete entry' })).toBeVisible();
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
        expect(await page.evaluate(() => window.journalTest.entries.length)).toBe(1);
        if (media) await page.locator('.entryLoaded').hover();
        await remove.click();
        await page.evaluate(() => { window.journalTest.deleteFailure = true; });
        await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
        await expect(page.getByRole('alert')).toContainText('Unable to delete');
        await page.evaluate(() => { window.journalTest.deleteFailure = false; });
        await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
        expect(await page.evaluate(() => window.journalTest.entries.length)).toBe(0);
        expect(await page.evaluate(() => window.journalTest.calls.some(c => c[0] === 'external'))).toBe(false);
    });
}

test('pagination retains existing rows while fetching ahead and terminates cleanly', async ({ page }) => {
    await desktop(page, { count: 65 });
    await page.goto('/#/');
    await expect(page.getByText('Entry 1', { exact: true })).toBeVisible();
    await page.getByText('Entry 1', { exact: true }).evaluate(element => { window.firstCard = element; });
    await page.evaluate(() => { window.journalTest.delay = true; window.scrollTo(0, document.body.scrollHeight); });
    await expect.poll(() => page.evaluate(() => window.journalTest.pending.length)).toBe(1);
    expect(await page.evaluate(() => window.firstCard.isConnected)).toBe(true);
    await page.evaluate(() => { window.journalTest.delay = false; window.journalTest.pending.splice(0).forEach(resolve => resolve()); });
    await expect(page.getByText('Entry 60', { exact: true })).toBeAttached();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.getByText('Entry 65', { exact: true })).toBeAttached();
    await expect(page.getByRole('button', { name: 'Show older days' })).toBeVisible();
    const offsets = await page.evaluate(() => window.journalTest.calls.filter(c => c[0] === 'fetch').map(c => c[1].offset || 0));
    expect(offsets).toEqual([0, 30, 60]);
    expect(await page.evaluate(() => window.firstCard.isConnected)).toBe(true);
});

test('Save serializes behind an in-flight first autosave', async ({ page }) => {
    await desktop(page);
    await page.goto('/#/write');
    await page.evaluate(() => { window.journalTest.delayInsert = true; });
    await page.locator('#writeto').fill('One entry only');
    await expect.poll(() => page.evaluate(() => window.journalTest.pending.length), { timeout: 6000 }).toBe(1);
    await page.locator('#submitbtn').click();
    await expect(page.locator('#writeto')).toBeDisabled();
    expect(await page.evaluate(() => window.journalTest.calls.filter(c => c[0] === 'insert').length)).toBe(1);
    await page.evaluate(() => window.journalTest.pending.splice(0).forEach(resolve => resolve()));
    await expect(page).toHaveURL(/#\/view\/1000$/);
    expect(await page.evaluate(() => window.journalTest.calls.filter(c => c[0] === 'update').length)).toBe(1);
});

test('a changed search discards an older delayed response', async ({ page }) => {
    await desktop(page, { count: 65 });
    await page.goto('/#/');
    await expect(page.getByText('Entry 1', { exact: true })).toBeVisible();
    await page.evaluate(() => { window.journalTest.delay = true; });
    const search = page.getByPlaceholder('Press enter to search');
    await search.fill('Entry 2');
    await search.press('Enter');
    await expect.poll(() => page.evaluate(() => window.journalTest.pending.length)).toBe(1);
    await search.fill('Entry 3');
    await search.press('Enter');
    await expect.poll(() => page.evaluate(() => window.journalTest.pending.length)).toBe(2);
    await page.evaluate(() => window.journalTest.pending[1]());
    await expect(page.getByText('Entry 3', { exact: true })).toBeAttached();
    await page.evaluate(() => window.journalTest.pending[0]());
    await expect(page.getByText('Entry 2', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Entry 3', { exact: true })).toBeAttached();
});

test('settings can exit native fullscreen and open an independent window', async ({ page }) => {
    await desktop(page);
    await page.goto('/#/settings');
    await page.getByRole('button', { name: 'Exit fullscreen' }).click();
    await page.getByRole('button', { name: 'Open another window' }).click();
    const calls = await page.evaluate(() => window.journalTest.calls);
    expect(calls).toContainEqual(['unfullscreen']);
    expect(calls).toContainEqual(['window']);
});
