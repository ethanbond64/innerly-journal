import axios from "axios"

const innerlyUser = 'innerly-user';
const innerlyToken = 'innerly-token';

const getAuthorizationHeader = () => {
    let token = localStorage.getItem(innerlyToken);

    if (!token || token.length === 0) {
        window.location.href = '/login'; // TODO use react-router-dom
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
    localStorage.removeItem(innerlyUser);
    localStorage.removeItem(innerlyToken);
    window.location.href = '/login'; // TODO use react-router-dom
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

// export const insertTextEntry = async (text, functional_datetime, onError) = (e) => {}) => {

export const insertLinkEntry = async (link, callback, functional_datetime = null, onError = (e) => {}) => {
    return await axios.post('http://localhost:8000/api/insert/entries', {
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

    return await axios.post('http://localhost:8000/api/insert/entries', formData, {
        headers: {
            'Content-Type': 'form-data',
            'Authorization': getAuthorizationHeader()
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