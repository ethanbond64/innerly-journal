// Detect if running in Electron
const isElectron = () => {
  return window.navigator.userAgent.toLowerCase().includes('electron');
};

// Determine API base URL
const getApiBaseUrl = () => {
  // If running in Electron, always use localhost:8000
  if (isElectron()) {
    return 'http://localhost:8000';
  }

  // If environment variable is set, use it
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }

  // In development with proxy, use empty string for relative URLs
  if (process.env.NODE_ENV === 'development') {
    return '';
  }

  // Default to same origin for web deployments
  return window.location.origin;
};

export const API_BASE_URL = getApiBaseUrl();
export const IS_ELECTRON = isElectron();

console.log('Environment:', IS_ELECTRON ? 'Electron' : 'Web Browser');
console.log('API Base URL:', API_BASE_URL || '(relative URLs)');
