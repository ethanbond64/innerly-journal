import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { getToken, getUserData } from './utils';

export const AuthenticationGuard = ({ component }) => {
    const Component = withAuthenticationRequired(component);
    return <Component />;
  };

const withAuthenticationRequired = (Component, options) => {
  return props => {
    const [isAuthenticated, setIsAuthenticated] = useState(!!getToken());

    useEffect(() => {
      setIsAuthenticated(!!getToken() && !!getUserData());
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