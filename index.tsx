import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// Initialize PDF.js locally to avoid Tracking Prevention issues
import './utils/pdfLoader';
// Import Tailwind CSS
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Hide the initial skeleton once React starts mounting
const hideSkeleton = () => {
  const skeleton = document.getElementById('initial-skeleton');
  if (skeleton) {
    skeleton.style.display = 'none';
  }
  rootElement.classList.add('loaded');
};

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Hide skeleton immediately after first render starts
hideSkeleton();