import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import { App } from "./app.js";
import { IS_ELECTRON } from "./config.js";

const container = document.getElementById("root");
const root = createRoot(container);

console.log("Rendering app...", IS_ELECTRON ? "Electron mode" : "Web mode");

// Use HashRouter for Electron, BrowserRouter for web
const Router = IS_ELECTRON ? HashRouter : BrowserRouter;

root.render(
    <Router>
      <App />
    </Router>
);
console.log("App rendered.");