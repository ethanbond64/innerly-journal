// A just-saved entry, handed from the write page to the view page so it renders without a
// refetch. Module scope, not history state: locked entries travel in the clear here, and
// history state is written to disk and replayed on back/forward.
let pending = null;

export const putEntry = (entry) => {
    pending = entry;
};

// One shot: any later arrival at the same entry, back button included, refetches.
export const takeEntry = (id) => {
    const entry = pending && String(pending.id) === String(id) ? pending : null;
    pending = null;
    return entry;
};
