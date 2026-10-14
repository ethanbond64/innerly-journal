import test from 'node:test';
import assert from 'node:assert/strict';
import { appendEntries, appendOlderDays } from '../src/timeline.js';

const today = new Date(2026, 5, 10, 23, 59);
const entry = (id, day) => ({ id, functional_datetime: new Date(2026, 5, day, 12).toISOString() });

test('the incomplete last day stays visible and later pages do not mutate existing rows', () => {
    const first = appendEntries([], [entry(1, 10), entry(2, 9)], today);
    const second = appendEntries(first, [entry(3, 9), entry(4, 8)], today);
    assert.equal(first[1].entries.length, 1);
    assert.equal(second[1].entries.length, 2);
    assert.equal(second[0], first[0]);
    assert.equal(second[2].entries[0].id, 4);
});

test('gaps and older days are compact rows instead of dozens of eager React updates', () => {
    const rows = appendEntries([], [entry(1, 7)], today);
    assert.equal(rows.length, 3);
    assert.equal(rows[1].date.getDate(), 9);
    assert.equal(rows[1].endDate.getDate(), 8);
    assert.equal(rows[1].collapse, true);
    const older = appendOlderDays(rows);
    assert.equal(older.length, 4);
    assert.equal(older[3].date.getDate(), 6);
    assert.equal(older[3].collapse, true);
});

test('empty journals still show today', () => {
    const rows = appendEntries([], [], today);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].date, today);
});
