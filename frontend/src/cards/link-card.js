import React from "react";
import { ImageCard } from "./image-card";

export const LinkCard = ({ entry }) => {
    return (
        <a href={entry.entry_data.link} rel={`noreferrer`} target="_blank">
            <ImageCard entry={entry} />
        </a>
    );
}