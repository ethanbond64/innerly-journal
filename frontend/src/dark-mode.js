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

        // The transparent native title bar uses the window background colour.
        // Read the actual page colour so it stays in sync with both themes.
        if (window.runtime?.WindowSetBackgroundColour) {
            const rgb = getComputedStyle(document.body).backgroundColor.match(/\d+/g);
            if (rgb?.length >= 3) {
                window.runtime.WindowSetBackgroundColour(...rgb.slice(0, 3).map(Number), 255);
            }
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