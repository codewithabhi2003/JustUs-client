import React from 'react';
import { Phone, Video } from 'lucide-react';
import Avatar from '../common/Avatar';
import { formatLastSeen } from '../../utils/formatTime';

const ChatHeader = ({ otherUser, onVoiceCall, onVideoCall }) => {
  if (!otherUser) return null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 20px', height: 64, flexShrink: 0,
      background: 'var(--bg-surface)',
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <Avatar user={otherUser} size={42} />
        <div>
          <div style={{ fontWeight:700, fontSize:15, color:'var(--text-primary)' }}>
            {otherUser.displayName}
          </div>
          <div style={{ fontSize:12, marginTop:1 }}>
            {otherUser.status?.isOnline ? (
              <span style={{ color:'var(--accent-green)', fontWeight:500 }}>● Online</span>
            ) : (
              <span style={{ color:'var(--text-muted)' }}>
                Last seen {formatLastSeen(otherUser.status?.lastSeen)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={{ display:'flex', gap:8 }}>
        <button onClick={onVoiceCall} title="Voice call" style={{ background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:10, color:'var(--accent-green)', width:38, height:38, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', transition:'background 150ms' }}>
          <Phone size={17} />
        </button>
        <button onClick={onVideoCall} title="Video call" style={{ background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:10, color:'var(--accent)', width:38, height:38, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', transition:'background 150ms' }}>
          <Video size={17} />
        </button>
      </div>
    </div>
  );
};

export default ChatHeader;
