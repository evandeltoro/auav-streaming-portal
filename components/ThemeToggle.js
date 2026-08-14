'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export default function ThemeToggle() {
  const [theme, setTheme] = useState(null);

  useEffect(() => {
    setTheme(document.documentElement.getAttribute('data-theme') || 'light');
  }, []);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('auav-theme', next);
    } catch {
      // storage unavailable (private browsing, etc.) -- theme just won't persist
    }
  }

  // Avoid rendering the wrong icon for a frame before we know the real theme.
  if (!theme) {
    return <div className="sidebar-link theme-toggle" style={{ visibility: 'hidden' }} />;
  }

  return (
    <button type="button" className="sidebar-link theme-toggle" onClick={toggle}>
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
    </button>
  );
}
