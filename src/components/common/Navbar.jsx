import React, { useState } from 'react';
import { useNavigate }      from 'react-router-dom';
import { Search, Link2, User, LogOut } from 'lucide-react';
import { useAuthStore }     from '../../store/authStore';
import { authAPI, inviteAPI } from '../../services/api';
import { ThemeToggle, Modal } from './UI';
import Avatar from './Avatar';

const Navbar = ({ onSearch }) => {
  const { user, clearAuth } = useAuthStore();
  const navigate            = useNavigate();
  const [inviteModal, setInviteModal] = useState(false);
  const [inviteUrl,   setInviteUrl]   = useState('');
  const [copied,      setCopied]      = useState(false);

  const handleLogout = async () => {
    try { await authAPI.logout(); } catch {}
    clearAuth();
    navigate('/auth');
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
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', height: 60,
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:22 }}>💕</span>
          <span style={{ fontWeight:800, fontSize:18, color:'var(--accent)', letterSpacing:'-0.5px' }}>JustUs</span>
        </div>

        {/* Actions */}
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <button onClick={generateInvite} title="Invite someone" style={{ background:'var(--accent-soft)', border:'1px solid var(--border-strong)', borderRadius:10, color:'var(--accent)', width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
            <Link2 size={16} />
          </button>
          <ThemeToggle />
          <button onClick={() => navigate('/profile')} title="Profile" style={{ background:'none', border:'none', cursor:'pointer', padding:0 }}>
            <Avatar user={user} size={34} showOnline={false} />
          </button>
          <button onClick={handleLogout} title="Logout" style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', display:'flex', alignItems:'center', padding:6, borderRadius:8 }}>
            <LogOut size={16} />
          </button>
        </div>
      </div>

      <Modal isOpen={inviteModal} onClose={() => setInviteModal(false)} title="💕 Invite Someone">
        <p style={{ color:'var(--text-secondary)', fontSize:14, marginBottom:16, lineHeight:1.6 }}>
          Share this link with the person you want to connect with. It expires in 7 days.
        </p>
        <div style={{ display:'flex', gap:8 }}>
          <input
            className="input-base"
            readOnly
            value={inviteUrl || 'Generating…'}
            style={{ flex:1, fontSize:12, fontFamily:'JetBrains Mono, monospace' }}
          />
          <button className="btn-primary" onClick={copyLink} style={{ flexShrink:0, padding:'10px 16px' }}>
            {copied ? '✓ Copied!' : 'Copy'}
          </button>
        </div>
      </Modal>
    </>
  );
};

export default Navbar;
