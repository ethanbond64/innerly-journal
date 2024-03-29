import React from "react";

export const ImageModal = ({ path, clear }) => {

    return (
        <div id="entModal" className={`modal`} style={{ display: 'block', zIndex: '1006' }}>
            <div className={`modal-content`} style={{ backgroundImage: `url(${path})`, padding: '0px', backgroundPosition: 'center', backgroundSize: 'contain' }}>
                <span className={`closemodal`} style={{ color: 'var(--dm-text)' }} onClick={clear}>&times;</span>
            </div>
        </div>
    );
};