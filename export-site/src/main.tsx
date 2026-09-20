import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import StaticRoomApp from '@/export/StaticRoomApp';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StaticRoomApp />
  </StrictMode>,
);
