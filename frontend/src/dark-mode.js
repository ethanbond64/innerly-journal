import { useState, useEffect } from 'react';

export const useDarkMode = () => {
    // Initialize theme from localStorage or default to light
    const [isDarkMode, setIsDarkMode] = useState(() => {
        return localStorage.getItem("color-theme") === "dark";
    });

    // Apply theme to document on mount and when it changes
    useEffect(() => {
        const theme = isDarkMode ? "dark" : "light";
        localStorage.setItem("color-theme", theme);
        document.documentElement.setAttribute("data-theme", theme);
    }, [isDarkMode]);

    // Toggle function
    const toggleDarkMode = () => {
        setIsDarkMode(prevMode => !prevMode);
    };

    // Set theme directly (useful for checkbox onChange handlers)
    const setDarkMode = (enabled) => {
        setIsDarkMode(enabled);
    };

    return {
        isDarkMode,
        toggleDarkMode,
        setDarkMode
    };
};