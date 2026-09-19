import { clearLocalStorage, getToken } from "./utils.jsx";
import { loginRoute } from "./constants.js";
import { replace } from "./history.js";

const dayLimit = 200;

// The backend caches the key used to lock entries in memory for a short window. Once that window
// lapses, any request needing the key answers 401 with {'lock-auth-expired': true}, which the
// password modal subscribes to so it can prompt for the password again.
const LOCK_AUTH_EXPIRED = 'lock-auth-expired';
const lockAuthSubscribers = new Set();

// Requests that died on a lapsed lock key, waiting for authenticateLock to re-prime the cache.
const pendingLockRetries = [];

export const onLockAuthExpired = (subscriber) => {
    lockAuthSubscribers.add(subscriber);
    return () => lockAuthSubscribers.delete(subscriber);
};

const flushLockRetries = () => pendingLockRetries.splice(0).forEach((retry) => retry());

const getAuthorizationHeader = () => {
    let token = getToken();

    if (!token || token.length === 0) {
        replace(loginRoute);
    }

    return `Bearer ${token}`;
};

const getHeaders = (contentType = "application/json") => {
    return {
        "Authorization": getAuthorizationHeader(),
        "Content-Type": contentType
    };
};

const handleUnauthorized = () => {
    pendingLockRetries.length = 0; // the session is gone, so nothing queued can succeed
    clearLocalStorage();
    replace(loginRoute);
};

const handleResponse = async (response) => {
    const data = await response.json();
    if (!response.ok) {
        const error = new Error(data.message || response.statusText);
        error.response = { status: response.status, data };

        if (response.status === 401 && data && data[LOCK_AUTH_EXPIRED] === true) {
            error.lockAuthExpired = true;
            lockAuthSubscribers.forEach((subscriber) => subscriber());
        }

        throw error;
    }
    return { status: response.status, data };
};

// Every request goes through here. `send` is a thunk so a queued retry re-runs the identical
// request, with headers rebuilt at send time.
//
// A 401 means one of two very different things:
//  - {'lock-auth-expired': true}: the in-memory lock key lapsed. handleResponse has already told
//    the password modal to show itself, so the request is queued and re-sent once the password
//    lands. The returned promise stays pending until then, so callers awaiting a value get it.
//  - anything else: the session itself is gone. Clear it and go to the login page.
// Every other failure is the caller's, via onError.
const apiRequest = (send, {
    onResult = (response) => response.data.data,
    onError = (e) => {},
    retryOnLockAuth = true,
    logoutOn401 = true
} = {}) => {
    return new Promise((resolve) => {
        const attempt = (canRetry) => {
            send().then(handleResponse).then((response) => {
                resolve(onResult(response));
            }).catch((error) => {
                console.error(error);

                if (error.lockAuthExpired) {
                    // One retry only, so a password that never fixes it cannot loop.
                    if (retryOnLockAuth && canRetry) {
                        pendingLockRetries.push(() => attempt(false));
                        return;
                    }
                } else if (error.response && error.response.status === 401 && logoutOn401) {
                    handleUnauthorized();
                    resolve(undefined);
                    return;
                }

                onError(error);
                resolve(undefined);
            });
        };

        attempt(true);
    });
};

// Some screens want the message rather than the error object.
const messageHandler = (onError, fallback) => (error) =>
    onError((error.response && error.response.data && error.response.data.message) || fallback);

// A wrong current password answers 401, which must not be mistaken for a dead session.
export const updatePassword = (oldPassword, newPassword, callback, onError = (m) => {}) =>
    apiRequest(() => fetch('/api/update_password', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ current_password: oldPassword, new_password: newPassword })
    }), {
        onResult: () => callback(),
        onError: messageHandler(onError, "Unable to update password."),
        logoutOn401: false
    });

export const updateUser = (userId, data, callback, onError = (e) => {}) =>
    apiRequest(() => fetch(`/api/update/users/${userId}`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data)
    }), { onResult: (response) => callback(response.data.data), onError });

export const fetchEntries = (search, offset, limit, onError = (e) => {}) =>
    apiRequest(() => fetch(`/api/fetch/entries?search=${search}&limit=${limit}&offset=${offset}`, {
        headers: getHeaders()
    }), { onError });

export const fetchDay = (date, onError = (e) => {}) =>
    apiRequest(() => fetch(`/api/fetch/entries?date=${date}&limit=${dayLimit}&offset=0`, {
        headers: getHeaders()
    }), { onError });

export const fetchMemories = (date, onError = (e) => {}) =>
    apiRequest(() => fetch(`/api/fetch/memories?date=${date}`, {
        headers: getHeaders()
    }), { onResult: (response) => response.data.data.years, onError });

export const fetchActivity = (days, before, onError = (e) => {}) =>
    apiRequest(() => fetch(`/api/fetch/activity?days=${days}&before=${before}`, {
        headers: getHeaders()
    }), { onError });

export const insertTextEntry = (text, functional_datetime, callback, onError = (e) => {}) =>
    apiRequest(() => fetch('/api/insert/entries', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
            entry_type: 'text',
            entry_data: { text },
            functional_datetime
        })
    }), { onResult: (response) => callback(response.data.data), onError });

export const updateTextEntry = (id, entry_data, tags, callback, onError = (e) => {}) =>
    apiRequest(() => fetch(`/api/update/entries/${id}`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ entry_data, tags })
    }), { onResult: (response) => callback(response.data.data), onError });

export const insertLinkEntry = (link, callback, functional_datetime = null, onError = (e) => {}) =>
    apiRequest(() => fetch('/api/insert/entries', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
            entry_type: 'link',
            entry_data: { link },
            functional_datetime
        })
    }), { onResult: (response) => callback(response.data.data), onError });

export const insertFileEntry = (file, callback, functional_datetime = null, onError = (e) => {}) => {

    let formData = new FormData();
    formData.append('file', file);
    formData.append('entry_type', 'file');
    if (functional_datetime) {
        formData.append('functional_datetime', functional_datetime);
    }

    // No Content-Type header: the browser sets the multipart boundary itself.
    return apiRequest(() => fetch('/api/insert/entries', {
        method: 'POST',
        headers: { 'Authorization': getAuthorizationHeader() },
        body: formData
    }), { onResult: (response) => callback(response.data.data), onError });
};

export const fetchEntry = (id, callback, onError = (e) => {}) =>
    apiRequest(() => fetch(`/api/fetch/entries/${id}`, {
        headers: getHeaders()
    }), { onResult: (response) => callback(response.data.data), onError });

// The password here is one the user just typed, so a 401 means they got it wrong (the route
// answers a plain 401, with no lock-auth marker) — not that their session or the cache lapsed.
export const fetchLockedEntry = (id, password, callback, onError = (e) => {}) =>
    apiRequest(() => fetch(`/api/fetch/entries/${id}`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ password })
    }), {
        onResult: (response) => callback(response.data.data),
        onError,
        retryOnLockAuth: false,
        logoutOn401: false
    });

export const deleteEntry = (id, callback, onError = (e) => {}) =>
    apiRequest(() => fetch(`/api/delete/entries/${id}`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({})
    }), { onResult: (response) => callback(response.data.success), onError });

// Safe to retry: the backend locks from its key cache and ignores the password in the body, so
// the re-send succeeds off the freshly primed cache.
export const lockEntry = (id, password, callback, onError = (e) => {}) =>
    apiRequest(() => fetch(`/api/lock/entries/${id}`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ password })
    }), { onResult: (response) => callback(response.data.data), onError });

// Not safe to retry: unlocking derives the key from the password in the body rather than the
// cache, so a re-send would carry the same wrong password and fail identically.
export const unlockEntry = (id, password, callback, onError = (e) => {}) =>
    apiRequest(() => fetch(`/api/unlock/entries/${id}`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ password })
    }), {
        onResult: (response) => callback(response.data.data),
        onError,
        retryOnLockAuth: false
    });

// Re-primes the backend's lock key cache, then releases everything that was waiting on it.
// Hand-rolled: success is the body flag rather than the status, and a wrong password answers with
// the very lock-auth 401 this clears — queueing that would make it retry itself forever.
export const authenticateLock = async (password, callback, onError = (e) => {}) => {
    return await fetch('/api/lock/auth', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ password })
    }).then(handleResponse).then((response) => {
        if (response.status === 200 && response.data[LOCK_AUTH_EXPIRED] === false) {
            callback();
            flushLockRetries();
        } else {
            onError(new Error("Unable to verify password."));
        }
    }).catch((error) => {
        console.error(error);
        onError(error);
    });
};

export const importEntries = (zipPath, passcode, callback, onError = (m) => {}) => {
    const body = { path: zipPath };
    if (passcode) body.passcode = passcode;

    return apiRequest(() => fetch('/api/import', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(body)
    }), {
        onResult: (response) => callback(response.data),
        onError: messageHandler(onError, "Import failed.")
    });
};

export const cancelImport = (callback, onError = (m) => {}) =>
    apiRequest(() => fetch('/api/import', {
        method: 'DELETE',
        headers: getHeaders()
    }), {
        onResult: (response) => callback(response.data),
        onError: messageHandler(onError, "Failed to cancel import.")
    });

export const getImportFiles = (callback, onError = (e) => {}) =>
    apiRequest(() => fetch('/api/import/files', {
        headers: getHeaders()
    }), { onResult: (response) => callback(response.data.files), onError });

// Hand-rolled: a 404 is the expected answer when no import is running, and this is polled, so it
// must stay quiet rather than logging an error on every tick.
export const getImportStatus = async (callback, onError = (e) => {}) => {
    return await fetch('/api/import/status', {
        headers: getHeaders()
    }).then(handleResponse).then((response) => {
        callback(response.data);
    }).catch((error) => {
        if (error.response && error.response.status === 404) {
            callback(null);
            return;
        }
        console.error(error);
        onError(error);
    });
};
