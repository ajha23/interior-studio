import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './app/index.css';
import { bootstrapPersistence } from './infrastructure/persistence/persistenceFactory';

// Explicit composition root initialization (Feature 034.2.2 FR-01)
bootstrapPersistence();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
