
function handeMonthsResp(resMonths, querycount, month, year, setList) {

    // Case First Month is blank
    if (querycount === 1 && !(resMonths[0].month === month && resMonths[0].year === year)) {
        let today = new Date();
        let isodate = today.toISOString().split('T')[0];
        let curMonth = [{ month: month, year: year, isCurrent: true, days: [{ isodate: isodate, ents: [] }] }];

        fillMonths(setList, resMonths, curMonth);

        // Case First Month Not Blank
    }
    fillMonths(setList, resMonths);

    return [];
}

function fillMonths(setList, resMonths, curMonth = null) {

    if (!curMonth) {
        setList((prev) => [
            ...new Set([...prev, ...fillSetGap(prev, resMonths), ...fillResMonths(resMonths)])
        ]);
    } else {
        console.log(curMonth);
        console.log(resMonths);
        setList(() => [
            ...new Set([...curMonth, ...fillResMonths(resMonths)])
        ]);
    }

}

function fillSetGap(prev, resMonths) {
    if (prev === undefined || prev.length === 0) return [];

    let firstMonth = prev[prev.length - 1].month;
    console.log(prev);
    let firstYear = prev[prev.length - 1].year;
    let secondMonth = resMonths[0].month;
    let secondYear = resMonths[0].year;

    let collapseId = secondYear + "-" + secondMonth;
    // Pass by reference?
    // prev[prev.length - 1].collapseId = collapseId;

    return fillGap(firstMonth, firstYear, secondMonth, secondYear, collapseId);
}

function fillResMonths(resMonths) {

    if (resMonths.length < 2) return resMonths;

    let newResMonths = [resMonths[0]];

    for (let i = 1; i < resMonths.length; i++) {
        let firstMonth = newResMonths[newResMonths.length - 1].month;
        let firstYear = newResMonths[newResMonths.length - 1].year;
        let secondMonth = resMonths[i].month;
        let secondYear = resMonths[i].year;

        let collapseId = secondYear + "-" + secondMonth;
        newResMonths[newResMonths.length - 1].collapseId = collapseId;

        newResMonths = [...newResMonths, ...fillGap(firstMonth, firstYear, secondMonth, secondYear, collapseId), resMonths[i]];
    }

    return newResMonths


}

function fillGap(firstMonth, firstYear, secondMonth, secondYear, collapseId) {

    if (firstYear < secondYear || (firstYear === secondYear && firstMonth <= secondMonth)) return [];

    let between = [];

    if (firstMonth === 0) {
        firstYear -= 1;
        firstMonth = 11;
    } else {
        firstMonth -= 1;
    }

    while (!(firstMonth === secondMonth && firstYear === secondYear)) {
        between.push({ month: firstMonth, year: firstYear, days: [], collapseId: collapseId });
        if (firstMonth === 0) {
            firstYear -= 1;
            firstMonth = 11;
        } else {
            firstMonth -= 1;
        }

    }

    return between;
}


function genNext(firstMonth, firstYear, n_next) {
    let months = [];
    let newMonth = firstMonth;
    let newYear = firstYear;

    for (let i = 0; i < n_next; i++) {
        console.log(newMonth, newYear);
        months.push({ month: newMonth, year: newYear, days: [] });
        if (newMonth === 0) {
            newYear -= 1;
            newMonth = 11;
        } else {
            newMonth -= 1;
        }
    }

    return [newMonth, newYear, months];
}

export { handeMonthsResp, fillMonths, fillGap, genNext };