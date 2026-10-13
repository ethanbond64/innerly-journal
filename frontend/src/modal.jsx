import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// A native modal dialog makes the rest of the document inert, including focused editors.
export const Modal = ({ children, label, onCancel = () => {} }) => {
    const ref = useRef(null);
    useLayoutEffect(() => {
        const dialog = ref.current;
        dialog.showModal();
        return () => dialog.close();
    }, []);
    return createPortal(<dialog ref={ref} className="modal" aria-label={label}
        onClick={event => event.stopPropagation()}
        onCancel={(event) => { event.preventDefault(); onCancel(); }}
        style={{ display: 'block', margin: 0, border: 0, maxWidth: 'none', maxHeight: 'none', padding: '30px' }}>
        <div className="modal-dialog"><div className="modal-content" style={{ padding: '24px' }}>
            {children}
        </div></div>
    </dialog>, document.body);
};
