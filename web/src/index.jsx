import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Remove loading indicator once React is ready
document.body.classList.add('app-loaded');

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
