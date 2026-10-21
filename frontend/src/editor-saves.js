// Save buffers outlive their editor route. Navigating to Updates must not drop
// an in-flight save or forget a failed/dirty draft before Install and Restart.
const buffers = new Set();
const passwordWaiters = new Set();
let needsPassword = false;
let restarting = false;

export const setSaveNeedsPassword = (value) => {
    needsPassword = value;
    if (value) passwordWaiters.forEach(reject => reject(new Error('Enter your lock password and finish saving before restarting.')));
};

export const editorSave = (id, value, write) => {
    // Restore a detached unsaved edit if the user returns to that same entry.
    const previous = [...buffers].find(buffer => id !== null && String(buffer.id) === String(id) && !buffer.attached);
    if (previous) return previous;
    return {
        id, value, write, dirty: false, pending: null, attached: false, onState: () => {},
        change(value) { this.value = value; this.dirty = true; this.onState('unsaved'); },
        async flush(draft = true) {
            while (this.pending) await this.pending;
            if (!this.dirty && draft) return;
            const snapshot = this.value;
            const pending = this.write(this.id, snapshot, draft).then(data => {
                if (!data?.id) throw new Error('Writing could not be saved.');
                this.id = data.id;
                this.dirty = this.value !== snapshot;
                this.onState(this.dirty ? 'unsaved' : 'saved');
                return data;
            }).catch(error => {
                this.dirty = true;
                this.onState('failed');
                throw error;
            }).finally(() => {
                if (this.pending === pending) this.pending = null;
                if (!this.attached && !this.dirty) buffers.delete(this);
            });
            this.pending = pending;
            return pending;
        }
    };
};

export const attachEditorSave = (buffer, onState) => {
    buffers.add(buffer);
    buffer.attached = true;
    buffer.onState = onState;
    onState(buffer.dirty ? 'unsaved' : 'saved');
    return () => {
        buffer.attached = false;
        buffer.onState = () => {};
        // A rejected detached save stays registered (and recoverable).
        buffer.flush().catch(() => {});
        if (!buffer.dirty && !buffer.pending) buffers.delete(buffer);
    };
};

export const clearEditorSaves = () => {
    buffers.forEach(buffer => { buffer.value = ''; buffer.dirty = false; });
    buffers.clear();
    setSaveNeedsPassword(false);
};

export const withSavedWriting = async (restart) => {
    if (restarting) throw new Error('A restart is already being prepared.');
    restarting = true;
    const document = globalThis.document;
    const root = document?.getElementById('root');
    const wasInert = root?.inert;
    if (root) root.inert = true; // no new edits/navigation between the flush and quit
    // Older macOS WebKit versions do not implement inert yet.
    const blockInput = event => { event.preventDefault(); event.stopImmediatePropagation(); };
    const inputEvents = ['click', 'keydown', 'beforeinput'];
    inputEvents.forEach(type => document?.addEventListener(type, blockInput, true));
    let timeout, rejectPassword;
    try {
        if (needsPassword) throw new Error('Enter your lock password and finish saving before restarting.');
        const password = new Promise((_, reject) => { rejectPassword = reject; passwordWaiters.add(reject); });
        const bounded = new Promise((_, reject) => {
            timeout = setTimeout(() => reject(new Error('Writing is still saving. Wait for it to finish, then try again.')), 30000);
        });
        await Promise.race([
            Promise.all([...buffers].map(async buffer => {
                do { await buffer.flush(); } while (buffer.dirty || buffer.pending);
            })), password, bounded
        ]);
        await restart();
    } finally {
        clearTimeout(timeout);
        passwordWaiters.delete(rejectPassword);
        inputEvents.forEach(type => document?.removeEventListener(type, blockInput, true));
        if (root) root.inert = !!wasInert;
        restarting = false;
    }
};

if (typeof window !== 'undefined') window.addEventListener('innerly-session-ended', clearEditorSaves);
