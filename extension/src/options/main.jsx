import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Options from './Options.jsx';
import '../lib/theme.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Options />
  </StrictMode>
);
