import React from 'react';

export const Notification = ({ message, clear, type = 'error', inline = false }) => {

    if (!message) {
        return null;
    }

    const alert = (
        <div class={`alert alert-${type} alert-dismissible ${inline ? '' : 'md-margin-top'}`} role="alert">
            {message}
            <button type="button" className="close nondrag" onClick={clear}>
                <span aria-hidden="true">×</span>
            </button>
        </div>
    );

    return inline ? alert : <div id="flash-messages" class="row sm-margin-top">{alert}</div>;
};