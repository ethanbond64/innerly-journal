import test from 'node:test';
import assert from 'node:assert/strict';
import { appendEntries, appendEmptyDays } from '../src/timeline.js';

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

test('a gap between entries is one compact row instead of dozens of eager React updates', () => {
    const rows = appendEntries([], [entry(1, 7)], today);
    assert.equal(rows.length, 3);
    assert.equal(rows[1].date.getDate(), 9);
    assert.equal(rows[1].endDate.getDate(), 8);
    assert.equal(rows[1].collapse, true);
});

test('past the oldest entry the timeline continues as open days, a chunk at a time', () => {
    const rows = appendEntries([], [entry(1, 7)], today);
    const extended = appendEmptyDays(rows, 3, today);
    assert.equal(extended.length, rows.length + 3);
    assert.deepEqual(extended.slice(rows.length).map((row) => row.date.getDate()), [6, 5, 4]);
    assert.ok(extended.slice(rows.length).every((row) => row.collapse === false && row.entries.length === 0));
    // Appending again picks up where the last chunk left off.
    const again = appendEmptyDays(extended, 2, today);
    assert.deepEqual(again.slice(extended.length).map((row) => row.date.getDate()), [3, 2]);
});

test('the days after a collapsed gap carry on from the end of it', () => {
    const rows = appendEntries([], [entry(1, 10)], today);
    const gap = [...rows, { date: new Date(2026, 5, 9, 23, 59), endDate: new Date(2026, 5, 5, 23, 59), collapse: true, entries: [] }];
    const extended = appendEmptyDays(gap, 2, today);
    assert.deepEqual(extended.slice(gap.length).map((row) => row.date.getDate()), [4, 3]);
});

test('empty journals still show today', () => {
    const rows = appendEntries([], [], today);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].date, today);
});

test('a journal with no entries at all scrolls back from today', () => {
    const rows = appendEmptyDays(appendEntries([], [], today), 3, today);
    assert.deepEqual(rows.map((row) => row.date.getDate()), [10, 9, 8, 7]);
    assert.ok(rows.every((row) => row.collapse === false));
});

// The first page can arrive before any row exists, so the chunk has to seed today itself.
test('empty days asked for before anything is rendered start at today', () => {
    const rows = appendEmptyDays([], 2, today);
    assert.deepEqual(rows.map((row) => row.date.getDate()), [10, 9, 8]);
    assert.equal(rows[0].date, today);
});
