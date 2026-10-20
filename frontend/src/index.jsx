import React from "react";
import { createRoot } from "react-dom/client";
import { Router } from "./router.jsx";
import { App } from "./app.jsx";
import { initializeDesktop, isDesktop, isMacDesktop, desktopApp } from './desktop.js';
import { setUserData } from './utils.jsx';

const container = document.getElementById("root");
const root = createRoot(container);
const start = async () => {
    await initializeDesktop();
    const hasMacTitlebar = isMacDesktop();
    if (hasMacTitlebar) document.documentElement.classList.add('mac-titlebar');
    if (isDesktop()) {
        const result = await desktopApp().CurrentUser();
        setUserData(result.error ? null : result.data);
    }
    root.render(<>
        {hasMacTitlebar && <div className="window-titlebar" aria-hidden="true" />}
        <Router><App /></Router>
    </>);
};
start().catch(() => {
    root.render(<main role="alert" style={{ padding: '48px' }}>
        <h1>Innerly could not start</h1>
        <p>The desktop connection could not be established. Please close and reopen Innerly, or try reloading.</p>
        <button type="button" onClick={() => window.location.reload()}>Reload</button>
    </main>);
});