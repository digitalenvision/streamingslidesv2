import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, RequireStaff } from '@/lib/auth';
import { ToastProvider } from '@/components/ui';
import { AppShell } from '@/components/AppShell';
import { Login } from '@/pages/Login';
import { Overview } from '@/pages/Overview';
import { Albums } from '@/pages/Albums';
import { AlbumEditor } from '@/pages/AlbumEditor';
import { Promos } from '@/pages/Promos';
import { Screens } from '@/pages/Screens';
import { ScreenDetail } from '@/pages/ScreenDetail';
import { Visitors } from '@/pages/Visitors';

// Everything behind the login. Loaded on demand so the TV player stays small.
export default function Admin() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<RequireStaff><AppShell /></RequireStaff>}>
            <Route index element={<Overview />} />
            <Route path="albums" element={<Albums />} />
            <Route path="albums/:id" element={<AlbumEditor />} />
            <Route path="promos" element={<Promos />} />
            <Route path="screens" element={<Screens />} />
            <Route path="screens/:id" element={<ScreenDetail />} />
            <Route path="visitors" element={<Visitors />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
