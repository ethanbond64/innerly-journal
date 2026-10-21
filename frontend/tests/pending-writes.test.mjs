import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { flushWriting, trackDraft } from '../src/pending-writes.js';

test('restart waits for the mounted editor to save', async () => {
    let saved = false;
    trackDraft(async () => { saved = true; });
    await flushWriting();
    assert.equal(saved, true);
});

test('restart waits for a save that outlived the editor route', async () => {
    let release;
    const started = new Promise(resolve => { release = resolve; });
    const leave = trackDraft(() => started);
    leave(); // navigating away from the editor flushes its draft
    let waited = false;
    const waiting = flushWriting().then(() => { waited = true; });
    await Promise.resolve();
    assert.equal(waited, false);
    release();
    await waiting;
    assert.equal(waited, true);
});

test('a failed save blocks the restart and is reported', async () => {
    const leave = trackDraft(() => Promise.reject(new Error('Your writing could not be saved.')));
    leave();
    await assert.rejects(flushWriting(), /could not be saved/);
    // Returning to the editor and saving successfully clears the block.
    trackDraft(async () => {});
    await flushWriting();
});

test('writing stuck behind a lock password does not hang the restart', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    trackDraft(() => new Promise(() => {})); // a save queued until the password is entered
    const waiting = assert.rejects(flushWriting(), /still saving/);
    mock.timers.tick(10000);
    await waiting;
    mock.timers.reset();
});

