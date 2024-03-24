import {fillGap} from './monthFiller';




test('No gap between years', () => {
    expect(fillGap(0, 2021, 11, 2020)).toStrictEqual([]);
});

test('single gap between years', () => {
    expect(fillGap(0, 2021, 10, 2020)).toStrictEqual([{month: 11, year: 2020, days:[]}]);
});

test('single gap between years 2', () => {
    expect(fillGap(1, 2021, 11, 2020)).toStrictEqual([{ month: 0, year: 2021, days:[]}]);
});

test('Extended gap in between years', () => {
    expect(fillGap(3, 2021, 10, 2020)).toStrictEqual([{ month: 2, year: 2021, days:[]}, { month: 1, year: 2021, days:[]}, { month: 0, year: 2021, days:[]}, { month: 11, year: 2020, days:[]}]);
});

test('Extended gap in between years 2', () => {
    expect(fillGap(5, 2021, 11, 2020)).toStrictEqual([{ month: 4, year: 2021, days:[]}, { month: 3, year: 2021, days:[]}, { month: 2, year: 2021, days:[]}, { month: 1, year: 2021, days:[]}, { month: 0, year: 2021, days:[]}]);
});



test('Error no gap between years', () => {
    expect(fillGap(11, 2020, 0, 2021)).toStrictEqual([]);
});

test('Error single gap between years', () => {
    expect(fillGap(11, 2020, 1, 2021)).toStrictEqual([]);
});

test('Error extended gap between years', () => {
    expect(fillGap(11, 2020, 3, 2021)).toStrictEqual([]);
});



test('No gap same year', () => {
    expect(fillGap(7, 2021, 6, 2021)).toStrictEqual([]);
});

test('Single gap same year', () => {
    expect(fillGap(7, 2021, 5, 2021)).toStrictEqual([{ month: 6, year: 2021, days:[]}]);
});

test('Extended gap same year', () => {
    expect(fillGap(7, 2021, 3, 2021)).toStrictEqual([{ month: 6, year: 2021, days:[]}, { month: 5, year: 2021, days:[]}, { month: 4, year: 2021, days:[]}]);
});




test('Error no gap same year', () => {
    expect(fillGap(7, 2021, 8, 2021)).toStrictEqual([]);
});

test('Error single gap same year', () => {
    expect(fillGap(7, 2021, 9, 2021)).toStrictEqual([]);
});

test('Error extended gap same year', () => {
    expect(fillGap(3, 2021, 9, 2021)).toStrictEqual([]);
});
