// Writing must reach the journal before an update restart replaces the app. The
// editor registers a flush for its draft; leaving the editor flushes it and the
// promise is retained here, so writing that outlived its route still counts.
let flushDraft = null;
let lastFlush = null;

export const trackDraft = (flush) => {
    flushDraft = flush;
    lastFlush = null;
    return () => {
        if (flushDraft === flush) flushDraft = null;
        lastFlush = flush();
        lastFlush.catch(() => {}); // reported by flushWriting, not as an unhandled rejection
    };
};

// Rejects if writing is unsaved, still saving, or waiting on a lock password.
export const flushWriting = async () => {
    const saved = flushDraft ? flushDraft() : lastFlush;
    if (!saved) return;
    let timer;
    try {
        await Promise.race([saved, new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('Writing is still saving. Wait for it to finish, then try again.')), 10000);
        })]);
    } finally {
        clearTimeout(timer);
    }
};
