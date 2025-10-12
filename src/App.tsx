import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { AuthPage } from '@/pages/AuthPage';
import { Dashboard } from '@/pages/Dashboard';
import { SlideshowBuilder } from '@/pages/SlideshowBuilder';
import { SlideshowSettings } from '@/pages/SlideshowSettings';
import { StreamEdit } from '@/pages/StreamEdit';
import { StreamSettings } from '@/pages/StreamSettings';
import { SlideshowPreview } from '@/pages/SlideshowPreview';
import { RemoteControl } from '@/pages/RemoteControl';
import { Settings } from '@/pages/Settings';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<AuthPage />} />
          <Route path="/preview/:id" element={<SlideshowPreview />} />

          {/* Protected Routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/builder/:id"
            element={
              <ProtectedRoute>
                <SlideshowBuilder />
              </ProtectedRoute>
            }
          />
          <Route
            path="/builder/:id/settings"
            element={
              <ProtectedRoute>
                <SlideshowSettings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/builder/:id/stream/:streamId/edit"
            element={
              <ProtectedRoute>
                <StreamEdit />
              </ProtectedRoute>
            }
          />
          <Route
            path="/builder/:id/stream/:streamId/settings"
            element={
              <ProtectedRoute>
                <StreamSettings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/remote/:id"
            element={
              <ProtectedRoute>
                <RemoteControl />
              </ProtectedRoute>
            }
          />

          {/* Default Route */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;

