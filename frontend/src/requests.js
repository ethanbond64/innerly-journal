import axios from "axios"
import { clearLocalStorage, getToken } from "./utils.js";
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

export const fetchEntries = async (search, offset, limit, onError = (e) => {}) => {
    return await axios.get(`http://localhost:8000/api/fetch/entries?search=${search}&limit=${limit}&offset=${offset}`, {
        headers: getHeaders()
    }).then((response) => {
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

export const insertTextEntry = async (text, callback, functional_datetime = null, onError = (e) => {}) => {
    axios.post('http://localhost:8000/api/insert/entries', {
        entry_type: 'text',
        entry_data: {
            text: text
        },
        functional_datetime: functional_datetime
    }, {
        headers: getHeaders()
    }).then((response) => {
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

export const insertLinkEntry = async (link, callback, functional_datetime = null, onError = (e) => {}) => {
    axios.post('http://localhost:8000/api/insert/entries', {
        entry_type: 'link',
        entry_data: {
            link: link
        },
        functional_datetime: functional_datetime
    }, { 
        headers: getHeaders()
    }).then((response) => {
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

    axios.post('http://localhost:8000/api/insert/entries', formData, {
        headers: {
            'Content-Type': 'form-data',
            'Authorization': getAuthorizationHeader("multipart/form-data")
        }
    }).then((response) => {
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
    return await axios.get(`http://localhost:8000/api/fetch/entries/${id}`, {
        headers: getHeaders()
    }).then((response) => {
        callback(response.data.data);
    }).catch((error) => {
        console.error(error);
        onError(error);
    });
}

export const deleteEntry = async (id, callback, onError = (e) => {}) => {
    return await axios.post(`http://localhost:8000/api/delete/entries/${id}`, {}, {
        headers: getHeaders()
    }).then((response) => {
        callback(response.data.success);
    }).catch((error) => {
        console.error(error);
        onError(error);
    });
}