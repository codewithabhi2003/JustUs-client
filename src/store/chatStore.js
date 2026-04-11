import { create } from 'zustand';

export const useChatStore = create((set, get) => ({
  conversations:        [],
  activeConversationId: null,
  messages:             {},
  typingUsers:          {},

  setConversations: (convs) => set({ conversations: convs }),
  setActiveConversation: (id) => set({ activeConversationId: id }),

  setMessages: (conversationId, msgs) =>
    set(state => ({ messages: { ...state.messages, [conversationId]: msgs } })),

  addMessage: (conversationId, msg) =>
    set(state => ({
      messages: {
        ...state.messages,
        [conversationId]: [...(state.messages[conversationId] || []), msg]
      }
    })),

  updateMessage: (conversationId, messageId, updates) =>
    set(state => ({
      messages: {
        ...state.messages,
        [conversationId]: (state.messages[conversationId] || []).map(m =>
          m._id === messageId ? { ...m, ...updates } : m
        )
      }
    })),

  removeMessage: (conversationId, messageId) =>
    set(state => ({
      messages: {
        ...state.messages,
        [conversationId]: (state.messages[conversationId] || []).filter(m => m._id !== messageId)
      }
    })),

  updateConversation: (conversationId, updates) =>
    set(state => ({
      conversations: state.conversations.map(c =>
        c._id === conversationId ? { ...c, ...updates } : c
      )
    })),

  prependMessages: (conversationId, msgs) =>
    set(state => ({
      messages: {
        ...state.messages,
        [conversationId]: [...msgs, ...(state.messages[conversationId] || [])]
      }
    })),

  setTyping: (conversationId, isTyping) =>
    set(state => ({ typingUsers: { ...state.typingUsers, [conversationId]: isTyping } })),

  updateUserStatus: (userId, statusData) =>
    set(state => ({
      conversations: state.conversations.map(c => ({
        ...c,
        participants: c.participants.map(p =>
          p._id === userId ? { ...p, status: { ...p.status, ...statusData } } : p
        )
      }))
    })),
}));
