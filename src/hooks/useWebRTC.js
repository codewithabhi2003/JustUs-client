import { useRef, useState, useCallback } from 'react';
import { getSocket }    from './useSocket';
import { useCallStore } from '../store/callStore';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // For strict NAT — uncomment:
    // { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' }
  ]
};

// ─────────────────────────────────────────────────────────────────────────────
// useWebRTC — correct WebRTC signaling flow:
//
//  CALLER:  getMedia → createPeer → addTracks → createOffer → setLocal
//           → emit call:initiate (offer inside)
//
//  CALLEE:  receives call:incoming (offer inside) → user clicks Accept
//           → getMedia → createPeer → addTracks → setRemote(offer)
//           → createAnswer → setLocal → emit call:accept (answer inside)
//
//  CALLER:  receives call:accepted (answer inside)
//           → setRemote(answer)
//           → ICE candidates flow both ways → connected!
// ─────────────────────────────────────────────────────────────────────────────
export const useWebRTC = () => {
  const peerRef        = useRef(null);
  const localStreamRef = useRef(null);
  const localVideoRef  = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteUserIdRef = useRef(null);

  const [isMuted,  setIsMuted]  = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);

  const { setCallState, setCallType, resetCall } = useCallStore();

  // ── Get user media ────────────────────────────────────────────────────
  const getMedia = async (callType) => {
    const constraints = callType === 'video'
      ? { audio: { echoCancellation: true, noiseSuppression: true }, video: { facingMode: 'user' } }
      : { audio: { echoCancellation: true, noiseSuppression: true }, video: false };
    return await navigator.mediaDevices.getUserMedia(constraints);
  };

  // ── Create RTCPeerConnection ──────────────────────────────────────────
  const createPeer = useCallback((targetUserId) => {
    // Close any existing peer first
    if (peerRef.current) {
      peerRef.current.onicecandidate    = null;
      peerRef.current.ontrack           = null;
      peerRef.current.onconnectionstatechange = null;
      peerRef.current.close();
      peerRef.current = null;
    }

    const peer = new RTCPeerConnection(ICE_SERVERS);
    remoteUserIdRef.current = targetUserId;

    peer.onicecandidate = ({ candidate }) => {
      if (candidate && remoteUserIdRef.current) {
        getSocket()?.emit('webrtc:ice', { targetUserId: remoteUserIdRef.current, candidate });
      }
    };

    peer.ontrack = (event) => {
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    peer.onconnectionstatechange = () => {
      console.log('WebRTC state:', peer.connectionState);
      if (peer.connectionState === 'connected') {
        setCallState('active');
      }
      if (['disconnected', 'failed', 'closed'].includes(peer.connectionState)) {
        // Other side dropped — clean up locally without emitting (they already disconnected)
        cleanupMedia();
        setCallState('ended');
        setTimeout(() => resetCall(), 2000);
      }
    };

    peerRef.current = peer;
    return peer;
  }, []);

  // ── Cleanup all media and peer ────────────────────────────────────────
  const cleanupMedia = useCallback(() => {
    localStreamRef.current?.getTracks().forEach(t => {
      t.stop(); // RELEASES mic and camera hardware
    });
    localStreamRef.current = null;

    if (peerRef.current) {
      peerRef.current.onicecandidate    = null;
      peerRef.current.ontrack           = null;
      peerRef.current.onconnectionstatechange = null;
      peerRef.current.close();
      peerRef.current = null;
    }

    if (localVideoRef.current)  localVideoRef.current.srcObject  = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;

    remoteUserIdRef.current = null;
    setIsMuted(false);
    setIsCamOff(false);
  }, []);

  // ── CALLER: start call ────────────────────────────────────────────────
  // Gets media, creates peer, creates offer, sends call:initiate WITH offer
  const startCall = useCallback(async (targetUserId, callType) => {
    try {
      setCallType(callType);
      setCallState('calling');

      const stream = await getMedia(callType);
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const peer = createPeer(targetUserId);
      stream.getTracks().forEach(t => peer.addTrack(t, stream));

      // Create offer BEFORE notifying the other side
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      // Send call:initiate WITH the WebRTC offer included
      getSocket()?.emit('call:initiate', {
        targetUserId,
        callType,
        offer: peer.localDescription,
      });

    } catch (err) {
      console.error('startCall error:', err);
      cleanupMedia();
      resetCall();
    }
  }, [createPeer, cleanupMedia]);

  // ── CALLEE: accept incoming call ──────────────────────────────────────
  // Gets media, sets remote offer, creates answer, sends call:accept WITH answer
  const answerCall = useCallback(async (targetUserId, callType, offer) => {
    try {
      setCallType(callType);
      setCallState('connecting');

      const stream = await getMedia(callType);
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const peer = createPeer(targetUserId);
      stream.getTracks().forEach(t => peer.addTrack(t, stream));

      // Set caller's offer as remote description
      await peer.setRemoteDescription(new RTCSessionDescription(offer));

      // Create answer
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      // Send accept WITH the WebRTC answer
      getSocket()?.emit('call:accept', {
        targetUserId,
        answer: peer.localDescription,
      });

    } catch (err) {
      console.error('answerCall error:', err);
      cleanupMedia();
      resetCall();
    }
  }, [createPeer, cleanupMedia]);

  // ── CALLER: receives answer from callee ───────────────────────────────
  const handleAnswer = useCallback(async (answer) => {
    try {
      if (!peerRef.current) return;
      setCallState('connecting');
      await peerRef.current.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) {
      console.error('handleAnswer error:', err);
    }
  }, []);

  // ── Both: handle ICE candidates ───────────────────────────────────────
  const handleIce = useCallback(async (candidate) => {
    try {
      if (peerRef.current && peerRef.current.remoteDescription) {
        await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch {}
  }, []);

  // ── End call — called by button OR when other side hangs up ──────────
  const endCall = useCallback((notifyOther = true) => {
    const targetId = remoteUserIdRef.current;

    // Stop all tracks — releases mic and camera indicators
    cleanupMedia();

    // Notify the other person (unless they already hung up)
    if (notifyOther && targetId) {
      getSocket()?.emit('call:end', { targetUserId: targetId });
    }

    setCallState('ended');
    setTimeout(() => resetCall(), 2000);
  }, [cleanupMedia, resetCall]);

  // ── Toggle mute ───────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; setIsMuted(!track.enabled); }
  }, []);

  // ── Toggle camera ─────────────────────────────────────────────────────
  const toggleCamera = useCallback(() => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (track) { track.enabled = !track.enabled; setIsCamOff(!track.enabled); }
  }, []);

  return {
    startCall, answerCall, endCall,
    handleAnswer, handleIce,
    toggleMute, toggleCamera,
    isMuted, isCamOff,
    localVideoRef, remoteVideoRef,
  };
};