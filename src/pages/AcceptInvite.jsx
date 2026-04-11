import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { inviteAPI } from '../services/api';
import { useAuthStore } from '../store/authStore';
import Avatar from '../components/common/Avatar';
import { Loader } from '../components/common/UI';

const AcceptInvite = () => {
  const { token: inviteToken } = useParams();
  const { token: authToken }   = useAuthStore();
  const navigate               = useNavigate();
  const [invite,   setInvite]  = useState(null);
  const [loading,  setLoading] = useState(true);
  const [accepting,setAccepting] = useState(false);
  const [error,    setError]   = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await inviteAPI.getInfo(inviteToken);
        setInvite(data);
      } catch { setError('This invite link is invalid or has expired.'); }
      setLoading(false);
    };
    load();
  }, [inviteToken]);

  const accept = async () => {
    if (!authToken) {
      sessionStorage.setItem('justus-invite-redirect', `/invite/${inviteToken}`);
      navigate('/auth');
      return;
    }
    setAccepting(true);
    try {
      const { data } = await inviteAPI.accept(inviteToken);
      navigate(`/?conv=${data.conversationId}`);
    } catch (e) { setError(e.response?.data?.message || 'Failed to accept invite'); }
    setAccepting(false);
  };

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg-base)' }}>
      <Loader text="Loading invite…" />
    </div>
  );

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg-base)', padding:24 }}>
      <div style={{ width:'100%', maxWidth:420, background:'var(--bg-surface)', borderRadius:24, padding:36, border:'1px solid var(--border-strong)', boxShadow:'var(--shadow-md), var(--shadow-glow)', textAlign:'center' }}>
        <div style={{ fontSize:52, marginBottom:16 }}>💕</div>
        <h1 style={{ color:'var(--text-primary)', fontWeight:800, fontSize:24, marginBottom:8 }}>You're invited!</h1>

        {error ? (
          <p style={{ color:'var(--accent-red)', fontSize:15, marginTop:8 }}>{error}</p>
        ) : invite ? (
          <>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12, margin:'24px 0' }}>
              <Avatar user={invite.createdBy} size={64} showOnline={false} />
              <div>
                <p style={{ fontWeight:700, fontSize:17, color:'var(--text-primary)' }}>{invite.createdBy?.displayName}</p>
                <p style={{ color:'var(--text-muted)', fontSize:13 }}>@{invite.createdBy?.username}</p>
              </div>
            </div>
            <p style={{ color:'var(--text-secondary)', fontSize:14, lineHeight:1.7, marginBottom:28 }}>
              <strong style={{ color:'var(--accent)' }}>{invite.createdBy?.displayName}</strong> wants to connect with you on JustUs. Accept to start chatting! 💕
            </p>
            {invite.isUsed ? (
              <p style={{ color:'var(--text-muted)', fontSize:14 }}>This invite has already been used.</p>
            ) : (
              <button className="btn-primary" onClick={accept} disabled={accepting} style={{ width:'100%', fontSize:16, padding:'13px 0' }}>
                {accepting ? 'Connecting…' : authToken ? '💕 Accept & Connect' : '💕 Sign in to Accept'}
              </button>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
};

export default AcceptInvite;
