import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import DashboardPage from "./pages/DashboardPage";
import ProjectsListPage from "./pages/ProjectsListPage";
import ProjectCreatePage from "./pages/ProjectCreatePage";
import ProjectDetailPage from "./pages/ProjectDetailPage";
import AIAnalysisPage from "./pages/AIAnalysisPage";
import AlertsPage from "./pages/AlertsPage";
import NotificationsPage from "./pages/NotificationsPage";
import ReportsPage from "./pages/ReportsPage";
import UsersPage from "./pages/UsersPage";
import ProfilePage from "./pages/ProfilePage";

export default function App() {
  return (
    <Routes>
      {/* Public marketing entry point */}
      <Route path="/" element={<LandingPage />} />

      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />

      {/* Authenticated app — everything under /dashboard, /projects, etc. */}
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="projects" element={<ProjectsListPage />} />
        <Route
          path="projects/new"
          element={
            <ProtectedRoute roles={["admin", "project_manager"]}>
              <ProjectCreatePage />
            </ProtectedRoute>
          }
        />
        <Route path="projects/:id" element={<ProjectDetailPage />} />
        <Route
          path="ai-analysis"
          element={
            <ProtectedRoute roles={["admin", "project_manager", "engineer"]}>
              <AIAnalysisPage />
            </ProtectedRoute>
          }
        />
        <Route path="alerts" element={<AlertsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="users" element={<ProtectedRoute roles={["admin"]}><UsersPage /></ProtectedRoute>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
