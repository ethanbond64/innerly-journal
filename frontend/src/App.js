import React from "react";
import { Route, Routes } from "react-router-dom";
import { PageLoader } from "./page-loader.js";
import { LoginPage } from "./login-page.js";
import { SignUpPage } from "./sign-up-page.js";
import { HomePage } from "./home-page.js";
import { AuthenticationGuard } from "./authentication-guard.js";
import { EditPage, WritePage } from "./write-page.js";
import { editRoute, homeRoute, loginRoute, settingsRoute, signupRoute, viewRoute, writeRoute } from "./constants.js";
import { ViewPage } from "./view-page.js";
import { SettingsPage } from "./settings-page.js";

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
