import React, { useEffect, useRef } from 'react';
import { innerlyToken, innerlyUser, LOCK_TTL_DEFAULT, LOCK_TTL_UNIT_SECONDS } from './constants.js';

export const getToken = () => {
    return localStorage.getItem(innerlyToken);
}

export const setToken = (token) => {
    localStorage.setItem(innerlyToken, token);
}

export const getUserData = () => {
    let userData = localStorage.getItem(innerlyUser);
    return userData ? JSON.parse(userData) : null;
}

export const setUserData = (userData) => {
    localStorage.setItem(innerlyUser, JSON.stringify(userData));
}

// New entries are encrypted before they are first stored unless the user turned this off.
export const getLockByDefault = () => {
    const userData = getUserData();
    const settings = userData && userData.settings ? userData.settings : {};
    return settings.lock_by_default !== false;
}

// The lock timeout the user picked, falling back to what the server uses when unset.
export const getLockTtl = (userData = getUserData()) => {
    const settings = userData && userData.settings ? userData.settings : {};
    const unit = LOCK_TTL_UNIT_SECONDS[settings.lock_ttl_unit] ? settings.lock_ttl_unit : LOCK_TTL_DEFAULT.unit;
    const value = Number.isInteger(settings.lock_ttl_value) ? settings.lock_ttl_value : LOCK_TTL_DEFAULT.value;
    return { value, unit };
}

export const clearLocalStorage = () => {
    localStorage.removeItem(innerlyUser);
    localStorage.removeItem(innerlyToken);
}

export const getTodaysDate = () => {
    const now = new Date();
    return getDateNoTime(now.getFullYear(), now.getMonth(), now.getDate());
}

export const dateToString = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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

const useOutsideAlerter = (ref, callback) => {
    const callbackRef = useRef(callback);

    useEffect(() => {
        callbackRef.current = callback;
    }, [callback]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (ref.current && !ref.current.contains(event.target)) {
                callbackRef.current();
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [ref]);
};


export const ClickOutsideTracker = ({ callback, children }) => {
    const wrapperRef = useRef(null);
    useOutsideAlerter(wrapperRef, callback);
    return <div ref={wrapperRef}>{children}</div>;
}