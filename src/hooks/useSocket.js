import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuthStore }    from '../store/authStore';
import { useChatStore }    from '../store/chatStore';
import { soundPlayer }     from '../utils/soundPlayer';
import { useNotification } from './useNotification';

let socketInstance = null;

export const useSocket = () => {
  const { token }      = useAuthStore();
  const { addMessage, updateMessage, updateConversation, setTyping, updateUserStatus } = useChatStore();
  const { showNotification } = useNotification();
  const activeConvIdRef = useRef(null);
  const setActiveConvRef = useCallback((id) => { activeConvIdRef.current = id; }, []);

  useEffect(() => {
    if (!token) return;

    socketInstance = io(import.meta.env.VITE_SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'], // polling fallback for mobile
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketInstance.on('connect', () => console.log('[Socket] connected'));
    socketInstance.on('connect_error', (err) => {
      console.warn('[Socket] connect_error:', err.message);
      if (err.message === 'Invalid token' || err.message === 'No token') {
        useAuthStore.getState().clearAuth();
        window.location.href = '/auth';
      }
    });

    // ── Messages ────────────────────────────────────────────────────────
    socketInstance.on('message:received', (msg) => {
      const convId = msg.conversationId?._id || msg.conversationId;
      addMessage(convId, msg);
      updateConversation(convId, { lastMessage: msg, lastActivity: new Date() });
      if (convId !== activeConvIdRef.current || !document.hasFocus()) {
        soundPlayer.play('message');
        const sender  = msg.senderId?.displayName || 'New message';
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

    // ── Read receipts ────────────────────────────────────────────────────
    socketInstance.on('messages:read', ({ conversationId, readBy }) => {
      const { messages } = useChatStore.getState();
      (messages[conversationId] || []).forEach(m => {
        if (!m.readBy?.includes(readBy)) {
          updateMessage(conversationId, m._id, { readBy: [...(m.readBy || []), readBy] });
        }
      });
    });

    // ── Presence ─────────────────────────────────────────────────────────
    socketInstance.on('user:online',  ({ userId, lastSeen }) => updateUserStatus(userId, { isOnline: true, lastSeen }));
    socketInstance.on('user:offline', ({ userId, lastSeen }) => updateUserStatus(userId, { isOnline: false, lastSeen }));

    // ── Invite ───────────────────────────────────────────────────────────
    socketInstance.on('invite:accepted', ({ by, conversationId }) => {
      window.dispatchEvent(new CustomEvent('invite-accepted', { detail: { by, conversationId } }));
    });

    // NOTE: call:* and webrtc:* events are handled ONLY in Chat.jsx
    // to avoid duplicate handlers corrupting the WebRTC signaling flow.

    return () => {
      socketInstance?.disconnect();
      socketInstance = null;
    };
  }, [token]);

  const emit = useCallback((event, data) => socketInstance?.emit(event, data), []);
  return { emit, setActiveConvRef };
};

export const getSocket = () => socketInstance;