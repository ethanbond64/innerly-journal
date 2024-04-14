import React from 'react';

export const Notification = ({ message, clear, type = 'error' }) => {

    if (!message) {
        return null;
    }

    return (
        <div id="flash-messages" class="row sm-margin-top">
            <div class={`alert alert-${type} alert-dismissible md-margin-top`} role="alert">
                {message}
                <button type="button" className="close nondrag" onClick={clear}>
                    <span aria-hidden="true">×</span>
                </button>
            </div>  
        </div>
    );
};