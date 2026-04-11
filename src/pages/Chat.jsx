import React, { useEffect, useCallback } from 'react';
import { useNavigate }       from 'react-router-dom';
import { useAuthStore }      from '../store/authStore';
import { useChatStore }      from '../store/chatStore';
import { useCallStore }      from '../store/callStore';
import { useSocket }         from '../hooks/useSocket';
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
  const { callState, remoteUser, callType, incomingOffer, setCallState } = useCallStore();
  const navigate                = useNavigate();
  const { emit, setActiveConvRef } = useSocket();

  // Active conversation object
  const activeConv  = conversations.find(c => c._id === activeConversationId);
  const otherUser   = activeConv?.participants?.find(p => p._id !== user?._id);

  // WebRTC — target is the other person in the active conversation
  const webRTC = useWebRTC(otherUser?._id);

  // Redirect if not logged in
  useEffect(() => { if (!token) navigate('/auth'); }, [token]);

  // Load conversations
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await conversationAPI.getAll();
      setConversations(data);
    };
    load();

    // Re-load when invite accepted
    const handler = () => load();
    window.addEventListener('invite-accepted', handler);
    return () => window.removeEventListener('invite-accepted', handler);
  }, [user]);

  // Track active conversation for socket/notifications
  useEffect(() => {
    setActiveConvRef(activeConversationId);
  }, [activeConversationId]);

  const handleSelectConversation = useCallback((conv) => {
    setActiveConversation(conv._id);
    // Make sure this conversation is in the store
    const exists = useChatStore.getState().conversations.find(c => c._id === conv._id);
    if (!exists) {
      setConversations([conv, ...useChatStore.getState().conversations]);
    }
  }, []);

  // Call handlers
  const handleVoiceCall = () => {
    if (!otherUser) return;
    webRTC.startCall('audio');
    useCallStore.getState().setRemoteUser(otherUser);
    useCallStore.getState().setCallType('audio');
    useCallStore.getState().setCallState('calling');
    emit('call:initiate', { targetUserId: otherUser._id, conversationId: activeConversationId, callType: 'audio' });
  };

  const handleVideoCall = () => {
    if (!otherUser) return;
    webRTC.startCall('video');
    useCallStore.getState().setRemoteUser(otherUser);
    useCallStore.getState().setCallType('video');
    useCallStore.getState().setCallState('calling');
    emit('call:initiate', { targetUserId: otherUser._id, conversationId: activeConversationId, callType: 'video' });
  };

  const handleAnswerCall = () => webRTC.answerCall(callType, incomingOffer);

  const handleRejectCall = () => {
    emit('call:reject', { targetUserId: remoteUser?._id });
    useCallStore.getState().resetCall();
  };

  // Listen for WebRTC events on socket
  useEffect(() => {
    const { socket } = { socket: null }; // handled via getSocket in useWebRTC
    // These are wired in useSocket → useWebRTC via getSocket()
  }, []);

  const isTyping = typingUsers[activeConversationId];
  const [replyTo, setReplyTo] = React.useState(null);

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:'var(--bg-base)', overflow:'hidden' }}>
      <Navbar />

      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
        <Sidebar
          onSelectConversation={handleSelectConversation}
          activeConversationId={activeConversationId}
        />

        {/* Main chat area */}
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
              <TypingIndicator
                isTyping={isTyping}
                displayName={otherUser?.displayName}
              />
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
                Select a conversation from the sidebar or search for someone to start chatting 💕
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Call overlays */}
      <IncomingCall onAnswer={handleAnswerCall} onReject={handleRejectCall} />
      <CallModal webRTC={webRTC} />
    </div>
  );
};

export default Chat;