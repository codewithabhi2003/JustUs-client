import { useRef, useState, useCallback } from 'react';
import { getSocket }    from './useSocket';
import { useCallStore } from '../store/callStore';

// ── ICE config — multiple TURN servers for mobile/cross-network ───────────
const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    // OpenRelay TURN — free, works across mobile/desktop networks
    { urls: 'turn:openrelay.metered.ca:80',                username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443',               username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:80?transport=tcp',  username: 'openrelayproject', credential: 'openrelayproject' },
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
};

export const useWebRTC = () => {
  const peerRef          = useRef(null);
  const localStreamRef   = useRef(null);
  const remoteUserIdRef  = useRef(null);
  const iceCandidateQueueRef = useRef([]); // buffer candidates before remote desc is set
  const timeoutRef       = useRef(null);
  const remoteAudioRef   = useRef(null);  // <audio> element ref from CallModal
  const remoteVideoRef   = useRef(null);  // <video> element ref from CallModal
  const localVideoRef    = useRef(null);  // <video> element ref from CallModal

  const [isMuted,  setIsMuted]  = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);

  const { setCallState, setCallType, resetCall } = useCallStore();

  // Called by CallModal to register its DOM elements
  const registerRefs = useCallback((refs) => {
    if (refs.remoteAudio) remoteAudioRef.current = refs.remoteAudio;
    if (refs.remoteVideo) remoteVideoRef.current = refs.remoteVideo;
    if (refs.localVideo)  localVideoRef.current  = refs.localVideo;
  }, []);

  // ── Attach remote stream to audio/video elements and FORCE play ───────
  const attachRemoteStream = useCallback((stream) => {
    const audio = remoteAudioRef.current;
    const video = remoteVideoRef.current;

    if (audio && audio.srcObject !== stream) {
      audio.srcObject = stream;
      audio.play().catch(e => console.warn('[Audio play]', e));
    }
    if (video && video.srcObject !== stream) {
      video.srcObject = stream;
      video.play().catch(e => console.warn('[Video play]', e));
    }
  }, []);

  // ── Drain buffered ICE candidates after remote desc is set ────────────
  const drainIceCandidates = useCallback(async () => {
    const peer = peerRef.current;
    if (!peer || !peer.remoteDescription) return;
    const queue = iceCandidateQueueRef.current.splice(0);
    for (const candidate of queue) {
      try { await peer.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
    }
  }, []);

  // ── Build RTCPeerConnection ───────────────────────────────────────────
  const buildPeer = useCallback(() => {
    // Clean up old peer
    if (peerRef.current) {
      peerRef.current.onicecandidate         = null;
      peerRef.current.ontrack                = null;
      peerRef.current.onconnectionstatechange = null;
      peerRef.current.oniceconnectionstatechange = null;
      peerRef.current.close();
      peerRef.current = null;
    }
    iceCandidateQueueRef.current = [];

    const peer = new RTCPeerConnection(ICE_CONFIG);
    peerRef.current = peer;

    // Send ICE candidates to the other peer
    peer.onicecandidate = ({ candidate }) => {
      if (candidate && remoteUserIdRef.current) {
        getSocket()?.emit('webrtc:ice', { targetUserId: remoteUserIdRef.current, candidate });
      }
    };

    // ← Remote audio/video arrives HERE
    peer.ontrack = (event) => {
      console.log('[WebRTC] ontrack:', event.track.kind, 'streams:', event.streams.length);
      const stream = event.streams?.[0];
      if (stream) {
        attachRemoteStream(stream);
      }
    };

    // Connection state: connected → active, failed/closed → end
    peer.onconnectionstatechange = () => {
      const state = peer.connectionState;
      console.log('[WebRTC] connectionState:', state);
      if (state === 'connected') {
        clearTimeout(timeoutRef.current);
        setCallState('active');
      }
      if (state === 'failed' || state === 'closed') {
        cleanup(false);
        setCallState('ended');
        setTimeout(resetCall, 2000);
      }
    };

    // ICE state fallback for older browsers / mobile
    peer.oniceconnectionstatechange = () => {
      const s = peer.iceConnectionState;
      console.log('[WebRTC] iceConnectionState:', s);
      if (s === 'connected' || s === 'completed') {
        clearTimeout(timeoutRef.current);
        setCallState('active');
      }
      if (s === 'failed') {
        console.log('[WebRTC] ICE failed — restarting...');
        peer.restartIce?.();
      }
    };

    return peer;
  }, [attachRemoteStream, drainIceCandidates, resetCall]);

  // ── Stop all tracks and close peer ───────────────────────────────────
  const cleanup = useCallback((notify = true) => {
    clearTimeout(timeoutRef.current);

    const tid = remoteUserIdRef.current;
    remoteUserIdRef.current = null;
    iceCandidateQueueRef.current = [];

    // Stop mic/camera (releases hardware indicator)
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;

    if (peerRef.current) {
      peerRef.current.onicecandidate         = null;
      peerRef.current.ontrack                = null;
      peerRef.current.onconnectionstatechange = null;
      peerRef.current.oniceconnectionstatechange = null;
      peerRef.current.close();
      peerRef.current = null;
    }

    // Clear media elements
    if (localVideoRef.current)  { localVideoRef.current.srcObject  = null; }
    if (remoteVideoRef.current) { remoteVideoRef.current.srcObject = null; }
    if (remoteAudioRef.current) { remoteAudioRef.current.srcObject = null; }

    setIsMuted(false);
    setIsCamOff(false);

    if (notify && tid) getSocket()?.emit('call:end', { targetUserId: tid });
  }, []);

  // ── Get mic/camera ────────────────────────────────────────────────────
  const getMedia = async (callType) => {
    const constraints = callType === 'video'
      ? {
          audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 48000 },
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        }
      : {
          audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 48000 },
          video: false,
        };
    return navigator.mediaDevices.getUserMedia(constraints);
  };

  // ── Start connection timeout (20s) ────────────────────────────────────
  const startTimeout = () => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      console.warn('[WebRTC] Connection timed out');
      cleanup(true);
      setCallState('ended');
      setTimeout(resetCall, 2000);
    }, 20000);
  };

  // ────────────────────────────────────────────────────────────────────
  // CALLER: getUserMedia → buildPeer → addTracks → createOffer
  //         → setLocalDescription → emit call:initiate WITH offer
  // ────────────────────────────────────────────────────────────────────
  const startCall = useCallback(async (targetUserId, callType) => {
    try {
      setCallType(callType);
      setCallState('calling');
      remoteUserIdRef.current = targetUserId;

      const stream = await getMedia(callType);
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }

      const peer = buildPeer();
      stream.getTracks().forEach(t => peer.addTrack(t, stream));

      const offer = await peer.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: callType === 'video',
      });
      await peer.setLocalDescription(offer);

      getSocket()?.emit('call:initiate', {
        targetUserId,
        callType,
        offer: peer.localDescription,
      });

      startTimeout();
    } catch (err) {
      console.error('[startCall]', err);
      cleanup(false);
      setCallState('idle');
      resetCall();
    }
  }, [buildPeer, cleanup, resetCall]);

  // ────────────────────────────────────────────────────────────────────
  // CALLEE: getUserMedia → buildPeer → addTracks
  //         → setRemoteDescription(offer) → createAnswer
  //         → setLocalDescription → emit call:accept WITH answer
  // ────────────────────────────────────────────────────────────────────
  const answerCall = useCallback(async (targetUserId, callType, offer) => {
    try {
      setCallType(callType);
      setCallState('connecting');
      remoteUserIdRef.current = targetUserId;

      const stream = await getMedia(callType);
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }

      const peer = buildPeer();
      stream.getTracks().forEach(t => peer.addTrack(t, stream));

      await peer.setRemoteDescription(new RTCSessionDescription(offer));
      await drainIceCandidates(); // flush any queued candidates

      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      getSocket()?.emit('call:accept', {
        targetUserId,
        answer: peer.localDescription,
      });

      startTimeout();
    } catch (err) {
      console.error('[answerCall]', err);
      cleanup(false);
      setCallState('idle');
      resetCall();
    }
  }, [buildPeer, cleanup, drainIceCandidates, resetCall]);

  // ────────────────────────────────────────────────────────────────────
  // CALLER receives callee's answer → setRemoteDescription
  // ────────────────────────────────────────────────────────────────────
  const handleAnswer = useCallback(async (answer) => {
    try {
      const peer = peerRef.current;
      if (!peer) return;
      await peer.setRemoteDescription(new RTCSessionDescription(answer));
      await drainIceCandidates();
      setCallState('connecting');
    } catch (err) {
      console.error('[handleAnswer]', err);
    }
  }, [drainIceCandidates]);

  // ────────────────────────────────────────────────────────────────────
  // Both sides: add ICE candidates (buffer if remote desc not set yet)
  // ────────────────────────────────────────────────────────────────────
  const handleIce = useCallback(async (candidate) => {
    if (!candidate) return;
    const peer = peerRef.current;
    if (!peer) return;

    if (peer.remoteDescription && peer.remoteDescription.type) {
      // Remote description is set — add immediately
      try { await peer.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
    } else {
      // Remote description not set yet — buffer it
      iceCandidateQueueRef.current.push(candidate);
    }
  }, []);

  // ────────────────────────────────────────────────────────────────────
  // End call button
  // ────────────────────────────────────────────────────────────────────
  const endCall = useCallback(() => {
    cleanup(true);
    setCallState('ended');
    setTimeout(resetCall, 2000);
  }, [cleanup, resetCall]);

  const toggleMute = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; setIsMuted(!track.enabled); }
  }, []);

  const toggleCamera = useCallback(() => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (track) { track.enabled = !track.enabled; setIsCamOff(!track.enabled); }
  }, []);

  return {
    startCall, answerCall, endCall, handleAnswer, handleIce,
    toggleMute, toggleCamera, isMuted, isCamOff,
    registerRefs,
  };
};