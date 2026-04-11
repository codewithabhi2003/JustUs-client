// hooks/useWebRTC.js
import { useRef, useState, useCallback, useEffect } from 'react';
import { getSocket }    from './useSocket';
import { soundPlayer }  from '../utils/soundPlayer';
import { useCallStore } from '../store/callStore';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export const useWebRTC = () => {
  const peerRef          = useRef(null);
  const localStreamRef   = useRef(null);
  const localVideoRef    = useRef(null);
  const remoteVideoRef   = useRef(null);
  const pendingIce       = useRef([]);
  const remoteReady      = useRef(false);
  const isEndingCall     = useRef(false);   // prevents double-fire from peer.close()
  const targetUserIdRef  = useRef(null);    // mutable — avoids stale closures

  const [isMuted,  setIsMuted]  = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);

  const {
    setCallState, setCallType, setRemoteUser,
    setIncomingOffer, resetCall,
  } = useCallStore();

  // ─── media ──────────────────────────────────────────────────────────────────
  const getMedia = async (callType) => {
    const stream = await navigator.mediaDevices.getUserMedia(
      callType === 'video'
        ? { audio: { echoCancellation: true, noiseSuppression: true }, video: true }
        : { audio: { echoCancellation: true, noiseSuppression: true }, video: false }
    );
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    return stream;
  };

  // ─── ICE drain ──────────────────────────────────────────────────────────────
  const drainIce = async () => {
    const peer = peerRef.current;
    if (!peer || !remoteReady.current) return;
    while (pendingIce.current.length) {
      try { await peer.addIceCandidate(pendingIce.current.shift()); } catch {}
    }
  };

  // ─── cleanup — safe to call multiple times ───────────────────────────────────
  const cleanupCall = useCallback(() => {
    // Stop camera + mic
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;

    // Detach video elements
    if (localVideoRef.current)  localVideoRef.current.srcObject  = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;

    // Close peer — null handlers FIRST so onconnectionstatechange can't re-trigger
    if (peerRef.current) {
      peerRef.current.ontrack                = null;
      peerRef.current.onicecandidate         = null;
      peerRef.current.onconnectionstatechange = null;
      peerRef.current.close();
      peerRef.current = null;
    }

    pendingIce.current    = [];
    remoteReady.current   = false;
    isEndingCall.current  = false;
    targetUserIdRef.current = null;
  }, []);

  // ─── end call — entry point for both sides ───────────────────────────────────
  const endCall = useCallback(() => {
    if (isEndingCall.current) return;   // guard against double-fire
    isEndingCall.current = true;

    soundPlayer.stopRingtone?.();
    soundPlayer.play?.('callEnd');

    const targetId = targetUserIdRef.current;
    if (targetId) getSocket()?.emit('call:end', { targetUserId: targetId });

    cleanupCall();
    setCallState('ended');
    setTimeout(() => resetCall(), 2000);
  }, [cleanupCall, setCallState, resetCall]);

  // ─── create peer ─────────────────────────────────────────────────────────────
  const createPeer = useCallback((stream) => {
    const peer = new RTCPeerConnection(ICE_SERVERS);

    stream.getTracks().forEach(t => peer.addTrack(t, stream));

    peer.onicecandidate = ({ candidate }) => {
      if (candidate && targetUserIdRef.current) {
        getSocket()?.emit('webrtc:ice', {
          targetUserId: targetUserIdRef.current,
          candidate,
        });
      }
    };

    peer.ontrack = ({ streams: [remote] }) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remote;
    };

    // Uses ref for endCall to avoid stale closure
    peer.onconnectionstatechange = () => {
      const state = peer.connectionState;
      if (state === 'connected') setCallState('active');
      if (['disconnected', 'failed', 'closed'].includes(state)) {
        // Only fire if WE didn't already initiate the close
        if (!isEndingCall.current) endCall();
      }
    };

    peerRef.current = peer;
    return peer;
  }, [setCallState, endCall]);

  // ─── caller: start call ──────────────────────────────────────────────────────
  const startCall = useCallback(async (targetUserId, callType) => {
    targetUserIdRef.current = targetUserId;
    setCallType(callType);
    setCallState('calling');

    try {
      const stream = await getMedia(callType);
      createPeer(stream);
      getSocket()?.emit('call:initiate', { targetUserId, callType });
    } catch (err) {
      console.error('startCall failed:', err);
      cleanupCall();
      setCallState('idle');
    }
  }, [createPeer, cleanupCall, setCallType, setCallState]);

  // ─── callee: answer call ─────────────────────────────────────────────────────
  const answerCall = useCallback(async (targetUserId, callType) => {
    targetUserIdRef.current = targetUserId;
    soundPlayer.stopRingtone?.();
    setCallType(callType);
    setCallState('connecting');

    try {
      const stream = await getMedia(callType);
      createPeer(stream);
      // Tell caller we accepted — they will send the offer
      getSocket()?.emit('call:accept', { targetUserId });
    } catch (err) {
      console.error('answerCall failed:', err);
      cleanupCall();
      setCallState('idle');
    }
  }, [createPeer, cleanupCall, setCallType, setCallState]);

  const toggleMute = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; setIsMuted(!track.enabled); }
  }, []);

  const toggleCamera = useCallback(() => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (track) { track.enabled = !track.enabled; setIsCamOff(!track.enabled); }
  }, []);

  // ─── ALL socket listeners live here ─────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // ── Incoming call (callee receives) ──────────────────────────────────────
    const onIncoming = ({ from, conversationId, callType }) => {
      setRemoteUser(from);
      setCallType(callType);
      setCallState('ringing');
      soundPlayer.startRingtone?.();
    };

    // ── Caller: callee accepted → create and send offer ──────────────────────
    const onAccepted = async ({ from }) => {
      const peer = peerRef.current;
      if (!peer) return;
      setCallState('connecting');
      try {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        socket.emit('webrtc:offer', { targetUserId: from, offer });
      } catch (err) {
        console.error('createOffer failed:', err);
        endCall();
      }
    };

    // ── Callee: receives offer → creates answer ──────────────────────────────
    const onOffer = async ({ from, offer }) => {
      const peer = peerRef.current;
      if (!peer) return;
      try {
        await peer.setRemoteDescription(new RTCSessionDescription(offer));
        remoteReady.current = true;
        await drainIce();

        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        socket.emit('webrtc:answer', { targetUserId: from, answer });
      } catch (err) {
        console.error('handleOffer failed:', err);
        endCall();
      }
    };

    // ── Caller: receives answer ──────────────────────────────────────────────
    const onAnswer = async ({ answer }) => {
      const peer = peerRef.current;
      if (!peer) return;
      try {
        await peer.setRemoteDescription(new RTCSessionDescription(answer));
        remoteReady.current = true;
        await drainIce();
      } catch (err) {
        console.error('handleAnswer failed:', err);
        endCall();
      }
    };

    // ── Both: ICE candidate exchange ─────────────────────────────────────────
    const onIce = async ({ candidate }) => {
      if (!candidate || !peerRef.current) return;
      const ice = new RTCIceCandidate(candidate);
      if (!remoteReady.current) {
        pendingIce.current.push(ice);
      } else {
        try { await peerRef.current.addIceCandidate(ice); } catch {}
      }
    };

    // ── Both: remote side rejected or ended ─────────────────────────────────
    const onRejected = () => {
      soundPlayer.stopRingtone?.();
      cleanupCall();
      setCallState('ended');
      setTimeout(() => resetCall(), 2000);
    };

    const onEnded = () => {
      // The OTHER side ended — clean up locally without emitting call:end back
      if (isEndingCall.current) return;
      isEndingCall.current = true;
      soundPlayer.stopRingtone?.();
      soundPlayer.play?.('callEnd');
      cleanupCall();
      setCallState('ended');
      setTimeout(() => resetCall(), 2000);
    };

    socket.on('call:incoming',  onIncoming);
    socket.on('call:accepted',  onAccepted);
    socket.on('webrtc:offer',   onOffer);
    socket.on('webrtc:answer',  onAnswer);
    socket.on('webrtc:ice',     onIce);
    socket.on('call:rejected',  onRejected);
    socket.on('call:ended',     onEnded);

    return () => {
      socket.off('call:incoming',  onIncoming);
      socket.off('call:accepted',  onAccepted);
      socket.off('webrtc:offer',   onOffer);
      socket.off('webrtc:answer',  onAnswer);
      socket.off('webrtc:ice',     onIce);
      socket.off('call:rejected',  onRejected);
      socket.off('call:ended',     onEnded);
    };
  }, [createPeer, endCall, cleanupCall, setCallState, setCallType, setRemoteUser, resetCall]);

  useEffect(() => () => cleanupCall(), [cleanupCall]);

  return {
    startCall, answerCall, endCall,
    toggleMute, toggleCamera,
    isMuted, isCamOff,
    localVideoRef, remoteVideoRef,
  };
};