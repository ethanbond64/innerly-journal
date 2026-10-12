import React from 'react';
import { isDesktop } from './desktop.js';
import { Navigate } from './router.jsx';
import { getToken, getUserData } from './utils.jsx';

export const AuthenticationGuard = ({ component }) => {
    const Component = withAuthenticationRequired(component);
    return <Component />;
  };

const withAuthenticationRequired = (Component, options) => {
  return props => {
    const isAuthenticated = !!getUserData() && (isDesktop() || !!getToken());

    if (!isAuthenticated) {
      if (options && options.onRedirecting) {
        return options.onRedirecting();
      }
      return <Navigate to="/login" />;
    }

    return <Component {...props} />;
  };
};