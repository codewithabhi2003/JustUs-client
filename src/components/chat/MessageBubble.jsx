import React, { useState, useRef, useEffect } from 'react';
import { Check, CheckCheck, Pencil, Trash2, X, Reply, Download } from 'lucide-react';
import { formatMessageTime, formatFileSize } from '../../utils/formatTime';

// ── Read receipt ──────────────────────────────────────────────────────────
const ReadReceipt = ({ message, myId, otherUserId }) => {
  const senderId = message.senderId?._id || message.senderId;
  if (senderId?.toString() !== myId?.toString()) return null;
  if (message.isDeleted) return null;
  const isRead = message.readBy?.some(id => id?.toString() === otherUserId?.toString());
  return isRead
    ? <CheckCheck size={13} style={{ color: 'rgba(255,255,255,0.9)', flexShrink: 0 }} />
    : <Check size={13} style={{ color: 'rgba(255,255,255,0.5)', flexShrink: 0 }} />;
};

// ── Emoji reactions bar ───────────────────────────────────────────────────
const EMOJIS = ['❤️', '😂', '😮', '👍'];

const MessageBubble = ({ message, isOwn, myId, otherUserId, onEdit, onDelete, onReply, onReact }) => {
  const [popover,  setPopover]  = useState(false);
  const [editing,  setEditing]  = useState(false);
  const [editText, setEditText] = useState(message.content);
  const [lightbox, setLightbox] = useState(false);
  const [reactions, setReactions] = useState(message.reactions || {});
  const popRef = useRef(null);
  const bubbleRef = useRef(null);

  // Close popover on outside click
  useEffect(() => {
    if (!popover) return;
    const handler = (e) => {
      if (popRef.current && !popRef.current.contains(e.target) &&
          bubbleRef.current && !bubbleRef.current.contains(e.target)) {
        setPopover(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [popover]);

  const saveEdit = () => {
    if (editText.trim() && editText !== message.content) onEdit(message._id, editText.trim());
    setEditing(false);
    setPopover(false);
  };

  const handleReact = (emoji) => {
    setReactions(prev => {
      const updated = { ...prev };
      if (updated[emoji] === myId) { delete updated[emoji]; }
      else { updated[emoji] = myId; }
      return updated;
    });
    onReact?.(message._id, emoji);
    setPopover(false);
  };

  const reactionEntries = Object.entries(reactions);

  if (message.isDeleted) {
    return (
      <div style={{ display:'flex', justifyContent: isOwn ? 'flex-end' : 'flex-start', marginBottom:6 }}>
        <span style={{ fontSize:13, color:'var(--text-muted)', fontStyle:'italic', padding:'7px 14px', background:'var(--bg-elevated)', borderRadius:12, border:'1px solid var(--border)' }}>
          🚫 This message was deleted
        </span>
      </div>
    );
  }

  return (
    <>
      {/* Reply preview above bubble */}
      {message.replyTo && (
        <div style={{ display:'flex', justifyContent: isOwn ? 'flex-end' : 'flex-start', marginBottom:2 }}>
          <div style={{ maxWidth:'60%', padding:'5px 10px', background:'var(--bg-elevated)', borderRadius:8, borderLeft:'3px solid var(--accent)', opacity:0.75 }}>
            <p style={{ fontSize:11, color:'var(--accent)', fontWeight:600, marginBottom:2 }}>
              {message.replyTo.senderId?.displayName || 'Reply'}
            </p>
            <p style={{ fontSize:12, color:'var(--text-secondary)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:200 }}>
              {message.replyTo.isDeleted ? '🚫 Deleted' : message.replyTo.content || `📎 ${message.replyTo.type}`}
            </p>
          </div>
        </div>
      )}

      <div style={{ display:'flex', flexDirection:'column', alignItems: isOwn ? 'flex-end' : 'flex-start', marginBottom: reactionEntries.length ? 2 : 6 }}>

        {/* Row: reply btn (for other) + bubble + reply btn (for own) */}
        <div style={{ display:'flex', alignItems:'flex-end', gap:6, maxWidth:'72%' }}>

          {/* Quick reply button — left side for received messages */}
          {!isOwn && (
            <button
              onClick={() => { onReply?.(message); }}
              title="Reply"
              style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', padding:4, opacity:0, transition:'opacity 150ms', flexShrink:0 }}
              onMouseEnter={e => e.currentTarget.style.opacity='1'}
              onMouseLeave={e => e.currentTarget.style.opacity='0'}
              className="reply-btn"
            >
              <Reply size={16}/>
            </button>
          )}

          {/* Bubble */}
          <div
            ref={bubbleRef}
            onClick={() => !editing && setPopover(p => !p)}
            style={{
              flex: 1,
              padding: message.type === 'image' ? 4 : '9px 14px',
              borderRadius: isOwn ? '18px 4px 18px 18px' : '4px 18px 18px 18px',
              backgroundImage: isOwn ? 'var(--bubble-me)' : undefined,
              background: isOwn ? undefined : 'var(--bubble-them)',
              color: isOwn ? '#fff' : 'var(--text-primary)',
              boxShadow: isOwn ? 'var(--shadow-glow)' : 'var(--shadow-sm)',
              wordBreak: 'break-word',
              cursor: 'pointer',
              position: 'relative',
              userSelect: 'none',
              transition: 'filter 100ms',
            }}
            onMouseEnter={e => e.currentTarget.style.filter='brightness(1.08)'}
            onMouseLeave={e => e.currentTarget.style.filter='brightness(1)'}
          >
            {/* Image */}
            {message.type === 'image' && message.mediaUrl && (
              <div style={{ position:'relative', display:'inline-block' }}>
                <img
                  src={message.mediaUrl}
                  alt="media"
                  onClick={(e) => { e.stopPropagation(); setLightbox(true); }}
                  style={{ maxWidth:260, maxHeight:200, borderRadius:14, display:'block', cursor:'zoom-in', objectFit:'cover' }}
                />
                {/* Download overlay button */}
                <a
                  href={message.mediaUrl}
                  download
                  target="_blank"
                  rel="noreferrer"
                  onClick={e => e.stopPropagation()}
                  title="Download image"
                  style={{
                    position:'absolute', bottom:8, right:8,
                    width:30, height:30, borderRadius:8,
                    background:'rgba(0,0,0,0.55)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    color:'#fff', textDecoration:'none',
                    backdropFilter:'blur(4px)',
                    transition:'background 150ms',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background='rgba(0,0,0,0.8)'}
                  onMouseLeave={e => e.currentTarget.style.background='rgba(0,0,0,0.55)'}
                >
                  <Download size={14}/>
                </a>
              </div>
            )}

            {/* Video */}
            {message.type === 'video' && message.mediaUrl && (
              <div style={{ position:'relative', borderRadius:14, overflow:'hidden', maxWidth:280 }}>
                <video
                  src={message.mediaUrl}
                  controls
                  onClick={e => e.stopPropagation()}
                  style={{ maxWidth:'100%', maxHeight:200, borderRadius:14, display:'block', background:'#000' }}
                />
                <a
                  href={message.mediaUrl}
                  download
                  target="_blank"
                  rel="noreferrer"
                  onClick={e => e.stopPropagation()}
                  title="Download video"
                  style={{
                    position:'absolute', top:8, right:8,
                    width:30, height:30, borderRadius:8,
                    background:'rgba(0,0,0,0.6)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    color:'#fff', textDecoration:'none',
                    backdropFilter:'blur(4px)',
                  }}
                >
                  <Download size={14}/>
                </a>
              </div>
            )}

            {/* File */}
            {message.type === 'file' && (
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'4px 0' }}>
                <div style={{ width:38, height:38, borderRadius:10, background:'rgba(255,255,255,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>📄</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{message.fileName}</div>
                  <div style={{ fontSize:11, opacity:0.7 }}>{formatFileSize(message.fileSize)}</div>
                </div>
                <a href={message.mediaUrl} download={message.fileName} target="_blank" rel="noreferrer"
                  onClick={e => e.stopPropagation()}
                  style={{ color: isOwn ? '#fff' : 'var(--accent)', opacity:0.8, display:'flex' }}>
                  <Download size={16}/>
                </a>
              </div>
            )}

            {/* Text / Editing */}
            {editing ? (
              <div style={{ minWidth: 200 }}>
                <input autoFocus value={editText} onChange={e => setEditText(e.target.value)}
                  onKeyDown={e => { if(e.key==='Enter') saveEdit(); if(e.key==='Escape') { setEditing(false); setPopover(false); } }}
                  onClick={e => e.stopPropagation()}
                  style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:8, padding:'6px 10px', color:'inherit', width:'100%', fontSize:14, outline:'none' }}
                />
                <div style={{ display:'flex', gap:8, marginTop:6 }}>
                  <button onClick={(e) => { e.stopPropagation(); saveEdit(); }} style={{ background:'rgba(255,255,255,0.2)', border:'none', borderRadius:6, padding:'3px 12px', color:'inherit', cursor:'pointer', fontSize:12 }}>Save</button>
                  <button onClick={(e) => { e.stopPropagation(); setEditing(false); setPopover(false); }} style={{ background:'none', border:'none', color:'inherit', opacity:0.7, cursor:'pointer', fontSize:12 }}>Cancel</button>
                </div>
              </div>
            ) : (
              message.type === 'text' && message.content && (
                <p style={{ fontSize:14, lineHeight:1.55, margin:0 }}>{message.content}</p>
              )
            )}

            {/* Footer */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:4, marginTop:4 }}>
              {message.isEdited && <span style={{ fontSize:10, opacity:0.55, fontStyle:'italic' }}>edited</span>}
              <span style={{ fontSize:10, opacity:0.55, fontFamily:'JetBrains Mono, monospace' }}>
                {formatMessageTime(message.createdAt)}
              </span>
              <ReadReceipt message={message} myId={myId} otherUserId={otherUserId}/>
            </div>
          </div>

          {/* Quick reply button — right side for sent messages */}
          {isOwn && (
            <button
              onClick={() => onReply?.(message)}
              title="Reply"
              style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', padding:4, opacity:0, transition:'opacity 150ms', flexShrink:0 }}
              onMouseEnter={e => e.currentTarget.style.opacity='1'}
              onMouseLeave={e => e.currentTarget.style.opacity='0'}
            >
              <Reply size={16}/>
            </button>
          )}
        </div>

        {/* Emoji reactions display */}
        {reactionEntries.length > 0 && (
          <div style={{ display:'flex', gap:4, marginTop:4, flexWrap:'wrap', justifyContent: isOwn ? 'flex-end' : 'flex-start' }}>
            {reactionEntries.map(([emoji]) => (
              <span key={emoji} onClick={() => handleReact(emoji)}
                style={{ fontSize:16, background:'var(--bg-elevated)', border:'1px solid var(--border-strong)', borderRadius:99, padding:'2px 8px', cursor:'pointer', userSelect:'none' }}>
                {emoji}
              </span>
            ))}
          </div>
        )}

        {/* ── POPOVER MENU ── */}
        {popover && !editing && (
          <div ref={popRef} className="fade-in" style={{
            marginTop: 6,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-strong)',
            borderRadius: 16,
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            boxShadow: 'var(--shadow-md)',
            zIndex: 100,
            minWidth: 180,
          }}>
            {/* Emoji reactions */}
            <div style={{ display:'flex', justifyContent:'space-around', padding:'6px 4px 10px', borderBottom:'1px solid var(--border)' }}>
              {EMOJIS.map(emoji => (
                <button key={emoji} onClick={() => handleReact(emoji)}
                  style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', borderRadius:8, padding:'4px 8px', transition:'transform 150ms', lineHeight:1 }}
                  onMouseEnter={e => e.currentTarget.style.transform='scale(1.3)'}
                  onMouseLeave={e => e.currentTarget.style.transform='scale(1)'}>
                  {emoji}
                </button>
              ))}
            </div>

            {/* Reply */}
            <button onClick={() => { onReply?.(message); setPopover(false); }}
              style={{ display:'flex', alignItems:'center', gap:10, background:'none', border:'none', color:'var(--text-primary)', cursor:'pointer', padding:'8px 10px', borderRadius:10, fontSize:14, width:'100%', textAlign:'left' }}
              onMouseEnter={e => e.currentTarget.style.background='var(--bg-card)'}
              onMouseLeave={e => e.currentTarget.style.background='none'}>
              <Reply size={15} style={{ color:'var(--accent)' }}/> Reply
            </button>

            {/* Edit — own messages only */}
            {isOwn && message.type === 'text' && (
              <button onClick={() => { setEditing(true); setPopover(false); }}
                style={{ display:'flex', alignItems:'center', gap:10, background:'none', border:'none', color:'var(--text-primary)', cursor:'pointer', padding:'8px 10px', borderRadius:10, fontSize:14, width:'100%', textAlign:'left' }}
                onMouseEnter={e => e.currentTarget.style.background='var(--bg-card)'}
                onMouseLeave={e => e.currentTarget.style.background='none'}>
                <Pencil size={15} style={{ color:'var(--accent-yellow)' }}/> Edit
              </button>
            )}

            {/* Delete for me */}
            <button onClick={() => { onDelete(message._id, 'me'); setPopover(false); }}
              style={{ display:'flex', alignItems:'center', gap:10, background:'none', border:'none', color:'var(--text-primary)', cursor:'pointer', padding:'8px 10px', borderRadius:10, fontSize:14, width:'100%', textAlign:'left' }}
              onMouseEnter={e => e.currentTarget.style.background='var(--bg-card)'}
              onMouseLeave={e => e.currentTarget.style.background='none'}>
              <Trash2 size={15} style={{ color:'var(--accent-red)' }}/> Delete for me
            </button>

            {/* Delete for everyone — own only */}
            {isOwn && (
              <button onClick={() => { onDelete(message._id, 'everyone'); setPopover(false); }}
                style={{ display:'flex', alignItems:'center', gap:10, background:'none', border:'none', color:'var(--accent-red)', cursor:'pointer', padding:'8px 10px', borderRadius:10, fontSize:14, width:'100%', textAlign:'left' }}
                onMouseEnter={e => e.currentTarget.style.background='var(--bg-card)'}
                onMouseLeave={e => e.currentTarget.style.background='none'}>
                <X size={15}/> Delete for everyone
              </button>
            )}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(false)}>
          <div style={{ position:'relative' }} onClick={e => e.stopPropagation()}>
            <img src={message.mediaUrl} alt="full"
              style={{ maxWidth:'92vw', maxHeight:'88vh', borderRadius:16, objectFit:'contain', display:'block' }}
            />
            <div style={{ display:'flex', justifyContent:'center', gap:12, marginTop:14 }}>
              <a
                href={message.mediaUrl}
                download
                target="_blank"
                rel="noreferrer"
                style={{ display:'flex', alignItems:'center', gap:8, background:'var(--accent)', color:'#fff', padding:'10px 22px', borderRadius:12, fontWeight:600, fontSize:14, textDecoration:'none', boxShadow:'var(--shadow-glow)' }}
              >
                <Download size={16}/> Download
              </a>
              <button
                onClick={() => setLightbox(false)}
                style={{ display:'flex', alignItems:'center', gap:8, background:'rgba(255,255,255,0.1)', color:'#fff', padding:'10px 22px', borderRadius:12, fontWeight:600, fontSize:14, border:'none', cursor:'pointer' }}
              >
                <X size={16}/> Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MessageBubble;