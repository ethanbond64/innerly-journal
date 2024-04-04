import React from "react";
import { ImageCard } from "./image-card.js";

export const LinkCard = ({ entry, replace }) => {
    return (
        <a href={entry.entry_data.link} rel={`noreferrer`} target="_blank">
            <ImageCard entry={entry} replace={replace}/>
        </a>
    );
}