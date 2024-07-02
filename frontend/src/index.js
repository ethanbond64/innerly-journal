import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import { App } from "./app.js";

const container = document.getElementById("root");
const root = createRoot(container);

console.log("Rendering app...");
root.render(
    <HashRouter>
      <App />
    </HashRouter>
);
console.log("App rendered.");