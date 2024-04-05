import React from "react";
import { ImageCard } from "./image-card.js";

export const LinkCard = ({ entry, replace }) => {

    const title = entry && entry.entry_data && entry.entry_data.title ? entry.entry_data.title : null;
    const siteImageData = getSiteImageData(entry);

    return (
        <a href={entry.entry_data.link} rel={`noreferrer`} target="_blank">
            <ImageCard entry={entry} replace={replace} heading={title} footerImage={siteImageData.image} footerImageSize={siteImageData.size} />
        </a>
    );
}

const youtube = "youtube"
const spotify = "spotify"
const soundcloud = "soundcloud"
const wikipedia = "wikipedia"

const getSiteImageData = (entry) => {
    switch(entry.entry_data.site) {
        case youtube:
            return { image:"/images/yt_logo_rgb_dark.png", size: 18 };
        case spotify:
            return { image: "/images/Spotify_Logo_RGB_Green.png", size: null};
        case soundcloud:
            return { image: "/images/Soundcloud_logo_white.png", size: 23 };
        case wikipedia:
            return { image: "/images/Wikipedia-logo-white.png", size: 23 };
    }
    return { image: null, size: null};
};

