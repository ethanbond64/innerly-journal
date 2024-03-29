import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';

export const AuthenticationGuard = ({ component }) => {
    const Component = withAuthenticationRequired(component);
    return <Component />;
  };

const withAuthenticationRequired = (Component, options) => {
  return props => {
    const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('innerly-token'));

    useEffect(() => {
      setIsAuthenticated(!!localStorage.getItem('innerly-token') && !!localStorage.getItem('user'));
    }, []);

    if (!isAuthenticated) {
      if (options && options.onRedirecting) {
        return options.onRedirecting();
      }
      return <Navigate to="/login" />;
    }

    return <Component {...props} />;
  };
};