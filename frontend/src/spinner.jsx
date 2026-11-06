import React from "react";

//
// The one spinner in the app: a tapered ring drawn in CSS, so it stays crisp at any size
// and on any screen without an image or a library behind it.
//
export const Spinner = ({ size = 36, label = "Loading" }) => (
    <span className="spinner-wrap" role="status" aria-label={label}>
        <span className="spinner" style={{ '--spinner-size': `${size}px` }} />
    </span>
);
