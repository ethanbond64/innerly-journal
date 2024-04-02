import React from 'react';
import { Navigate } from 'react-router-dom';
import { getToken, getUserData } from './utils.js';

export const AuthenticationGuard = ({ component }) => {
    const Component = withAuthenticationRequired(component);
    return <Component />;
  };

const withAuthenticationRequired = (Component, options) => {
  return props => {
    const isAuthenticated = !!getToken() && !!getUserData();

    if (!isAuthenticated) {
      if (options && options.onRedirecting) {
        return options.onRedirecting();
      }
      return <Navigate to="/login" />;
    }

    return <Component {...props} />;
  };
};