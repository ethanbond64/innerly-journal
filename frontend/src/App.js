import React from "react";
import { Route, Routes } from "react-router-dom";
import { PageLoader } from "./page-loader";
import { LoginPage } from "./login-page";
import { SignUpPage } from "./sign-up-page";
import { HomePage } from "./home-page";
import { AuthenticationGuard } from "./AuthenticationGuard";
import { WritePage } from "./write-page";
import { homeRoute, loginRoute, settingsRoute, signupRoute, viewRoute, writeRoute } from "./constants";
import { ViewPage } from "./view-page";
import { SettingsPage } from "./settings-page";

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
      <Route path={loginRoute} element={<LoginPage />} />
      <Route path={signupRoute} element={<SignUpPage />} />
      <Route path={homeRoute} element={<AuthenticationGuard component={HomePage} />} />
      <Route path={writeRoute} element={<AuthenticationGuard component={WritePage} />} />
      <Route path={viewRoute+":entryId"} element={<AuthenticationGuard component={ViewPage} />} />
      <Route path={settingsRoute} element={<AuthenticationGuard component={SettingsPage} />} />
    </Routes>
  );
};
