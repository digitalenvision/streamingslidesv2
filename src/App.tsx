import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { FullScreenSpinner } from '@/components/ui';
import { Player } from '@/player/Player';

const Admin = lazy(() => import('./admin'));

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* TV player. /preview/:id is the address already set up on the club's computer. */}
        <Route path="/preview/:id" element={<Player />} />
        <Route path="/play/:id" element={<Player />} />

        <Route path="/*" element={<Suspense fallback={<FullScreenSpinner />}><Admin /></Suspense>} />
      </Routes>
    </BrowserRouter>
  );
}
