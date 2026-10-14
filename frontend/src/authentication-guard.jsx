import React from 'react';
import { Navigate } from './router.jsx';
import { getUserData } from './utils.jsx';

export const AuthenticationGuard = ({ component: Component }) =>
    getUserData() ? <Component /> : <Navigate to="/login" />;
