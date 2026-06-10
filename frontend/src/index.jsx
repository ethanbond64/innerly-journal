import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./app.jsx";

const container = document.getElementById("root");
const root = createRoot(container);

console.log("Rendering app...");
root.render(
    <BrowserRouter>
      <App />
    </BrowserRouter>
);
console.log("App rendered.");