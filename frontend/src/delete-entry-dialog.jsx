import { useState } from 'react';
import { deleteEntry } from './requests.js';
import { Modal } from './modal.jsx';

export const DeleteEntryDialog = ({ entryId, onDeleted, onCancel }) => {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const cancel = () => { if (!busy) onCancel(); };
    const remove = () => {
        setBusy(true);
        deleteEntry(entryId, () => onDeleted(), () => {
            setBusy(false);
            setError('Unable to delete this entry. Please try again.');
        });
    };
    return <Modal label="Delete entry" title="Delete this entry?" onCancel={cancel}>
        <p>This cannot be undone.</p>
        {error && <p className="text-danger" role="alert">{error}</p>}
        <div className="modal-actions">
            <button autoFocus className="btn btn-default" disabled={busy} onClick={cancel}>Cancel</button>
            <button className="btn btn-danger" disabled={busy} onClick={remove}>Delete</button>
        </div>
    </Modal>;
};
