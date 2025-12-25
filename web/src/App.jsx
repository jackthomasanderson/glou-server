import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { lightTheme } from './theme/appTheme';
import { AppConfigProvider } from './context/AppConfigContext';

// Layouts
import { AdaptiveNavigationShell } from './components/AdaptiveNavigationShell';
import { AlphaBanner } from './components/AlphaBanner';

// Screens
import DashboardScreen from './screens/DashboardScreen';
import AlertsScreen from './screens/AlertsScreen';
import DashboardAnalyticsScreen from './screens/DashboardAnalyticsScreen';
import CaveManagementScreen from './screens/CaveManagementScreen';
import WineListScreen from './screens/WineListScreen';
import WineDetailScreen from './screens/WineDetailScreen';
import WineCreateForm from './screens/WineCreateForm';
import WineEditForm from './screens/WineEditForm';
import TastingHistoryScreen from './screens/TastingHistoryScreen';
import AddHub from './screens/AddHub';
import TobaccoAddForm from './screens/TobaccoAddForm';
import AdvancedSettingsScreen from './screens/AdvancedSettingsScreen';

// Create User placeholder screen
const UserProfileScreen = () => <div style={{ padding: '2rem' }}>Profil utilisateur - À implémenter</div>;

/**
 * Main App component with routing
 * Routes:
 * - / -> Dashboard (home)
 * - /dashboard -> Main Dashboard
 * - /analytics -> Analytics Dashboard
 * - /alerts -> Alerts Screen
 * - /admin -> Admin Management
 * - /user -> User Profile
 * - /cave -> Cave Management
 * - /wines -> Wine List
 * - /wines/:id -> Wine Detail
 * - /wines/create -> Create New Wine
 * - /wines/:id/edit -> Edit Wine
 * - /tasting-history -> Tasting History
 */
function App() {
  return (
    <ThemeProvider theme={lightTheme}>
      <CssBaseline />
      <AppConfigProvider>
        <AlphaBanner />
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            {/* Home redirect */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* Add Hub */}
          <Route path="/add" element={
            <AdaptiveNavigationShell>
              <AddHub />
            </AdaptiveNavigationShell>
          } />

          {/* Spec routes */}
          <Route path="/cellars/add" element={
            <AdaptiveNavigationShell>
              <CaveManagementScreen />
            </AdaptiveNavigationShell>
          } />
          <Route path="/bottles/add" element={
            <AdaptiveNavigationShell>
              <WineCreateForm />
            </AdaptiveNavigationShell>
          } />
          <Route path="/tobacco/add" element={
            <AdaptiveNavigationShell>
              <TobaccoAddForm />
            </AdaptiveNavigationShell>
          } />

          {/* Dashboard and Analytics */}
          <Route path="/dashboard" element={
            <AdaptiveNavigationShell>
              <DashboardScreen />
            </AdaptiveNavigationShell>
          } />

          <Route path="/analytics" element={
            <AdaptiveNavigationShell>
              <DashboardAnalyticsScreen />
            </AdaptiveNavigationShell>
          } />

          {/* Alerts */}
          <Route path="/alerts" element={
            <AdaptiveNavigationShell>
              <AlertsScreen />
            </AdaptiveNavigationShell>
          } />

          {/* Admin / Advanced Settings */}
          <Route path="/admin" element={
            <AdaptiveNavigationShell>
              <AdvancedSettingsScreen />
            </AdaptiveNavigationShell>
          } />

          {/* User Profile */}
          <Route path="/user" element={
            <AdaptiveNavigationShell>
              <UserProfileScreen />
            </AdaptiveNavigationShell>
          } />

          {/* Cave Management */}
          <Route path="/cave" element={
            <AdaptiveNavigationShell>
              <CaveManagementScreen />
            </AdaptiveNavigationShell>
          } />

          {/* Wine Management */}
          <Route path="/wines" element={
            <AdaptiveNavigationShell>
              <WineListScreen />
            </AdaptiveNavigationShell>
          } />

          <Route path="/wines/create" element={
            <AdaptiveNavigationShell>
              <WineCreateForm />
            </AdaptiveNavigationShell>
          } />

          <Route path="/wines/:id" element={
            <AdaptiveNavigationShell>
              <WineDetailScreen />
            </AdaptiveNavigationShell>
          } />

          <Route path="/wines/:id/edit" element={
            <AdaptiveNavigationShell>
              <WineEditForm />
            </AdaptiveNavigationShell>
          } />

          {/* Tasting History */}
          <Route path="/tasting-history" element={
            <AdaptiveNavigationShell>
              <TastingHistoryScreen />
            </AdaptiveNavigationShell>
          } />

          {/* 404 - Not Found */}
          <Route path="*" element={
            <div style={{ padding: '2rem', textAlign: 'center' }}>
              <h1>404 - Page non trouvée</h1>
              <p>La page que vous cherchez n'existe pas.</p>
              <a href="/dashboard">Retour au tableau de bord</a>
            </div>
          } />
        </Routes>
      </Router>
      </AppConfigProvider>
    </ThemeProvider>
  );
}

export default App;
