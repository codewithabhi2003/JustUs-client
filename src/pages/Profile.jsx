import React, { useState, useRef } from 'react';
import { useNavigate }     from 'react-router-dom';
import { ArrowLeft, Camera, Link2, Copy, Check } from 'lucide-react';
import { useAuthStore }    from '../store/authStore';
import { userAPI, inviteAPI } from '../services/api';
import Avatar              from '../components/common/Avatar';
import { ThemeToggle }     from '../components/common/UI';

const Profile = () => {
  const { user, updateUser, token } = useAuthStore();
  const navigate                    = useNavigate();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [copied,   setCopied]   = useState(false);
  const [genning,  setGenning]  = useState(false);
  const fileRef = useRef(null);

  if (!token) { navigate('/auth'); return null; }

  const saveProfile = async () => {
    setSaving(true); setError('');
    try {
      const { data } = await userAPI.updateProfile({ displayName });
      updateUser({ displayName: data.displayName });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e) { setError(e.response?.data?.message || 'Failed to save'); }
    setSaving(false);
  };

  const changeAvatar = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const form = new FormData();
    form.append('avatar', file);
    try {
      const { data } = await userAPI.uploadAvatar(form);
      updateUser({ avatar: data.avatar });
    } catch {}
    e.target.value = '';
  };

  const generateInvite = async () => {
    setGenning(true);
    try {
      const { data } = await inviteAPI.generate();
      setInviteUrl(data.url);
    } catch {}
    setGenning(false);
  };

  const copyInvite = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg-base)', display:'flex', flexDirection:'column' }}>
      {/* Top bar */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 24px', height:60, background:'var(--bg-surface)', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button onClick={() => navigate('/')} style={{ background:'none', border:'none', color:'var(--text-secondary)', cursor:'pointer', display:'flex', alignItems:'center', padding:6, borderRadius:8 }}>
            <ArrowLeft size={20} />
          </button>
          <span style={{ fontWeight:700, fontSize:17, color:'var(--text-primary)' }}>Profile</span>
        </div>
        <ThemeToggle />
      </div>

      <div style={{ flex:1, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'40px 20px' }}>
        <div style={{ width:'100%', maxWidth:480, display:'flex', flexDirection:'column', gap:20 }}>

          {/* Avatar section */}
          <div style={{ background:'var(--bg-surface)', borderRadius:20, padding:28, border:'1px solid var(--border)', textAlign:'center' }}>
            <div style={{ position:'relative', display:'inline-block', marginBottom:16 }}>
              <Avatar user={user} size={88} showOnline={false} />
              <button onClick={() => fileRef.current?.click()} style={{ position:'absolute', bottom:0, right:0, width:30, height:30, background:'var(--accent)', border:'2px solid var(--bg-surface)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'#fff' }}>
                <Camera size={14} />
              </button>
              <input type="file" ref={fileRef} onChange={changeAvatar} accept="image/*" style={{ display:'none' }} />
            </div>
            <p style={{ fontWeight:700, fontSize:18, color:'var(--text-primary)' }}>{user?.displayName}</p>
            <p style={{ color:'var(--text-muted)', fontSize:13, marginTop:4 }}>@{user?.username}</p>
          </div>

          {/* Edit display name */}
          <div style={{ background:'var(--bg-surface)', borderRadius:20, padding:24, border:'1px solid var(--border)' }}>
            <h3 style={{ color:'var(--text-primary)', fontWeight:700, fontSize:15, marginBottom:16 }}>Edit Profile</h3>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <label style={{ color:'var(--text-secondary)', fontSize:13, fontWeight:500, display:'block', marginBottom:6 }}>Display Name</label>
                <input className="input-base" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your name" />
              </div>
              <div>
                <label style={{ color:'var(--text-secondary)', fontSize:13, fontWeight:500, display:'block', marginBottom:6 }}>Username</label>
                <input className="input-base" value={`@${user?.username}`} readOnly style={{ opacity:0.6, cursor:'not-allowed' }} />
              </div>
              <div>
                <label style={{ color:'var(--text-secondary)', fontSize:13, fontWeight:500, display:'block', marginBottom:6 }}>Email</label>
                <input className="input-base" value={user?.email} readOnly style={{ opacity:0.6, cursor:'not-allowed' }} />
              </div>
              {error && <p style={{ color:'var(--accent-red)', fontSize:13 }}>{error}</p>}
              <button className="btn-primary" onClick={saveProfile} disabled={saving}>
                {saved ? '✓ Saved!' : saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>

          {/* Invite link */}
          <div style={{ background:'var(--bg-surface)', borderRadius:20, padding:24, border:'1px solid var(--border)' }}>
            <h3 style={{ color:'var(--text-primary)', fontWeight:700, fontSize:15, marginBottom:8 }}>💕 Invite Someone</h3>
            <p style={{ color:'var(--text-secondary)', fontSize:13, marginBottom:16, lineHeight:1.6 }}>
              Generate a private invite link and share it with someone you want to connect with.
            </p>
            {!inviteUrl ? (
              <button className="btn-primary" onClick={generateInvite} disabled={genning} style={{ width:'100%' }}>
                <span style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                  <Link2 size={15} /> {genning ? 'Generating…' : 'Generate Invite Link'}
                </span>
              </button>
            ) : (
              <div style={{ display:'flex', gap:8 }}>
                <input className="input-base" readOnly value={inviteUrl} style={{ flex:1, fontSize:12, fontFamily:'JetBrains Mono, monospace' }} />
                <button className="btn-primary" onClick={copyInvite} style={{ flexShrink:0, padding:'10px 14px' }}>
                  {copied ? <Check size={16}/> : <Copy size={16}/>}
                </button>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default Profile;
