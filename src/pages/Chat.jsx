import React, { useEffect, useCallback, useRef } from 'react';
import { useNavigate }       from 'react-router-dom';
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
  const { user, token }         = useAuthStore();
  const { conversations, setConversations, activeConversationId, setActiveConversation, typingUsers } = useChatStore();
  const callStore               = useCallStore();
  const { callState, remoteUser, callType } = callStore;
  const navigate                = useNavigate();
  const { emit, setActiveConvRef } = useSocket();
  const [replyTo, setReplyTo]   = React.useState(null);

  // Store incoming call data (offer + caller info)
  const incomingCallRef = useRef(null);

  // Active conversation
  const activeConv = conversations.find(c => c._id === activeConversationId);
  const otherUser  = activeConv?.participants?.find(p => p._id !== user?._id);

  // WebRTC hook (no target — target passed per-call)
  const webRTC = useWebRTC();

  // Redirect if not logged in
  useEffect(() => { if (!token) navigate('/auth'); }, [token]);

  // Load conversations
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const { data } = await conversationAPI.getAll();
        setConversations(data);
      } catch {}
    };
    load();
    const handler = () => load();
    window.addEventListener('invite-accepted', handler);
    return () => window.removeEventListener('invite-accepted', handler);
  }, [user]);

  // Track active conversation ref for notifications
  useEffect(() => {
    setActiveConvRef(activeConversationId);
  }, [activeConversationId]);

  // ── Wire up ALL call socket events here ─────────────────────────────
  useEffect(() => {
    if (!token) return;

    // Poll for socket until it connects
    const interval = setInterval(() => {
      const socket = getSocket();
      if (!socket) return;
      clearInterval(interval);

      // ── Incoming call (receiver side) ──
      socket.on('call:incoming', ({ from, callType, offer, conversationId }) => {
        incomingCallRef.current = { from, callType, offer, conversationId };
        callStore.setRemoteUser(from);
        callStore.setCallType(callType);
        callStore.setCallState('ringing');
      });

      // ── Caller: receiver accepted, got their answer ──
      socket.on('call:accepted', ({ from, answer }) => {
        webRTC.handleAnswer(answer);
        // callState moves to 'connecting' → 'active' via onconnectionstatechange
      });

      // ── Caller: receiver rejected ──
      socket.on('call:rejected', () => {
        webRTC.endCall(false); // don't re-emit end
        callStore.resetCall();
      });

      // ── Either side: other person ended the call ──
      socket.on('call:ended', () => {
        webRTC.endCall(false); // stop media, don't re-emit
        callStore.setCallState('ended');
        setTimeout(() => callStore.resetCall(), 2000);
      });

      // ── ICE candidates ──
      socket.on('webrtc:ice', ({ candidate }) => {
        webRTC.handleIce(candidate);
      });
    }, 200);

    return () => clearInterval(interval);
  }, [token]);

  // ── Conversation selection ───────────────────────────────────────────
  const handleSelectConversation = useCallback((conv) => {
    setActiveConversation(conv._id);
    const exists = useChatStore.getState().conversations.find(c => c._id === conv._id);
    if (!exists) setConversations([conv, ...useChatStore.getState().conversations]);
  }, []);

  // ── Start calls ──────────────────────────────────────────────────────
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

  // ── Answer incoming call ─────────────────────────────────────────────
  const handleAnswerCall = () => {
    const { from, callType, offer } = incomingCallRef.current || {};
    if (!from || !offer) return;
    webRTC.answerCall(from._id, callType, offer);
  };

  // ── Reject incoming call ─────────────────────────────────────────────
  const handleRejectCall = () => {
    const { from } = incomingCallRef.current || {};
    if (from) getSocket()?.emit('call:reject', { targetUserId: from._id });
    incomingCallRef.current = null;
    callStore.resetCall();
  };

  // ── End active/outgoing call (button) ────────────────────────────────
  const handleEndCall = () => {
    webRTC.endCall(true); // stops media + notifies other side
  };

  const isTyping = typingUsers[activeConversationId];

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:'var(--bg-base)', overflow:'hidden' }}>
      <Navbar />

      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
        <Sidebar
          onSelectConversation={handleSelectConversation}
          activeConversationId={activeConversationId}
        />

        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          {activeConv && otherUser ? (
            <>
              <ChatHeader
                otherUser={otherUser}
                onVoiceCall={handleVoiceCall}
                onVideoCall={handleVideoCall}
              />
              <MessageList
                conversationId={activeConversationId}
                otherUser={otherUser}
                onReply={(msg) => setReplyTo(msg)}
              />
              <TypingIndicator isTyping={isTyping} displayName={otherUser?.displayName} />
              <InputBar
                conversationId={activeConversationId}
                emit={emit}
                replyTo={replyTo}
                onCancelReply={() => setReplyTo(null)}
              />
            </>
          ) : (
            <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16, padding:40 }}>
              <div style={{ position:'relative' }}>
                <div style={{ width:100, height:100, borderRadius:'50%', background:'var(--accent-soft)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:44 }}>
                  💕
                </div>
                <div style={{ position:'absolute', bottom:0, right:0, width:32, height:32, background:'var(--accent)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Heart size={16} color="#fff" />
                </div>
              </div>
              <h2 style={{ color:'var(--text-primary)', fontWeight:700, fontSize:22 }}>JustUs</h2>
              <p style={{ color:'var(--text-secondary)', fontSize:15, textAlign:'center', maxWidth:360, lineHeight:1.7 }}>
                Select a conversation from the sidebar or start chatting 💕
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Call overlays */}
      <IncomingCall onAnswer={handleAnswerCall} onReject={handleRejectCall} />
      <CallModal webRTC={{ ...webRTC, endCall: handleEndCall }} />
    </div>
  );
};

export default Chat;