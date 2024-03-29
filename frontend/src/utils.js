
export const getTodaysDate = () => {
    const now = new Date();
    return getDateNoTime(now.getFullYear(), now.getMonth(), now.getDate());
}

export const getDateNoTime = (year, month, day) => {
    return new Date(year, month, day, 23, 59, 0);
}

export const getNextDate = (date) => {
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    return getDateNoTime(nextDay.getFullYear(), nextDay.getMonth(), nextDay.getDate());
};

export const getPreviousDate = (date) => {
    const prevDay = new Date(date);
    prevDay.setDate(prevDay.getDate() - 1);
    return getDateNoTime(prevDay.getFullYear(), prevDay.getMonth(), prevDay.getDate());
}

export const equalsDate = (date1, date2) => {
    return date1.getFullYear() === date2.getFullYear() && date1.getMonth() === date2.getMonth() && date1.getDate() === date2.getDate();
}