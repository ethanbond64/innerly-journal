import React, { useState, useEffect } from 'react';
import { Redirect } from 'react-router-dom';

export const withAuthenticationRequired = (component, options) => {
  return props => {
    const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('my-token'));

    useEffect(() => {
      setIsAuthenticated(!!localStorage.getItem('my-token'));
    }, []);

    if (!isAuthenticated) {
      if (options && options.onRedirecting) {
        return options.onRedirecting();
      }
      return <Redirect to="/login" />;
    }

    return <component {...props} />;
  };
};