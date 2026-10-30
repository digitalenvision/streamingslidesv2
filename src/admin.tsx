import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, RequireAdmin, useAuth } from '@/lib/auth';
import { can, type Area } from '@/lib/access';
import { ToastProvider } from '@/components/ui';
import { AppShell } from '@/components/AppShell';
import { Login, Welcome } from '@/pages/Login';
import { Today } from '@/pages/Today';
import { Albums } from '@/pages/Albums';
import { AlbumEditor } from '@/pages/AlbumEditor';
import { Promos } from '@/pages/Promos';
import { Screens } from '@/pages/Screens';
import { ScreenDetail } from '@/pages/ScreenDetail';
import { Visitors } from '@/pages/Visitors';
import { Removals } from '@/pages/Removals';
import { Tasks } from '@/pages/Tasks';
import { Activity } from '@/pages/Activity';
import { Payments } from '@/pages/Payments';
import { Vendors } from '@/pages/Vendors';
import { Schedule } from '@/pages/staff/Schedule';
import { SchedulePrint } from '@/pages/staff/SchedulePrint';
import { People } from '@/pages/staff/People';
import { TimeOff } from '@/pages/staff/TimeOff';
import { ScheduleRules } from '@/pages/settings/ScheduleRules';
import { Accounts } from '@/pages/settings/Accounts';
import { Security } from '@/pages/settings/Security';

/** Pages outside a role's areas send it home (the database refuses the data anyway). */
function Only({ area, children }: { area: Area; children: ReactNode }) {
  const { access: role } = useAuth();
  return can(role, area) ? <>{children}</> : <Navigate to="/" replace />;
}

// Everything behind the login. Loaded on demand so the TV player stays small.
export default function Admin() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/schedule/print" element={<RequireAdmin><Only area="staff"><SchedulePrint /></Only></RequireAdmin>} />
          <Route element={<RequireAdmin><AppShell /></RequireAdmin>}>
            <Route index element={<Today />} />
            <Route path="schedule" element={<Only area="staff"><Schedule /></Only>} />
            <Route path="people" element={<Only area="staff"><People /></Only>} />
            <Route path="time-off" element={<Only area="staff"><TimeOff /></Only>} />
            <Route path="albums" element={<Only area="media"><Albums /></Only>} />
            <Route path="albums/:id" element={<Only area="media"><AlbumEditor /></Only>} />
            <Route path="promos" element={<Only area="media"><Promos /></Only>} />
            <Route path="screens" element={<Only area="media"><Screens /></Only>} />
            <Route path="screens/:id" element={<Only area="media"><ScreenDetail /></Only>} />
            <Route path="visitors" element={<Only area="media"><Visitors /></Only>} />
            <Route path="removals" element={<Only area="media"><Removals /></Only>} />
            <Route path="settings/rules" element={<Only area="rules"><ScheduleRules /></Only>} />
            <Route path="settings/accounts" element={<Only area="accounts"><Accounts /></Only>} />
            <Route path="settings/activity" element={<Only area="activity"><Activity /></Only>} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="payments" element={<Only area="payments"><Payments /></Only>} />
            <Route path="vendors" element={<Only area="accounting"><Vendors /></Only>} />
            <Route path="settings/security" element={<Security />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
