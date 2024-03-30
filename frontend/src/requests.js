import axios from "axios"

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

export const fetchEntries = async (search, offset, limit, onError = (e) => {}) => {
    return await axios.get(`http://localhost:8000/api/fetch/entries?search=${search}&limit=${limit}&offset=${offset}`, {
        headers: getHeaders()
    }).then((response) => {
        return response.data.data;
    }).catch((error) => {
        console.error(error);
        if (error.response && error.response.status === 401) {
            window.location.href = '/login'; // TODO use react-router-dom
        } else {
            onError(error);
        }
    });
}