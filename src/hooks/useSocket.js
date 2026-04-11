import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuthStore }  from '../store/authStore';
import { useChatStore }  from '../store/chatStore';
import { useCallStore }  from '../store/callStore';
import { soundPlayer }   from '../utils/soundPlayer';
import { useNotification } from './useNotification';

let socketInstance = null;

export const useSocket = () => {
  const { token, user }        = useAuthStore();
  const {
    addMessage, updateMessage, updateConversation,
    setTyping, updateUserStatus, conversations
  } = useChatStore();
  const { setCallState, setCallType, setRemoteUser, setIncomingOffer, setConversationId } = useCallStore();
  const { showNotification }   = useNotification();
  const activeConvIdRef        = useRef(null);

  // keep activeConvId in sync
  const setActiveConvRef = useCallback((id) => { activeConvIdRef.current = id; }, []);

  useEffect(() => {
    if (!token) return;

    socketInstance = io(import.meta.env.VITE_SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
    });

    socketInstance.on('connect_error', (err) => {
      if (err.message === 'Invalid token' || err.message === 'No token') {
        useAuthStore.getState().clearAuth();
        window.location.href = '/auth';
      }
    });

    // ── Messages ────────────────────────────────────────────────────────
    socketInstance.on('message:received', (msg) => {
      const convId = msg.conversationId?._id || msg.conversationId;
      addMessage(convId, msg);

      // Update conversation preview
      updateConversation(convId, { lastMessage: msg, lastActivity: new Date() });

      // Notify if not focused / not in this conversation
      if (convId !== activeConvIdRef.current || !document.hasFocus()) {
        soundPlayer.play('message');
        const sender = msg.senderId?.displayName || 'New message';
        const preview = msg.type === 'text' ? msg.content : `📎 ${msg.type}`;
        showNotification(`💕 ${sender}`, preview, msg.senderId?.avatar);
      }
    });

    socketInstance.on('message:edited', (msg) => {
      const convId = msg.conversationId?._id || msg.conversationId;
      updateMessage(convId, msg._id, msg);
    });

    socketInstance.on('message:deleted', ({ messageId, deleteFor }) => {
      const { messages } = useChatStore.getState();
      Object.keys(messages).forEach(convId => {
        const found = messages[convId]?.find(m => m._id === messageId);
        if (found) {
          if (deleteFor === 'everyone') {
            updateMessage(convId, messageId, { isDeleted: true, content: '', mediaUrl: null });
          } else {
            useChatStore.getState().removeMessage(convId, messageId);
          }
        }
      });
    });

    // ── Typing ──────────────────────────────────────────────────────────
    socketInstance.on('typing:started', ({ conversationId }) => setTyping(conversationId, true));
    socketInstance.on('typing:stopped', ({ conversationId }) => setTyping(conversationId, false));

    // ── Read receipts ───────────────────────────────────────────────────
    socketInstance.on('messages:read', ({ conversationId, readBy }) => {
      const { messages } = useChatStore.getState();
      (messages[conversationId] || []).forEach(m => {
        if (!m.readBy?.includes(readBy)) {
          updateMessage(conversationId, m._id, { readBy: [...(m.readBy || []), readBy] });
        }
      });
    });

    // ── Presence ────────────────────────────────────────────────────────
    socketInstance.on('user:online',  ({ userId, lastSeen }) =>
      updateUserStatus(userId, { isOnline: true, lastSeen }));
    socketInstance.on('user:offline', ({ userId, lastSeen }) =>
      updateUserStatus(userId, { isOnline: false, lastSeen }));

    // ── Calls ───────────────────────────────────────────────────────────
    socketInstance.on('call:incoming', ({ from, callType, conversationId }) => {
      soundPlayer.play('ringtone');
      setRemoteUser(from);
      setCallType(callType);
      setCallState('ringing');
      setConversationId(conversationId);
    });

    socketInstance.on('call:accepted', () => setCallState('connecting'));
    socketInstance.on('call:rejected', () => {
      soundPlayer.stopRingtone();
      setCallState('idle');
    });
    socketInstance.on('call:ended', () => {
      soundPlayer.stopRingtone();
      soundPlayer.play('callEnd');
      setCallState('ended');
      setTimeout(() => useCallStore.getState().resetCall(), 2000);
    });

    // ── Invite accepted ─────────────────────────────────────────────────
    socketInstance.on('invite:accepted', ({ by, conversationId }) => {
      // Reload conversations so the new one appears
      window.dispatchEvent(new CustomEvent('invite-accepted', { detail: { by, conversationId } }));
    });

    return () => {
      socketInstance?.disconnect();
      socketInstance = null;
    };
  }, [token]);

  const emit = useCallback((event, data) => {
    socketInstance?.emit(event, data);
  }, []);

  return { socket: socketInstance, emit, setActiveConvRef };
};

export const getSocket = () => socketInstance;
