import React from "react";
import { Route, Routes } from "react-router-dom";
import { PageLoader } from "./page-loader";
// import { AuthenticationGuard } from "./components/authentication-guard";
// import { CallbackPage } from "./pages/callback-page";
// import { LandingPage } from "./pages/landing-page";
// import { NotFoundPage } from "./pages/not-found-page";

// import { TermsPage } from "./pages/terms-page";
// import { PrivacyPage } from "./pages/privacy-page";
// import { LicensePage } from "./pages/license-page";
// import { PricingPage } from "./pages/pricing-page";
// import { DashboardPage } from "./pages/dashboard-page";
// import { SettingsPage } from "./pages/settings-page";
// import { DocsPage } from "./pages/docs-page";
// import OrganizationPage from "./pages/organization-page";
// import ShareScenarioPage from "./pages/share-scenario-page";
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

      {/* <Route
        path="/"
        element={<AuthenticationGuard component={DashboardPage} />}
      />

      <Route
        path="/settings"
        element={<AuthenticationGuard component={SettingsPage} />}
      />

      <Route
        path="/organization"
        element={<AuthenticationGuard component={OrganizationPage} />}
      />

      <Route
        path="/share*"
        element={<AuthenticationGuard component={ShareScenarioPage} />}
      />

      <Route
        path="/docs"
        element={<DocsPage />}
      />
      
      <Route
        path="/pricing"
        element={<PricingPage />}
      />

      <Route
        path="/terms"
        element={<TermsPage />}
      />
      <Route
        path="/privacy"
        element={<PrivacyPage />}
      />
      <Route
        path="/license"
        element={<LicensePage />}
      />

      <Route path="/callback" element={<CallbackPage />} />
      <Route path="*" element={<NotFoundPage />} /> */}
    </Routes>
  );
};
