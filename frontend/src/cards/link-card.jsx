import React from "react";
import { ImageCard } from "./image-card.jsx";

export const LinkCard = ({ entry, replace }) => {

    const title = entry && entry.entry_data && entry.entry_data.title ? entry.entry_data.title : null;
    const link = entry.entry_data.link;
    const footer = link.replace('https://', '').replace('http://', '').replace('www.', '').split(/[/?#]/)[0];

    // The one genuinely external link in the app, and the only <a> here that should not
    // be routed in-app. Under Wails, target="_blank" has no browser to hand the URL to:
    // the webview either ignores it or navigates itself to the site, leaving the user
    // stuck with no chrome to go back with. At port time this needs an onClick that
    // preventDefault()s and calls the Wails runtime's BrowserOpenURL(link), so the OS
    // browser opens it instead. Keep the href so the web build stays a normal link.
    return (
        <a href={entry.entry_data.link} rel={`noreferrer`} target="_blank">
            <ImageCard entry={entry} replace={replace} heading={title} footer={footer} />
        </a>
    );
};