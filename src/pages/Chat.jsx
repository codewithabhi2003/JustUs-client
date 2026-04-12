import React, { useEffect, useCallback, useRef, useState } from 'react';
import { useNavigate }       from 'react-router-dom';
import { ArrowLeft }         from 'lucide-react';
import { useAuthStore }      from '../store/authStore';
import { useChatStore }      from '../store/chatStore';
import { useCallStore }      from '../store/callStore';
import { useSocket, getSocket } from '../hooks/useSocket';
import { useWebRTC }         from '../hooks/useWebRTC';
import { conversationAPI }   from '../services/api';
import Navbar                from '../components/common/Navbar';
import Sidebar               from '../components/sidebar/Sidebar';
import ChatHeader            from '../components/chat/ChatHeader';
import MessageList           from '../components/chat/MessageList';
import TypingIndicator       from '../components/chat/TypingIndicator';
import InputBar              from '../components/chat/InputBar';
import { IncomingCall, CallModal } from '../components/call/CallComponents';
import { Heart } from 'lucide-react';

const Chat = () => {
  const { user, token }    = useAuthStore();
  const { conversations, setConversations, activeConversationId, setActiveConversation, typingUsers } = useChatStore();
  const callStore          = useCallStore();
  const navigate           = useNavigate();
  const { emit, setActiveConvRef } = useSocket();

  const [replyTo,     setReplyTo]     = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Incoming call data (offer + caller info) stored in ref — not state
  // so it doesn't trigger re-renders during sensitive WebRTC setup
  const incomingRef = useRef(null);

  // Active conversation
  const activeConv = conversations.find(c => c._id === activeConversationId);
  const otherUser  = activeConv?.participants?.find(p => p._id !== user?._id);

  const webRTC = useWebRTC();

  useEffect(() => { if (!token) navigate('/auth'); }, [token]);

  // ── Load conversations ─────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try { const { data } = await conversationAPI.getAll(); setConversations(data); } catch {}
    };
    load();
    const onInvite = () => load();
    window.addEventListener('invite-accepted', onInvite);
    return () => window.removeEventListener('invite-accepted', onInvite);
  }, [user]);

  useEffect(() => { setActiveConvRef(activeConversationId); }, [activeConversationId]);

  // ── Wire ALL call + WebRTC socket events (single place, no duplicates) ─
  useEffect(() => {
    if (!token) return;

    // Wait for socket to be ready, then attach handlers once
    let socket = null;
    let attempts = 0;
    const attach = () => {
      socket = getSocket();
      if (!socket?.connected) {
        if (++attempts < 30) { setTimeout(attach, 300); }
        return;
      }

      // Remove any stale listeners first
      socket.off('call:incoming');
      socket.off('call:accepted');
      socket.off('call:rejected');
      socket.off('call:ended');
      socket.off('webrtc:ice');

      // ── Incoming call (receiver sees this) ──────────────────────────
      socket.on('call:incoming', ({ from, callType, offer }) => {
        console.log('[Call] incoming from', from.displayName, 'type:', callType);
        incomingRef.current = { from, callType, offer };
        callStore.setRemoteUser(from);
        callStore.setCallType(callType);
        callStore.setCallState('ringing');
      });

      // ── Caller: receiver accepted, got their WebRTC answer ──────────
      socket.on('call:accepted', ({ answer }) => {
        console.log('[Call] accepted — setting remote answer');
        webRTC.handleAnswer(answer);
      });

      // ── Caller: receiver rejected ───────────────────────────────────
      socket.on('call:rejected', () => {
        console.log('[Call] rejected');
        webRTC.endCall(false);  // stop media without re-emitting
        callStore.resetCall();
      });

      // ── Either side: other person hung up ───────────────────────────
      socket.on('call:ended', () => {
        console.log('[Call] remote ended call');
        webRTC.endCall(false);  // stop media without re-emitting
        callStore.setCallState('ended');
        setTimeout(() => callStore.resetCall(), 2000);
      });

      // ── ICE candidates ───────────────────────────────────────────────
      socket.on('webrtc:ice', ({ candidate }) => {
        webRTC.handleIce(candidate);
      });
    };

    attach();

    return () => {
      // Clean up listeners on unmount
      const s = getSocket();
      if (s) {
        s.off('call:incoming');
        s.off('call:accepted');
        s.off('call:rejected');
        s.off('call:ended');
        s.off('webrtc:ice');
      }
    };
  }, [token]); // only re-attach if token changes (login/logout)

  // ── Conversation selection ─────────────────────────────────────────
  const handleSelectConversation = useCallback((conv) => {
    setActiveConversation(conv._id);
    setReplyTo(null);
    const exists = useChatStore.getState().conversations.find(c => c._id === conv._id);
    if (!exists) setConversations([conv, ...useChatStore.getState().conversations]);
  }, []);

  // ── Start call (caller side) ───────────────────────────────────────
  const handleVoiceCall = () => {
    if (!otherUser) return;
    callStore.setRemoteUser(otherUser);
    webRTC.startCall(otherUser._id, 'audio');
  };

  const handleVideoCall = () => {
    if (!otherUser) return;
    callStore.setRemoteUser(otherUser);
    webRTC.startCall(otherUser._id, 'video');
  };

  // ── Accept incoming call (callee side) ─────────────────────────────
  const handleAnswerCall = () => {
    const { from, callType, offer } = incomingRef.current || {};
    if (!from || !offer) {
      console.error('[Answer] Missing call data', incomingRef.current);
      return;
    }
    console.log('[Call] answering', callType, 'call from', from.displayName);
    webRTC.answerCall(from._id, callType, offer);
  };

  // ── Reject incoming call ───────────────────────────────────────────
  const handleRejectCall = () => {
    const { from } = incomingRef.current || {};
    if (from) getSocket()?.emit('call:reject', { targetUserId: from._id });
    incomingRef.current = null;
    callStore.resetCall();
  };

  const isTyping = typingUsers[activeConversationId];

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100dvh', background:'var(--bg-base)', overflow:'hidden' }}>
      <Navbar onMenuToggle={() => setSidebarOpen(o => !o)} showMenu={sidebarOpen}/>

      <div style={{ display:'flex', flex:1, overflow:'hidden', position:'relative' }}>
        <Sidebar
          onSelectConversation={handleSelectConversation}
          activeConversationId={activeConversationId}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <div className="chat-panel" style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>
          {activeConv && otherUser ? (
            <>
              <div style={{ display:'flex', alignItems:'center', background:'var(--bg-surface)', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
                <button className="mobile-back-btn" onClick={() => setActiveConversation(null)}
                  style={{ background:'none', border:'none', color:'var(--text-secondary)', cursor:'pointer', padding:'0 4px 0 12px', height:64, display:'flex', alignItems:'center' }}>
                  <ArrowLeft size={20}/>
                </button>
                <div style={{ flex:1 }}>
                  <ChatHeader otherUser={otherUser} onVoiceCall={handleVoiceCall} onVideoCall={handleVideoCall} noBorder/>
                </div>
              </div>
              <MessageList conversationId={activeConversationId} otherUser={otherUser} onReply={setReplyTo}/>
              <TypingIndicator isTyping={isTyping} displayName={otherUser?.displayName}/>
              <InputBar conversationId={activeConversationId} emit={emit} replyTo={replyTo} onCancelReply={() => setReplyTo(null)}/>
            </>
          ) : (
            <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16, padding:40 }}>
              <div style={{ position:'relative' }}>
                <div style={{ width:90, height:90, borderRadius:'50%', background:'var(--accent-soft)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:40 }}>💕</div>
                <div style={{ position:'absolute', bottom:0, right:0, width:28, height:28, background:'var(--accent)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Heart size={14} color="#fff"/>
                </div>
              </div>
              <h2 style={{ color:'var(--text-primary)', fontWeight:700, fontSize:20 }}>JustUs</h2>
              <p style={{ color:'var(--text-secondary)', fontSize:14, textAlign:'center', maxWidth:320, lineHeight:1.7 }}>
                Select a conversation to start chatting 💕
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Call overlays — always mounted */}
      <IncomingCall onAnswer={handleAnswerCall} onReject={handleRejectCall}/>
      <CallModal webRTC={webRTC}/>
    </div>
  );
};

export default Chat;