import { clearLocalStorage, getToken } from "./utils.jsx";
import { loginRoute } from "./constants.js";

const getAuthorizationHeader = () => {
    let token = getToken();

    if (!token || token.length === 0) {
        window.location.href = loginRoute;
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
    clearLocalStorage();
    window.location.href = loginRoute;
};

const handleResponse = async (response) => {
    const data = await response.json();
    if (!response.ok) {
        const error = new Error(data.message || response.statusText);
        error.response = { status: response.status, data };
        throw error;
    }
    return { status: response.status, data };
};

export const updatePassword = async (oldPassword, newPassword, callback, onError) => {
    fetch('http://localhost:8000/api/update_password', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ current_password: oldPassword, new_password: newPassword })
    }).then(handleResponse).then((response) => {
        callback();
    }).catch((error) => {
        if (error.response && error.response.data && error.response.data.message) {
            onError(error.response.data.message);
        } else {
            onError("Unable to update password.");
        }
    });
};

export const updateUser = async (userId, data, callback, onError = (e) => {}) => {
    fetch(`http://localhost:8000/api/update/users/${userId}`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data)
    }).then(handleResponse).then((response) => {
        callback(response.data.data);
    }).catch((error) => {
        console.error(error);
        onError(error);
    });
};

export const fetchEntries = async (search, offset, limit, onError = (e) => {}) => {
    return await fetch(`http://localhost:8000/api/fetch/entries?search=${search}&limit=${limit}&offset=${offset}`, {
        headers: getHeaders()
    }).then(handleResponse).then((response) => {
        return response.data.data;
    }).catch((error) => {
        console.error(error);
        if (error.response && error.response.status === 401) {
            handleUnauthorized();
        } else {
            onError(error);
        }
    });
};

export const insertTextEntry = async (text, functional_datetime, callback, onError = (e) => {}) => {
    fetch('http://localhost:8000/api/insert/entries', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
            entry_type: 'text',
            entry_data: { text },
            functional_datetime
        })
    }).then(handleResponse).then((response) => {
        if (response.status === 201) {
            callback(response.data.data);
        }
    }).catch((error) => {
        console.error(error);
        if (error.response && error.response.status === 401) {
            handleUnauthorized();
        } else {
            onError(error);
        }
    });
};

export const updateTextEntry = async (id, entry_data, tags, callback, onError = (e) => {}) => {
    fetch(`http://localhost:8000/api/update/entries/${id}`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ entry_data, tags })
    }).then(handleResponse).then((response) => {
        if (response.status === 200) {
            callback(response.data.data);
        }
    }).catch((error) => {
        console.error(error);
        if (error.response && error.response.status === 401) {
            handleUnauthorized();
        } else {
            onError(error);
        }
    });
};

export const insertLinkEntry = async (link, callback, functional_datetime = null, onError = (e) => {}) => {
    fetch('http://localhost:8000/api/insert/entries', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
            entry_type: 'link',
            entry_data: { link },
            functional_datetime
        })
    }).then(handleResponse).then((response) => {
        if (response.status === 201) {
            callback(response.data.data);
        }
    }).catch((error) => {
        console.error(error);
        if (error.response && error.response.status === 401) {
            handleUnauthorized();
        } else {
            onError(error);
        }
    });
};

export const insertFileEntry = async (file, callback, functional_datetime = null, onError = (e) => {}) => {

    let formData = new FormData();
    formData.append('file', file);
    formData.append('entry_type', 'file');
    if (functional_datetime) {
        formData.append('functional_datetime', functional_datetime);
    }

    fetch('http://localhost:8000/api/insert/entries', {
        method: 'POST',
        headers: {
            'Authorization': getAuthorizationHeader()
        },
        body: formData
    }).then(handleResponse).then((response) => {
        if (response.status === 201) {
            callback(response.data.data);
        }
    }).catch((error) => {
        console.error(error);
        if (error.response && error.response.status === 401) {
            handleUnauthorized();
        } else {
            onError(error);
        }
    });
}


export const fetchEntry = async (id, callback, onError = (e) => {}) => {
    return await fetch(`http://localhost:8000/api/fetch/entries/${id}`, {
        headers: getHeaders()
    }).then(handleResponse).then((response) => {
        callback(response.data.data);
    }).catch((error) => {
        console.error(error);
        onError(error);
    });
};

export const fetchLockedEntry = async (id, password, callback, onError = (e) => {}) => {
    return await fetch(`http://localhost:8000/api/fetch/entries/${id}`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ password })
    }).then(handleResponse).then((response) => {
        callback(response.data.data);
    }).catch((error) => {
        console.error(error);
        onError(error);
    });
};

export const deleteEntry = async (id, callback, onError = (e) => {}) => {
    return await fetch(`http://localhost:8000/api/delete/entries/${id}`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({})
    }).then(handleResponse).then((response) => {
        callback(response.data.success);
    }).catch((error) => {
        console.error(error);
        onError(error);
    });
};

export const lockEntry = async (id, password, callback, onError = (e) => {}) => {
    return await fetch(`http://localhost:8000/api/lock/entries/${id}`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ password })
    }).then(handleResponse).then((response) => {
        callback(response.data.data);
    }).catch((error) => {
        console.error(error);
        onError(error);
    });
};

export const unlockEntry = async (id, password, callback, onError = (e) => {}) => {
    return await fetch(`http://localhost:8000/api/unlock/entries/${id}`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ password })
    }).then(handleResponse).then((response) => {
        callback(response.data.data);
    }).catch((error) => {
        console.error(error);
        onError(error);
    });
};

export const importEntries = async (file, callback, onError = (e) => {}) => {
    let formData = new FormData();
    formData.append('file', file);

    fetch('http://localhost:8000/api/import', {
        method: 'POST',
        headers: getHeaders("multipart/form-data"),
        body: formData
    }).then(handleResponse).then((response) => {
        callback(response.data);
    }).catch((error) => {
        console.error(error);
        if (error.response && error.response.status === 401) {
            handleUnauthorized();
        } else {
            onError(error.response?.data?.message || "Import failed.");
        }
    });
};

export const getImportStatus = async (callback, onError = (e) => {}) => {
    return await fetch('http://localhost:8000/api/import/status', {
        headers: getHeaders()
    }).then(handleResponse).then((response) => {
        callback(response.data);
    }).catch((error) => {
        if (error.response && error.response.status === 404) {
            callback(null);
        } else {
            console.error(error);
            onError(error);
        }
    });
};
