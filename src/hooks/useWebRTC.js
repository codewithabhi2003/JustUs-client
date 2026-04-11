// hooks/useWebRTC.js
import { useRef, useState, useCallback, useEffect } from 'react';
import { getSocket }    from './useSocket';
import { soundPlayer }  from '../utils/soundPlayer';
import { useCallStore } from '../store/callStore';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]
};

export const useWebRTC = (targetUserId) => {
  const peerRef         = useRef(null);
  const localStreamRef  = useRef(null);
  const localVideoRef   = useRef(null);
  const remoteVideoRef  = useRef(null);

  // ── FIX 2: ICE queue ──────────────────────────────────────────────────────
  const pendingIce      = useRef([]);
  const remoteReady     = useRef(false);  // true once setRemoteDescription is done

  const [isMuted,  setIsMuted]  = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);

  const { setCallState, setCallType, resetCall } = useCallStore();

  // ── helpers ───────────────────────────────────────────────────────────────

  const getMedia = async (callType) => {
    const constraints = callType === 'video'
      ? { audio: { echoCancellation: true, noiseSuppression: true }, video: true }
      : { audio: { echoCancellation: true, noiseSuppression: true }, video: false };
    return await navigator.mediaDevices.getUserMedia(constraints);
  };

  // Drain the ICE queue once remoteDescription is in place
  const drainIce = useCallback(async () => {
    const peer = peerRef.current;
    if (!peer || !remoteReady.current) return;
    while (pendingIce.current.length) {
      const c = pendingIce.current.shift();
      try { await peer.addIceCandidate(c); } catch {}
    }
  }, []);

  const cleanupCall = useCallback(() => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    if (localVideoRef.current)  localVideoRef.current.srcObject  = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (peerRef.current) {
      peerRef.current.ontrack               = null;
      peerRef.current.onicecandidate        = null;
      peerRef.current.onconnectionstatechange = null;
      peerRef.current.close();
      peerRef.current = null;
    }
    localStreamRef.current = null;
    pendingIce.current  = [];
    remoteReady.current = false;
  }, []);

  const createPeer = useCallback((stream) => {
    const socket = getSocket();
    const peer   = new RTCPeerConnection(ICE_SERVERS);

    stream.getTracks().forEach(t => peer.addTrack(t, stream));

    peer.onicecandidate = ({ candidate }) => {
      if (candidate) socket?.emit('webrtc:ice', { targetUserId, candidate });
    };

    peer.ontrack = ({ streams: [remote] }) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remote;
    };

    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'connected') setCallState('active');
      if (['disconnected', 'failed', 'closed'].includes(peer.connectionState)) {
        endCall();
      }
    };

    peerRef.current = peer;
    return peer;
  }, [targetUserId, setCallState]);

  // ── caller: initiate ──────────────────────────────────────────────────────
  const startCall = useCallback(async (callType) => {
    const socket = getSocket();
    setCallType(callType);
    setCallState('calling');

    const stream = await getMedia(callType);
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;

    createPeer(stream);

    // Notify callee — offer is sent only after they accept (see call:accepted below)
    socket?.emit('call:initiate', { targetUserId, callType });
  }, [targetUserId, createPeer]);

  // ── callee: answer ────────────────────────────────────────────────────────
  const answerCall = useCallback(async (callType) => {
    const socket = getSocket();
    soundPlayer.stopRingtone();
    setCallType(callType);
    setCallState('connecting');

    const stream = await getMedia(callType);
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;

    createPeer(stream);

    // Tell caller we accepted — they will now send the offer
    socket?.emit('call:accept', { targetUserId });
  }, [targetUserId, createPeer]);

  // ── end call ──────────────────────────────────────────────────────────────
  const endCall = useCallback(() => {
    soundPlayer.stopRingtone();
    soundPlayer.play?.('callEnd');
    getSocket()?.emit('call:end', { targetUserId });
    cleanupCall();
    setCallState('ended');
    setTimeout(() => resetCall(), 2000);
  }, [targetUserId, cleanupCall, setCallState, resetCall]);

  const toggleMute = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; setIsMuted(!track.enabled); }
  }, []);

  const toggleCamera = useCallback(() => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (track) { track.enabled = !track.enabled; setIsCamOff(!track.enabled); }
  }, []);

  // ── FIX 3: all socket listeners self-contained inside the hook ────────────
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // ── CALLER: callee accepted → now create and send the offer ──────────────
    const onCallAccepted = async ({ from }) => {
      const peer = peerRef.current;
      if (!peer) return;
      setCallState('connecting');
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      socket.emit('webrtc:offer', { targetUserId: from, offer });
    };

    // ── CALLEE: receive offer → answer it ────────────────────────────────────
    const onOffer = async ({ from, offer }) => {
      const peer = peerRef.current;
      if (!peer) return;
      await peer.setRemoteDescription(new RTCSessionDescription(offer));
      remoteReady.current = true;       // gate opens
      await drainIce();                 // flush any queued candidates

      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socket.emit('webrtc:answer', { targetUserId: from, answer });
    };

    // ── CALLER: receive answer ────────────────────────────────────────────────
    const onAnswer = async ({ answer }) => {
      const peer = peerRef.current;
      if (!peer) return;
      await peer.setRemoteDescription(new RTCSessionDescription(answer));
      remoteReady.current = true;       // gate opens
      await drainIce();                 // flush any queued candidates
    };

    // ── BOTH: receive ICE candidate ───────────────────────────────────────────
    const onIce = async ({ candidate }) => {
      if (!candidate) return;
      const ice = new RTCIceCandidate(candidate);
      if (!remoteReady.current) {
        pendingIce.current.push(ice);   // queue until remoteDescription is set
      } else {
        try { await peerRef.current?.addIceCandidate(ice); } catch {}
      }
    };

    const onCallRejected = () => {
      cleanupCall();
      setCallState('ended');
      setTimeout(() => resetCall(), 2000);
    };

    const onCallEnded = () => {
      cleanupCall();
      setCallState('ended');
      setTimeout(() => resetCall(), 2000);
    };

    socket.on('call:accepted',  onCallAccepted);
    socket.on('webrtc:offer',   onOffer);
    socket.on('webrtc:answer',  onAnswer);
    socket.on('webrtc:ice',     onIce);
    socket.on('call:rejected',  onCallRejected);
    socket.on('call:ended',     onCallEnded);

    return () => {
      socket.off('call:accepted',  onCallAccepted);
      socket.off('webrtc:offer',   onOffer);
      socket.off('webrtc:answer',  onAnswer);
      socket.off('webrtc:ice',     onIce);
      socket.off('call:rejected',  onCallRejected);
      socket.off('call:ended',     onCallEnded);
    };
  }, [drainIce, cleanupCall, setCallState, resetCall]);

  // Safety cleanup on unmount
  useEffect(() => () => cleanupCall(), [cleanupCall]);

  return {
    startCall, answerCall, endCall,
    toggleMute, toggleCamera,
    isMuted, isCamOff,
    localVideoRef, remoteVideoRef,
  };
};