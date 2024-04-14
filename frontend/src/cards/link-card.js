import React from "react";
import { ImageCard } from "./image-card.js";

export const LinkCard = ({ entry, replace }) => {

    const title = entry && entry.entry_data && entry.entry_data.title ? entry.entry_data.title : null;
    const link = entry.entry_data.link;
    const footer = link.replace('https://', '').replace('http://', '').replace('www.', '').split(/[/?#]/)[0];

    return (
        <a href={entry.entry_data.link} rel={`noreferrer`} target="_blank">
            <ImageCard entry={entry} replace={replace} heading={title} footer={footer} />
        </a>
    );
};