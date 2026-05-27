import React from "react";
import { Route, Routes } from "react-router-dom";
import { PageLoader } from "./page-loader.jsx";
import { LoginPage } from "./login-page.jsx";
import { SignUpPage } from "./sign-up-page.jsx";
import { HomePage } from "./home-page.jsx";
import { AuthenticationGuard } from "./authentication-guard.jsx";
import { EditPage, WritePage } from "./write-page.jsx";
import { editRoute, homeRoute, loginRoute, settingsRoute, signupRoute, viewRoute, writeRoute } from "./constants.js";
import { ViewPage } from "./view-page.jsx";
import { SettingsPage } from "./settings-page.jsx";

export const App = () => {
  return (
    <Routes>
      <Route path={loginRoute} element={<LoginPage />} />
      <Route path={signupRoute} element={<SignUpPage />} />
      <Route path={homeRoute} element={<AuthenticationGuard component={HomePage} />} />
      <Route path={writeRoute} element={<AuthenticationGuard component={WritePage} />} />
      <Route path={writeRoute+"/:functionalDate"} element={<AuthenticationGuard component={WritePage} />} />
      <Route path={viewRoute+":entryId"} element={<AuthenticationGuard component={ViewPage} />} />
      <Route path={editRoute+":entryId"} element={<AuthenticationGuard component={EditPage} />} />
      <Route path={settingsRoute} element={<AuthenticationGuard component={SettingsPage} />} />
    </Routes>
  );
};
