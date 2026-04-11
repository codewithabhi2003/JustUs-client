import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useChatStore }  from '../../store/chatStore';
import { useAuthStore }  from '../../store/authStore';
import { messageAPI }    from '../../services/api';
import { getSocket }     from '../../hooks/useSocket';
import MessageBubble     from './MessageBubble';
import { formatDateSeparator } from '../../utils/formatTime';

const DateSeparator = ({ date }) => (
  <div className="date-separator">
    <span>💕 {formatDateSeparator(date)}</span>
  </div>
);

const MessageList = ({ conversationId, otherUser, onReply }) => {
  const { messages, setMessages, prependMessages, updateMessage, removeMessage } = useChatStore();
  const { user } = useAuthStore();
  const bottomRef  = useRef(null);
  const topRef     = useRef(null);
  const [loading,  setLoading]  = useState(false);
  const [hasMore,  setHasMore]  = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);

  const msgs = messages[conversationId] || [];

  // Initial load
  useEffect(() => {
    if (!conversationId) return;
    setInitialLoad(true);
    setHasMore(true);
    const load = async () => {
      try {
        const { data } = await messageAPI.getHistory(conversationId, { limit: 30 });
        setMessages(conversationId, data);
        if (data.length < 30) setHasMore(false);
      } catch {}
      setInitialLoad(false);
    };
    load();
  }, [conversationId]);

  // Scroll to bottom on new messages / initial load
  useEffect(() => {
    if (initialLoad) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs.length, initialLoad]);

  // First scroll (no animation)
  useEffect(() => {
    if (!initialLoad) bottomRef.current?.scrollIntoView();
  }, [initialLoad]);

  // Mark as read when conversation opens
  useEffect(() => {
    if (!conversationId) return;
    getSocket()?.emit('messages:read', { conversationId });
  }, [conversationId]);

  // Load older messages on scroll to top
  const handleScroll = useCallback(async (e) => {
    if (e.target.scrollTop > 60 || loading || !hasMore || msgs.length === 0) return;
    setLoading(true);
    const oldest = msgs[0]?._id;
    try {
      const { data } = await messageAPI.getHistory(conversationId, { before: oldest, limit: 30 });
      if (data.length > 0) prependMessages(conversationId, data);
      if (data.length < 30) setHasMore(false);
    } catch {}
    setLoading(false);
  }, [conversationId, loading, hasMore, msgs]);

  // Edit handler
  const handleEdit = (messageId, newContent) => {
    getSocket()?.emit('message:edit', { messageId, newContent });
  };

  // Delete handler
  const handleDelete = (messageId, deleteFor) => {
    getSocket()?.emit('message:delete', { messageId, deleteFor });
  };

  // Group messages with date separators
  const grouped = [];
  let lastDate = null;
  msgs.forEach(msg => {
    const d = new Date(msg.createdAt).toDateString();
    if (d !== lastDate) { grouped.push({ type:'separator', date: msg.createdAt, key:`sep-${msg._id}` }); lastDate = d; }
    grouped.push({ type:'message', msg, key: msg._id });
  });

  if (initialLoad) {
    return (
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg-base)' }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:32, marginBottom:8 }}>💕</div>
          <p style={{ color:'var(--text-muted)', fontSize:14 }}>Loading messages…</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="scroll-area"
      onScroll={handleScroll}
      style={{ flex:1, overflowY:'auto', padding:'12px 20px', background:'var(--bg-base)', display:'flex', flexDirection:'column' }}
    >
      {loading && <p style={{ textAlign:'center', color:'var(--text-muted)', fontSize:13, padding:'8px 0' }}>Loading older messages…</p>}
      {!hasMore && msgs.length > 0 && (
        <p style={{ textAlign:'center', color:'var(--text-muted)', fontSize:12, padding:'8px 0' }}>💕 Beginning of conversation</p>
      )}

      {msgs.length === 0 && (
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12 }}>
          <div style={{ fontSize:48 }}>💕</div>
          <p style={{ color:'var(--text-muted)', fontSize:14, textAlign:'center', lineHeight:1.6 }}>
            Say hi to {otherUser?.displayName}!<br/>This is the beginning of your conversation.
          </p>
        </div>
      )}

      {grouped.map(item =>
        item.type === 'separator'
          ? <DateSeparator key={item.key} date={item.date} />
          : (
            <MessageBubble
              key={item.key}
              message={item.msg}
              isOwn={(item.msg.senderId?._id || item.msg.senderId) === user?._id}
              myId={user?._id}
              otherUserId={otherUser?._id}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onReply={onReply}
            />
          )
      )}
      <div ref={bottomRef} />
    </div>
  );
};

export default MessageList;