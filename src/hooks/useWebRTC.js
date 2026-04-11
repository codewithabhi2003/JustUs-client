import { useRef, useState, useCallback } from 'react';
import { getSocket }    from './useSocket';
import { useCallStore } from '../store/callStore';

// ── ICE config with TURN relay for production ─────────────────────────────
// Free TURN from OpenRelay — works across different networks/NAT
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ]
};

export const useWebRTC = () => {
  const peerRef          = useRef(null);
  const localStreamRef   = useRef(null);
  const remoteStreamRef  = useRef(null);
  const remoteUserIdRef  = useRef(null);

  // Video element refs (used for video calls)
  const localVideoRef    = useRef(null);
  const remoteVideoRef   = useRef(null);
  // Audio element ref (used for audio calls — CRITICAL for voice)
  const remoteAudioRef   = useRef(null);

  const [isMuted,  setIsMuted]  = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);

  const { setCallState, setCallType, resetCall } = useCallStore();

  // ── Attach remote stream to the correct element ───────────────────────
  const attachRemoteStream = useCallback((stream) => {
    remoteStreamRef.current = stream;
    // Video call → attach to <video>
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = stream;
    }
    // Audio call (or as fallback for audio tracks) → attach to <audio>
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = stream;
    }
  }, []);

  // ── Get user media ────────────────────────────────────────────────────
  const getMedia = async (callType) => {
    const constraints = callType === 'video'
      ? { audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 }, video: { width: 640, height: 480, facingMode: 'user' } }
      : { audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 }, video: false };
    return await navigator.mediaDevices.getUserMedia(constraints);
  };

  // ── Create RTCPeerConnection ──────────────────────────────────────────
  const createPeer = useCallback((targetUserId) => {
    // Clean up any existing peer
    if (peerRef.current) {
      peerRef.current.onicecandidate         = null;
      peerRef.current.ontrack                = null;
      peerRef.current.onconnectionstatechange= null;
      peerRef.current.close();
      peerRef.current = null;
    }

    const peer = new RTCPeerConnection(ICE_SERVERS);
    remoteUserIdRef.current = targetUserId;

    peer.onicecandidate = ({ candidate }) => {
      if (candidate) {
        getSocket()?.emit('webrtc:ice', { targetUserId: remoteUserIdRef.current, candidate });
      }
    };

    // When remote track arrives — THIS is how you hear/see the other person
    peer.ontrack = (event) => {
      console.log('🎵 Remote track received:', event.track.kind, event.streams.length);
      if (event.streams && event.streams[0]) {
        attachRemoteStream(event.streams[0]);
      }
    };

    peer.onconnectionstatechange = () => {
      console.log('🔗 Connection state:', peer.connectionState);
      if (peer.connectionState === 'connected') {
        setCallState('active');
        // Re-attach stream in case elements mounted after ontrack fired
        if (remoteStreamRef.current) attachRemoteStream(remoteStreamRef.current);
      }
      if (['disconnected', 'failed', 'closed'].includes(peer.connectionState)) {
        cleanupMedia();
        setCallState('ended');
        setTimeout(() => resetCall(), 2000);
      }
    };

    peer.oniceconnectionstatechange = () => {
      console.log('🧊 ICE state:', peer.iceConnectionState);
    };

    peerRef.current = peer;
    return peer;
  }, [attachRemoteStream]);

  // ── Stop all tracks and close peer ───────────────────────────────────
  const cleanupMedia = useCallback(() => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current  = null;
    remoteStreamRef.current = null;

    if (peerRef.current) {
      peerRef.current.onicecandidate         = null;
      peerRef.current.ontrack                = null;
      peerRef.current.onconnectionstatechange= null;
      peerRef.current.close();
      peerRef.current = null;
    }

    if (localVideoRef.current)  localVideoRef.current.srcObject  = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;

    remoteUserIdRef.current = null;
    setIsMuted(false);
    setIsCamOff(false);
  }, []);

  // ── CALLER: get media → create offer → send call:initiate with offer ─
  const startCall = useCallback(async (targetUserId, callType) => {
    try {
      setCallType(callType);
      setCallState('calling');

      const stream = await getMedia(callType);
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const peer = createPeer(targetUserId);
      stream.getTracks().forEach(t => peer.addTrack(t, stream));

      const offer = await peer.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: callType === 'video' });
      await peer.setLocalDescription(offer);

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

  // ── CALLEE: accept → get media → set offer → create answer ───────────
  const answerCall = useCallback(async (targetUserId, callType, offer) => {
    try {
      setCallType(callType);
      setCallState('connecting');

      const stream = await getMedia(callType);
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const peer = createPeer(targetUserId);
      stream.getTracks().forEach(t => peer.addTrack(t, stream));

      await peer.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

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

  // ── CALLER: receives callee's answer ─────────────────────────────────
  const handleAnswer = useCallback(async (answer) => {
    try {
      if (!peerRef.current) return;
      await peerRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      setCallState('connecting');
    } catch (err) {
      console.error('handleAnswer error:', err);
    }
  }, []);

  // ── Both: add ICE candidates ──────────────────────────────────────────
  const handleIce = useCallback(async (candidate) => {
    try {
      if (peerRef.current && peerRef.current.remoteDescription && candidate) {
        await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch {}
  }, []);

  // ── End call — stop all media, notify other side ─────────────────────
  const endCall = useCallback((notifyOther = true) => {
    const targetId = remoteUserIdRef.current;
    cleanupMedia();
    if (notifyOther && targetId) {
      getSocket()?.emit('call:end', { targetUserId: targetId });
    }
    setCallState('ended');
    setTimeout(() => resetCall(), 2000);
  }, [cleanupMedia, resetCall]);

  const toggleMute = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; setIsMuted(!track.enabled); }
  }, []);

  const toggleCamera = useCallback(() => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (track) { track.enabled = !track.enabled; setIsCamOff(!track.enabled); }
  }, []);

  return {
    startCall, answerCall, endCall,
    handleAnswer, handleIce,
    toggleMute, toggleCamera,
    isMuted, isCamOff,
    localVideoRef, remoteVideoRef, remoteAudioRef,
  };
};