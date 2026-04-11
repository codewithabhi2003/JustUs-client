import { create } from 'zustand';

export const useCallStore = create((set) => ({
  callState:     'idle',   // 'idle'|'calling'|'ringing'|'active'|'ended'
  callType:      null,     // 'audio'|'video'
  remoteUser:    null,
  incomingOffer: null,
  conversationId: null,

  setCallState:    (s)    => set({ callState: s }),
  setCallType:     (t)    => set({ callType: t }),
  setRemoteUser:   (u)    => set({ remoteUser: u }),
  setIncomingOffer:(o)    => set({ incomingOffer: o }),
  setConversationId:(id)  => set({ conversationId: id }),
  resetCall: () => set({
    callState: 'idle', callType: null,
    remoteUser: null, incomingOffer: null, conversationId: null
  }),
}));
