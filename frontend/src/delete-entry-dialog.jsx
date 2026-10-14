import { useState } from 'react';
import { deleteEntry } from './requests.js';
import { Modal } from './modal.jsx';

export const DeleteEntryDialog = ({ entryId, onDeleted, onCancel }) => {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const remove = () => {
        setBusy(true);
        deleteEntry(entryId, () => onDeleted(), () => {
            setBusy(false);
            setError('Unable to delete this entry. Please try again.');
        });
    };
    return <Modal label="Delete entry" onCancel={() => { if (!busy) onCancel(); }}>
        <h3>Delete this entry?</h3>
        <p>This cannot be undone.</p>
        {error && <p role="alert">{error}</p>}
        <button autoFocus className="btn btn-default" disabled={busy} onClick={onCancel}>Cancel</button>{' '}
        <button className="btn btn-danger" disabled={busy} onClick={remove}>Delete</button>
    </Modal>;
};
