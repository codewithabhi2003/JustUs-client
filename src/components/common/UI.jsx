import React, { useState, useEffect } from 'react';
import { Sun, Moon, X } from 'lucide-react';

// ── Theme Toggle ──────────────────────────────────────────────────────────
export const ThemeToggle = () => {
  const [theme, setTheme] = useState(
    () => localStorage.getItem('justus-theme') || 'dark'
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('justus-theme', theme);
  }, [theme]);

  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  return (
    <button
      onClick={toggle}
      title="Toggle theme"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        color: 'var(--text-secondary)',
        width: 36, height: 36,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
        transition: 'background 180ms',
      }}
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
};

// ── Modal ─────────────────────────────────────────────────────────────────
export const Modal = ({ isOpen, onClose, title, children, width = 480 }) => {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'var(--bg-overlay)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="fade-in"
        style={{
          background: 'var(--bg-surface)',
          borderRadius: 18,
          width, maxWidth: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          border: '1px solid var(--border-strong)',
          boxShadow: 'var(--shadow-md), var(--shadow-glow)',
        }}
      >
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'20px 24px', borderBottom:'1px solid var(--border)' }}>
          <h3 style={{ color:'var(--text-primary)', fontWeight:700, fontSize:17 }}>{title}</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', padding:4, borderRadius:8, display:'flex', alignItems:'center' }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ padding:'20px 24px' }}>{children}</div>
      </div>
    </div>
  );
};

// ── Loader ────────────────────────────────────────────────────────────────
export const Loader = ({ size = 32, text = '' }) => (
  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12 }}>
    <div style={{
      width: size, height: size,
      border: `3px solid var(--border-strong)`,
      borderTopColor: 'var(--accent)',
      borderRadius: '50%',
      animation: 'spin 700ms linear infinite',
    }} />
    {text && <p style={{ color:'var(--text-muted)', fontSize:13 }}>{text}</p>}
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);
