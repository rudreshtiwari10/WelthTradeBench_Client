import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';

// Time synchronization is now driven by live WebSocket ticks (syncTimeWithTick
// in dataService.ts). No HTTP prefetch needed at startup.

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
