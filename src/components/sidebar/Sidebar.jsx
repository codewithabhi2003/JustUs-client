import React, { useState, useEffect } from 'react';
import { Search, MessageCircle } from 'lucide-react';
import { useChatStore }    from '../../store/chatStore';
import { useAuthStore }    from '../../store/authStore';
import { userAPI, conversationAPI } from '../../services/api';
import Avatar              from '../common/Avatar';
import { formatConversationTime } from '../../utils/formatTime';

const ConversationItem = ({ conv, isActive, onClick, currentUserId }) => {
  const other  = conv.participants?.find(p => p._id !== currentUserId) || conv.participants?.[0];
  const unread = conv.unreadCount?.[currentUserId] || 0;
  const lastMsg = conv.lastMessage;
  const preview = lastMsg?.isDeleted ? 'Message deleted'
    : lastMsg?.type !== 'text' ? `📎 ${lastMsg?.type || 'media'}`
    : lastMsg?.content || '';

  return (
    <div
      onClick={onClick}
      style={{
        display:'flex', alignItems:'center', gap:12,
        padding:'12px 16px', cursor:'pointer',
        background: isActive ? 'var(--accent-soft)' : 'transparent',
        borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
        transition:'background 150ms',
        WebkitTapHighlightColor:'transparent',
      }}
    >
      <Avatar user={other} size={46}/>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontWeight:600, fontSize:14, color:'var(--text-primary)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'65%' }}>
            {other?.displayName || 'Unknown'}
          </span>
          <span style={{ fontSize:11, color:'var(--text-muted)', flexShrink:0, fontFamily:'JetBrains Mono,monospace' }}>
            {conv.lastActivity ? formatConversationTime(conv.lastActivity) : ''}
          </span>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:3 }}>
          <span style={{ fontSize:13, color:'var(--text-secondary)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'80%' }}>
            {preview}
          </span>
          {unread > 0 && (
            <span style={{ background:'var(--accent)', color:'#fff', borderRadius:99, fontSize:11, fontWeight:700, padding:'1px 7px', flexShrink:0 }}>
              {unread}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

const Sidebar = ({ onSelectConversation, activeConversationId, isOpen, onClose }) => {
  const { user }          = useAuthStore();
  const { conversations } = useChatStore();
  const [query,    setQuery]    = useState('');
  const [results,  setResults]  = useState([]);
  const [searching,setSearching]= useState(false);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try { const { data } = await userAPI.search(query); setResults(data); } catch {}
      setSearching(false);
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const openConversation = async (userId) => {
    setQuery(''); setResults([]);
    const { data } = await conversationAPI.getOrCreate(userId);
    onSelectConversation(data);
    onClose?.(); // close sidebar on mobile after selecting
  };

  const handleSelectConv = (conv) => {
    onSelectConversation(conv);
    onClose?.(); // close sidebar on mobile
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:199 }}
          className="mobile-menu-btn"
        />
      )}

      <div
        className={`sidebar-panel${isOpen ? ' open' : ''}`}
        style={{
          width:300, flexShrink:0,
          borderRight:'1px solid var(--border)',
          background:'var(--bg-surface)',
          display:'flex', flexDirection:'column',
          height:'100%',
        }}
      >
        {/* Search */}
        <div style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ position:'relative' }}>
            <Search size={15} style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)' }}/>
            <input
              className="input-base"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search users…"
              style={{ paddingLeft:36, borderRadius:10 }}
            />
          </div>
        </div>

        {/* Search results */}
        {query && (
          <div style={{ borderBottom:'1px solid var(--border)', maxHeight:220, overflowY:'auto' }}>
            {searching && <p style={{ color:'var(--text-muted)', fontSize:13, padding:'12px 16px' }}>Searching…</p>}
            {!searching && results.length === 0 && (
              <p style={{ color:'var(--text-muted)', fontSize:13, padding:'12px 16px' }}>No users found</p>
            )}
            {results.map(u => (
              <div key={u._id} onClick={() => openConversation(u._id)}
                style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 16px', cursor:'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background='var(--bg-elevated)'}
                onMouseLeave={e => e.currentTarget.style.background='transparent'}
              >
                <Avatar user={u} size={36}/>
                <div>
                  <div style={{ fontWeight:600, fontSize:14, color:'var(--text-primary)' }}>{u.displayName}</div>
                  <div style={{ fontSize:12, color:'var(--text-muted)' }}>@{u.username}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Conversations */}
        <div className="scroll-area" style={{ flex:1 }}>
          {conversations.length === 0 && !query && (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:12, padding:24 }}>
              <MessageCircle size={36} style={{ color:'var(--text-muted)', opacity:0.4 }}/>
              <p style={{ color:'var(--text-muted)', fontSize:14, textAlign:'center', lineHeight:1.6 }}>
                No conversations yet.<br/>Search for someone 💕
              </p>
            </div>
          )}
          {conversations.map(conv => (
            <ConversationItem
              key={conv._id}
              conv={conv}
              isActive={activeConversationId === conv._id}
              onClick={() => handleSelectConv(conv)}
              currentUserId={user?._id}
            />
          ))}
        </div>
      </div>
    </>
  );
};

export default Sidebar;