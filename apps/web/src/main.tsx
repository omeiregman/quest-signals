import './styles/fonts';
import './styles/theme.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { BankrollProvider } from './components/BankrollContext';
import { queryClient } from './lib/query';
import { ThemeProvider } from './theme/ThemeProvider';

const root = document.getElementById('root');
if (!root) throw new Error('Quest: #root element not found');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BankrollProvider>
          <App />
        </BankrollProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
