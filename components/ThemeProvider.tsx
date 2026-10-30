'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark';
const KEY = 'pulse-theme'; // the only thing Pulse keeps in localStorage

const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'light', toggle: () => {} });

/** Runs before paint (inline in <head>) so the saved theme never flashes. */
export const themeScript = `(function(){var d=document.documentElement;d.classList.add('js');try{var t=localStorage.getItem('${KEY}');if(t==='light'||t==='dark')d.setAttribute('data-theme',t)}catch(e){}})();`;

function resolve(): Theme {
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'light' || attr === 'dark') return attr;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    setTheme(resolve());
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setTheme(resolve());
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  const toggle = useCallback(() => {
    const next: Theme = resolve() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(KEY, next);
    } catch {}
    setTheme(next);
  }, []);

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
