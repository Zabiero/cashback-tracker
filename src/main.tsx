import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { DexieRepository } from './data/dexieRepository';
import './styles.css';

const repo = new DexieRepository();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App repo={repo} />
  </StrictMode>,
);
