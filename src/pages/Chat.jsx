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
  const { callState, remoteUser, callType } = callStore;
  const navigate           = useNavigate();
  const { emit, setActiveConvRef } = useSocket();
  const [replyTo,    setReplyTo]    = useState(null);
  const [sidebarOpen,setSidebarOpen]= useState(false);
  const incomingCallRef = useRef(null);

  const activeConv = conversations.find(c => c._id === activeConversationId);
  const otherUser  = activeConv?.participants?.find(p => p._id !== user?._id);

  const webRTC = useWebRTC();

  useEffect(() => { if (!token) navigate('/auth'); }, [token]);

  // Load conversations
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try { const { data } = await conversationAPI.getAll(); setConversations(data); } catch {}
    };
    load();
    const handler = () => load();
    window.addEventListener('invite-accepted', handler);
    return () => window.removeEventListener('invite-accepted', handler);
  }, [user]);

  useEffect(() => { setActiveConvRef(activeConversationId); }, [activeConversationId]);

  // Wire call socket events
  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      const socket = getSocket();
      if (!socket) return;
      clearInterval(interval);

      socket.on('call:incoming', ({ from, callType, offer }) => {
        incomingCallRef.current = { from, callType, offer };
        callStore.setRemoteUser(from);
        callStore.setCallType(callType);
        callStore.setCallState('ringing');
      });

      socket.on('call:accepted', ({ answer }) => {
        webRTC.handleAnswer(answer);
      });

      socket.on('call:rejected', () => {
        webRTC.endCall(false);
        callStore.resetCall();
      });

      socket.on('call:ended', () => {
        webRTC.endCall(false);
        callStore.setCallState('ended');
        setTimeout(() => callStore.resetCall(), 2000);
      });

      socket.on('webrtc:ice', ({ candidate }) => {
        webRTC.handleIce(candidate);
      });
    }, 200);
    return () => clearInterval(interval);
  }, [token]);

  const handleSelectConversation = useCallback((conv) => {
    setActiveConversation(conv._id);
    setReplyTo(null);
    const exists = useChatStore.getState().conversations.find(c => c._id === conv._id);
    if (!exists) setConversations([conv, ...useChatStore.getState().conversations]);
  }, []);

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

  const handleAnswerCall = () => {
    const { from, callType, offer } = incomingCallRef.current || {};
    if (!from || !offer) return;
    webRTC.answerCall(from._id, callType, offer);
  };

  const handleRejectCall = () => {
    const { from } = incomingCallRef.current || {};
    if (from) getSocket()?.emit('call:reject', { targetUserId: from._id });
    incomingCallRef.current = null;
    callStore.resetCall();
  };

  const handleEndCall = () => webRTC.endCall(true);
  const isTyping = typingUsers[activeConversationId];

  // On mobile: show chat panel when conversation selected
  const showChat = !!activeConv;

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100dvh', background:'var(--bg-base)', overflow:'hidden' }}>
      <Navbar
        onMenuToggle={() => setSidebarOpen(o => !o)}
        showMenu={sidebarOpen}
      />

      <div style={{ display:'flex', flex:1, overflow:'hidden', position:'relative' }}>
        {/* Sidebar */}
        <Sidebar
          onSelectConversation={handleSelectConversation}
          activeConversationId={activeConversationId}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        {/* Chat area */}
        <div
          className="chat-panel"
          style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}
        >
          {activeConv && otherUser ? (
            <>
              {/* Mobile back button inside header row */}
              <div style={{ display:'flex', alignItems:'center', background:'var(--bg-surface)', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
                <button
                  className="mobile-back-btn"
                  onClick={() => { setActiveConversation(null); setSidebarOpen(false); }}
                  style={{ background:'none', border:'none', color:'var(--text-secondary)', cursor:'pointer', padding:'0 4px 0 12px', height:64, display:'flex', alignItems:'center' }}
                >
                  <ArrowLeft size={20}/>
                </button>
                <div style={{ flex:1 }}>
                  <ChatHeader
                    otherUser={otherUser}
                    onVoiceCall={handleVoiceCall}
                    onVideoCall={handleVideoCall}
                    noBorder
                  />
                </div>
              </div>

              <MessageList
                conversationId={activeConversationId}
                otherUser={otherUser}
                onReply={(msg) => setReplyTo(msg)}
              />
              <TypingIndicator isTyping={isTyping} displayName={otherUser?.displayName}/>
              <InputBar
                conversationId={activeConversationId}
                emit={emit}
                replyTo={replyTo}
                onCancelReply={() => setReplyTo(null)}
              />
            </>
          ) : (
            /* Empty state — desktop only (mobile shows sidebar) */
            <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16, padding:40 }}>
              <div style={{ position:'relative' }}>
                <div style={{ width:90, height:90, borderRadius:'50%', background:'var(--accent-soft)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:40 }}>
                  💕
                </div>
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

      {/* Call overlays */}
      <IncomingCall onAnswer={handleAnswerCall} onReject={handleRejectCall}/>
      <CallModal webRTC={{ ...webRTC, endCall: handleEndCall }}/>
    </div>
  );
};

export default Chat;