import React, { useState, useRef } from 'react';
import { Paperclip, Send, X, Image } from 'lucide-react';
import { mediaAPI } from '../../services/api';
import { formatFileSize } from '../../utils/formatTime';
import { useTyping }  from '../../hooks/useTyping';

const InputBar = ({ conversationId, emit, replyTo, onCancelReply }) => {
  const [text,     setText]     = useState('');
  const [file,     setFile]     = useState(null);
  const [preview,  setPreview]  = useState(null);
  const [uploading,setUploading]= useState(false);
  const fileRef = useRef(null);
  const { onType, onBlur } = useTyping(emit, conversationId);

  const handleFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    if (f.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => setPreview(reader.result);
      reader.readAsDataURL(f);
    } else {
      setPreview(null);
    }
    e.target.value = '';
  };

  const clearFile = () => { setFile(null); setPreview(null); };

  const send = async () => {
    if (!text.trim() && !file) return;
    onBlur();

    if (file) {
      setUploading(true);
      try {
        const form = new FormData();
        form.append('file', file);
        const { data } = await mediaAPI.upload(form);
        const msgType = file.type.startsWith('image/') ? 'image'
          : file.type.startsWith('video/') ? 'video' : 'file';
        emit('message:send', {
          conversationId,
          type: msgType,
          content: text.trim() || '',
          mediaUrl: data.url,
          mediaPublicId: data.publicId,
          fileName: file.name,
          fileSize: file.size,
          replyTo: replyTo?._id || null,
        });
      } catch {}
      setUploading(false);
      clearFile();
    } else {
      emit('message:send', { conversationId, type: 'text', content: text.trim(), replyTo: replyTo?._id || null });
    }
    setText('');
    onCancelReply?.();
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div style={{ padding:'12px 16px', background:'var(--bg-surface)', borderTop:'1px solid var(--border)', flexShrink:0 }}>
      {/* Reply preview */}
      {replyTo && (
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10, padding:'8px 12px', background:'var(--bg-elevated)', borderRadius:10, borderLeft:'3px solid var(--accent)' }}>
          <div style={{ flex:1, minWidth:0 }}>
            <p style={{ fontSize:11, color:'var(--accent)', fontWeight:600, marginBottom:2 }}>
              Replying to {replyTo.senderId?.displayName}
            </p>
            <p style={{ fontSize:12, color:'var(--text-secondary)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
              {replyTo.isDeleted ? '🚫 Deleted' : replyTo.content || `📎 ${replyTo.type}`}
            </p>
          </div>
          <button onClick={onCancelReply} style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', padding:4, display:'flex', flexShrink:0 }}>
            <X size={15}/>
          </button>
        </div>
      )}
      {/* File preview */}
      {file && (
        <div style={{ marginBottom:10, padding:'10px 14px', background:'var(--bg-elevated)', borderRadius:12, display:'flex', alignItems:'center', gap:12 }}>
          {preview
            ? <img src={preview} alt="preview" style={{ width:56, height:56, borderRadius:8, objectFit:'cover' }} />
            : <div style={{ width:56, height:56, borderRadius:8, background:'var(--bg-card)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24 }}>📄</div>
          }
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{file.name}</div>
            <div style={{ fontSize:12, color:'var(--text-muted)' }}>{formatFileSize(file.size)}</div>
          </div>
          <button onClick={clearFile} style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', padding:4, display:'flex', alignItems:'center' }}>
            <X size={16} />
          </button>
        </div>
      )}

      <div style={{ display:'flex', alignItems:'flex-end', gap:8 }}>
        <input type="file" ref={fileRef} onChange={handleFile} accept="image/*,video/*,.pdf,.doc,.docx,.txt" style={{ display:'none' }} />

        <button
          onClick={() => fileRef.current?.click()}
          title="Attach file"
          style={{ background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:10, color:'var(--text-muted)', width:40, height:40, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0, transition:'color 150ms' }}
          onMouseEnter={e => e.currentTarget.style.color='var(--accent)'}
          onMouseLeave={e => e.currentTarget.style.color='var(--text-muted)'}
        >
          <Paperclip size={18} />
        </button>

        <textarea
          value={text}
          onChange={e => { setText(e.target.value); onType(); }}
          onKeyDown={handleKey}
          onBlur={onBlur}
          placeholder="Message… 💕"
          rows={1}
          style={{
            flex: 1, resize: 'none',
            background: 'var(--bg-input)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: '10px 14px',
            color: 'var(--text-primary)',
            fontSize: 14, fontFamily: 'Inter, sans-serif',
            outline: 'none',
            maxHeight: 120, overflowY: 'auto',
            lineHeight: 1.5,
            transition: 'border-color 180ms',
          }}
          onFocus={e => e.target.style.borderColor = 'var(--accent)'}
          onBlurCapture={e => e.target.style.borderColor = 'var(--border)'}
        />

        <button
          onClick={send}
          disabled={uploading || (!text.trim() && !file)}
          style={{
            background: (text.trim() || file) && !uploading ? 'var(--accent)' : 'var(--bg-elevated)',
            border: 'none', borderRadius: 12,
            color: (text.trim() || file) && !uploading ? '#fff' : 'var(--text-muted)',
            width: 42, height: 42,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: (text.trim() || file) && !uploading ? 'pointer' : 'default',
            flexShrink: 0,
            transition: 'background 180ms, box-shadow 180ms',
            boxShadow: (text.trim() || file) && !uploading ? 'var(--shadow-glow)' : 'none',
          }}
        >
          {uploading ? <div style={{ width:18, height:18, border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 700ms linear infinite' }} /> : <Send size={17} />}
        </button>
      </div>
    </div>
  );
};

export default InputBar;