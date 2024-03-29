import React from "react";
import { Route, Routes } from "react-router-dom";
import { PageLoader } from "./page-loader";
import { LoginPage } from "./login-page";
import { SignUpPage } from "./sign-up-page";
import { HomePage } from "./home-page";
import { AuthenticationGuard } from "./AuthenticationGuard";
import { WritePage } from "./write-page";

export const App = () => {
  const { isLoading } = false; // TODO custom auth... verify token if exists?

  if (isLoading) {
    return (
      <div className="page-layout">
        <PageLoader />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignUpPage />} />
      <Route path="/" element={<AuthenticationGuard component={HomePage} />} />
      <Route path="/write" element={<AuthenticationGuard component={WritePage} />} />
    </Routes>
  );
};
