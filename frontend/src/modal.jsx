import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// A native modal dialog makes the rest of the document inert, including focused editors.
// Every modal in the app is this one panel: a titled card over a dimmed backdrop, with an
// optional × and the backdrop itself closing it when the caller allows cancelling.
export const Modal = ({ children, label, title = null, subtitle = null,
                        closeable = true, onCancel = () => {} }) => {
    const ref = useRef(null);
    useLayoutEffect(() => {
        const dialog = ref.current;
        // showModal moves focus to the panel itself, so a field the caller marked
        // autoFocus — already focused by React at this point — keeps it.
        const autofocused = dialog.contains(document.activeElement) ? document.activeElement : null;
        dialog.showModal();
        autofocused?.focus();
        return () => dialog.close();
    }, []);
    // Only a press that both starts and ends on the backdrop closes the panel, so a
    // selection dragged out of the card does not dismiss it.
    const backdrop = useRef(false);
    const onMouseDown = (event) => { backdrop.current = event.target === ref.current; };
    const onClick = (event) => {
        event.stopPropagation();
        if (closeable && backdrop.current && event.target === ref.current) onCancel();
    };
    return createPortal(<dialog ref={ref} className="modal modal-panel" aria-label={label}
        onMouseDown={onMouseDown}
        onClick={onClick}
        onCancel={(event) => { event.preventDefault(); onCancel(); }}>
        {/* The panel itself takes the dialog's initial focus, so opening one does not
            ring the first link; anything with autoFocus still claims it on mount. */}
        <div className="modal-dialog" role="document"><div className={`modal-content${closeable ? ' has-close' : ''}`} tabIndex={-1}>
            {closeable && <span className="closemodal" onClick={onCancel}>&times;</span>}
            {title && <div className="modal-header">
                <h3 className="modal-title">{title}</h3>
                {subtitle && <p className="modal-subtitle">{subtitle}</p>}
            </div>}
            <div className="modal-body">{children}</div>
        </div></div>
    </dialog>, document.body);
};
