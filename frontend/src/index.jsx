import React from "react";
import { createRoot } from "react-dom/client";
import { Router } from "./router.jsx";
import { App } from "./app.jsx";
import { isDesktop, desktopApp } from './desktop.js';
import { setUserData } from './utils.jsx';

const container = document.getElementById("root");
const root = createRoot(container);

const start = async () => {
    if (isDesktop()) {
        const result = await desktopApp().CurrentUser();
        setUserData(result.error ? null : result.data);
    }
    root.render(<Router><App /></Router>);
};
start();