import React, { useState } from 'react';
import { useNavigate }      from 'react-router-dom';
import { Link2, LogOut, Menu, X } from 'lucide-react';
import { useAuthStore }     from '../../store/authStore';
import { authAPI, inviteAPI } from '../../services/api';
import { ThemeToggle, Modal } from './UI';
import Avatar from './Avatar';

const Navbar = ({ onMenuToggle, showMenu }) => {
  const { user, clearAuth }   = useAuthStore();
  const navigate              = useNavigate();
  const [inviteModal, setInviteModal] = useState(false);
  const [inviteUrl,   setInviteUrl]   = useState('');
  const [copied,      setCopied]      = useState(false);

  const handleLogout = async () => {
    try { await authAPI.logout(); } catch {}
    clearAuth(); navigate('/auth');
  };

  const generateInvite = async () => {
    setInviteModal(true);
    if (!inviteUrl) {
      const { data } = await inviteAPI.generate();
      setInviteUrl(data.url);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'0 16px', height:56,
        background:'var(--bg-surface)',
        borderBottom:'1px solid var(--border)',
        flexShrink:0, position:'relative', zIndex:100,
      }}>
        {/* Left: hamburger (mobile) + logo */}
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <button
            className="mobile-menu-btn"
            onClick={onMenuToggle}
            style={{ background:'none', border:'none', color:'var(--text-secondary)', cursor:'pointer', padding:6, borderRadius:8, display:'flex', alignItems:'center' }}
          >
            {showMenu ? <X size={20}/> : <Menu size={20}/>}
          </button>
          <span style={{ fontSize:20 }}>💕</span>
          <span className="navbar-title" style={{ fontWeight:800, fontSize:18, color:'var(--accent)', letterSpacing:'-0.5px' }}>JustUs</span>
        </div>

        {/* Right: actions */}
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <button onClick={generateInvite} title="Invite" style={{ background:'var(--accent-soft)', border:'1px solid var(--border-strong)', borderRadius:10, color:'var(--accent)', width:34, height:34, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
            <Link2 size={15}/>
          </button>
          <ThemeToggle/>
          <button onClick={() => navigate('/profile')} title="Profile" style={{ background:'none', border:'none', cursor:'pointer', padding:0 }}>
            <Avatar user={user} size={32} showOnline={false}/>
          </button>
          <button onClick={handleLogout} title="Logout" style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', display:'flex', alignItems:'center', padding:6, borderRadius:8 }}>
            <LogOut size={15}/>
          </button>
        </div>
      </div>

      <Modal isOpen={inviteModal} onClose={() => setInviteModal(false)} title="💕 Invite Someone">
        <p style={{ color:'var(--text-secondary)', fontSize:14, marginBottom:16, lineHeight:1.6 }}>
          Share this link — it expires in 7 days.
        </p>
        <div style={{ display:'flex', gap:8 }}>
          <input className="input-base" readOnly value={inviteUrl || 'Generating…'} style={{ flex:1, fontSize:12, fontFamily:'JetBrains Mono,monospace' }}/>
          <button className="btn-primary" onClick={copyLink} style={{ flexShrink:0, padding:'10px 14px' }}>
            {copied ? '✓' : 'Copy'}
          </button>
        </div>
      </Modal>
    </>
  );
};

export default Navbar;