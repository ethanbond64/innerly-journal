import test from 'node:test';
import assert from 'node:assert/strict';
import { attachEditorSave, clearEditorSaves, editorSave, setSaveNeedsPassword, withSavedWriting } from '../src/editor-saves.js';

test.afterEach(clearEditorSaves);
const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};

test('restart waits for the detached editor save and does not insert twice', async () => {
    const pending = deferred();
    let saves = 0, restarted = false;
    const buffer = editorSave(null, '', async () => { saves++; return pending.promise; });
    const detach = attachEditorSave(buffer, () => {});
    buffer.change('Unsaved writing');
    detach(); // e.g. the app menu changed the route to Updates
    const restart = withSavedWriting(async () => { restarted = true; });
    await Promise.resolve();
    assert.equal(restarted, false);
    pending.resolve({ id: 7 });
    await restart;
    assert.equal(saves, 1);
    assert.equal(restarted, true);
    assert.equal(buffer.id, 7);
});

test('edits during an in-flight save are flushed before restarting', async () => {
    const pending = deferred();
    const values = [];
    const buffer = editorSave(7, 'original', async (_, text) => {
        values.push(text);
        return values.length === 1 ? pending.promise : { id: 7 };
    });
    attachEditorSave(buffer, () => {});
    buffer.change('first');
    const save = buffer.flush();
    // Timer ticks and restart can all be waiting behind the same request.
    const queued = [buffer.flush(), buffer.flush()];
    buffer.change('latest');
    const restart = withSavedWriting(async () => assert.deepEqual(values, ['first', 'latest']));
    pending.resolve({ id: 7 });
    await Promise.all([save, ...queued, restart]);
});

test('failed saves block restart, keep plaintext, and can be retried', async () => {
    let failed = true, restarted = false;
    const buffer = editorSave(7, '', async () => {
        if (failed) throw new Error('Disk full');
        return { id: 7 };
    });
    attachEditorSave(buffer, () => {});
    buffer.change('Do not lose this');
    await assert.rejects(withSavedWriting(async () => { restarted = true; }), /Disk full/);
    assert.equal(restarted, false);
    assert.equal(buffer.value, 'Do not lose this');
    failed = false;
    await withSavedWriting(async () => { restarted = true; });
    assert.equal(restarted, true);
});

test('returning to a detached failed edit restores its unsaved buffer', async () => {
    const buffer = editorSave(7, '', async () => { throw new Error('Save failed'); });
    const detach = attachEditorSave(buffer, () => {});
    buffer.change('Recover me');
    detach();
    await assert.rejects(buffer.pending, /Save failed/);
    const restored = editorSave('7', 'stale server text', async () => ({ id: 7 }));
    assert.equal(restored, buffer);
    assert.equal(restored.value, 'Recover me');
});

test('a lock-password prompt blocks restart immediately, not after a blind sleep', async () => {
    const pending = deferred();
    const buffer = editorSave(7, '', async () => pending.promise);
    attachEditorSave(buffer, () => {});
    buffer.change('Private writing');
    let restarted = false;
    const restart = withSavedWriting(async () => { restarted = true; });
    setSaveNeedsPassword(true);
    await assert.rejects(restart, /lock password/);
    assert.equal(restarted, false);
    pending.resolve({ id: 7 });
    await buffer.pending;
    setSaveNeedsPassword(false);
    await withSavedWriting(async () => { restarted = true; });
    assert.equal(restarted, true);
});

test('restart failure releases the shared barrier so journal use can continue', async () => {
    await assert.rejects(withSavedWriting(async () => { throw new Error('Other window open'); }), /Other window/);
    let retried = false;
    await withSavedWriting(async () => { retried = true; });
    assert.equal(retried, true);
});

test('logout clears retained plaintext instead of leaking it into another session', async () => {
    const buffer = editorSave(7, '', async () => ({ id: 7 }));
    attachEditorSave(buffer, () => {});
    buffer.change('Private');
    clearEditorSaves();
    assert.equal(buffer.value, '');
    await withSavedWriting(async () => {});
});
