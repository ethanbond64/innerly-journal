import React from "react";
import { createRoot } from "react-dom/client";
import { Router } from "./router.jsx";
import { App } from "./app.jsx";
import { isDesktop, desktopApp } from './desktop.js';
import { setUserData } from './utils.jsx';

const container = document.getElementById("root");
const root = createRoot(container);
const hasMacTitlebar = isDesktop() && /Mac/.test(navigator.platform);
if (hasMacTitlebar) document.documentElement.classList.add('mac-titlebar');

const start = async () => {
    if (isDesktop()) {
        const result = await desktopApp().CurrentUser();
        setUserData(result.error ? null : result.data);
    }
    root.render(<>
        {hasMacTitlebar && <div className="window-titlebar" aria-hidden="true" />}
        <Router><App /></Router>
    </>);
};
start();