import { useState, useEffect } from 'react';
import { setWindowBackground } from './desktop.js';

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

        // The transparent native title bar uses the window background colour.
        // Read the actual page colour so it stays in sync with both themes.
        const rgb = getComputedStyle(document.body).backgroundColor.match(/\d+/g);
        if (rgb?.length >= 3) {
            setWindowBackground(...rgb.slice(0, 3).map(Number));
        }
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