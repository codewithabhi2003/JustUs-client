import { useRef, useState, useCallback } from 'react';
import { getSocket }    from './useSocket';
import { useCallStore } from '../store/callStore';

// ─────────────────────────────────────────────────────────────────────────────
// ICE configuration
// Using multiple STUN + reliable TURN servers
// ─────────────────────────────────────────────────────────────────────────────
const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'turn:openrelay.metered.ca:80',                username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443',               username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:80?transport=tcp',  username: 'openrelayproject', credential: 'openrelayproject' },
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
  iceTransportPolicy: 'all', // 'all' = try STUN first, fall back to TURN
};

// ─────────────────────────────────────────────────────────────────────────────
// Wait for ICE gathering to complete (or timeout after 4s)
// This sends ALL candidates inside the offer/answer SDP — far more reliable
// on mobile networks than trickle ICE
// ─────────────────────────────────────────────────────────────────────────────
const waitForIceGathering = (peer) => {
  return new Promise((resolve) => {
    if (peer.iceGatheringState === 'complete') {
      resolve(peer.localDescription);
      return;
    }
    const timeout = setTimeout(() => {
      peer.removeEventListener('icegatheringstatechange', onState);
      resolve(peer.localDescription); // send whatever we have
    }, 4000);

    const onState = () => {
      if (peer.iceGatheringState === 'complete') {
        clearTimeout(timeout);
        peer.removeEventListener('icegatheringstatechange', onState);
        resolve(peer.localDescription);
      }
    };
    peer.addEventListener('icegatheringstatechange', onState);
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Force audio to SPEAKER (not earpiece) on mobile
// Uses AudioContext which routes to the main speaker output
// ─────────────────────────────────────────────────────────────────────────────
let audioCtxRef = null;
let audioSourceRef = null;

const routeAudioToSpeaker = (stream) => {
  try {
    // Close old context
    if (audioCtxRef) { try { audioCtxRef.close(); } catch {} audioCtxRef = null; }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    const ctx    = new AudioCtx();
    const source = ctx.createMediaStreamSource(stream);
    // Connect directly to destination — this uses the speaker, not earpiece
    source.connect(ctx.destination);

    audioCtxRef    = ctx;
    audioSourceRef = source;
    console.log('[Audio] Routed to speaker via AudioContext');
  } catch (e) {
    console.warn('[Audio] Speaker routing failed:', e.message);
  }
};

const stopAudioContext = () => {
  try {
    audioSourceRef?.disconnect();
    audioCtxRef?.close();
  } catch {}
  audioCtxRef    = null;
  audioSourceRef = null;
};

export const useWebRTC = () => {
  const peerRef         = useRef(null);
  const localStreamRef  = useRef(null);
  const remoteUserIdRef = useRef(null);
  const callTypeRef     = useRef(null);
  const timeoutRef      = useRef(null);
  const endedRef        = useRef(false);

  // DOM element refs registered by CallModal
  const remoteAudioRef  = useRef(null);
  const remoteVideoRef  = useRef(null);
  const localVideoRef   = useRef(null);

  const [isMuted,  setIsMuted]  = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);

  const { setCallState, setCallType, resetCall } = useCallStore();

  // ── Called by CallModal to hand over its DOM elements ─────────────────
  const registerRefs = useCallback((refs) => {
    if (refs.remoteAudio !== undefined) remoteAudioRef.current = refs.remoteAudio;
    if (refs.remoteVideo !== undefined) remoteVideoRef.current = refs.remoteVideo;
    if (refs.localVideo  !== undefined) localVideoRef.current  = refs.localVideo;
  }, []);

  // ── Attach remote stream to elements + force speaker ──────────────────
  const attachRemoteStream = useCallback((stream) => {
    console.log('[WebRTC] Attaching remote stream, tracks:', stream.getTracks().map(t => t.kind));

    // Always route through AudioContext for speaker output on mobile
    routeAudioToSpeaker(stream);

    // Also set srcObject on elements as standard fallback
    const audio = remoteAudioRef.current;
    const video = remoteVideoRef.current;

    if (audio) {
      audio.srcObject = stream;
      audio.play().catch(e => console.warn('[Audio] play failed:', e.message));
    }
    if (video) {
      video.srcObject = stream;
      video.play().catch(e => console.warn('[Video] play failed:', e.message));
    }
  }, []);

  // ── Clean up everything ───────────────────────────────────────────────
  const cleanup = useCallback((notifyOther = true) => {
    clearTimeout(timeoutRef.current);
    endedRef.current = true;

    const tid = remoteUserIdRef.current;
    remoteUserIdRef.current = null;
    callTypeRef.current     = null;

    stopAudioContext();

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

    if (localVideoRef.current)  localVideoRef.current.srcObject  = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;

    setIsMuted(false);
    setIsCamOff(false);

    if (notifyOther && tid) {
      getSocket()?.emit('call:end', { targetUserId: tid });
    }
  }, []);

  // ── Build RTCPeerConnection ───────────────────────────────────────────
  const buildPeer = useCallback(() => {
    // Close existing
    if (peerRef.current) {
      peerRef.current.onicecandidate         = null;
      peerRef.current.ontrack                = null;
      peerRef.current.onconnectionstatechange = null;
      peerRef.current.oniceconnectionstatechange = null;
      peerRef.current.close();
      peerRef.current = null;
    }

    endedRef.current = false;
    const peer = new RTCPeerConnection(ICE_CONFIG);
    peerRef.current = peer;

    // NOTE: We don't use onicecandidate for trickle ICE.
    // All candidates are embedded in the SDP via waitForIceGathering().
    // This is much more reliable on mobile networks.
    // We still send them as a backup for cases where the remote side
    // supports trickle ICE:
    peer.onicecandidate = ({ candidate }) => {
      if (candidate && remoteUserIdRef.current) {
        getSocket()?.emit('webrtc:ice', { targetUserId: remoteUserIdRef.current, candidate });
      }
    };

    peer.ontrack = (evt) => {
      console.log('[WebRTC] ontrack:', evt.track.kind, 'readyState:', evt.track.readyState);
      const stream = evt.streams?.[0];
      if (stream) {
        attachRemoteStream(stream);
      }
    };

    peer.onconnectionstatechange = () => {
      const s = peer.connectionState;
      console.log('[WebRTC] connectionState:', s);
      if (endedRef.current) return;

      if (s === 'connected') {
        clearTimeout(timeoutRef.current);
        setCallState('active');
      }
      if (s === 'failed') {
        console.log('[WebRTC] Failed — attempting ICE restart');
        peer.restartIce?.();
      }
      if (s === 'closed') {
        if (!endedRef.current) {
          cleanup(false);
          setCallState('ended');
          setTimeout(resetCall, 2000);
        }
      }
    };

    peer.oniceconnectionstatechange = () => {
      const s = peer.iceConnectionState;
      console.log('[WebRTC] iceConnectionState:', s);
      if (endedRef.current) return;

      if (s === 'connected' || s === 'completed') {
        clearTimeout(timeoutRef.current);
        setCallState('active');
      }
      if (s === 'disconnected') {
        // Temporarily disconnected — give it 5s to recover
        timeoutRef.current = setTimeout(() => {
          if (peerRef.current?.iceConnectionState === 'disconnected') {
            cleanup(true);
            setCallState('ended');
            setTimeout(resetCall, 2000);
          }
        }, 5000);
      }
      if (s === 'failed') {
        peer.restartIce?.();
      }
    };

    return peer;
  }, [attachRemoteStream, cleanup, resetCall]);

  // ── Get user media ────────────────────────────────────────────────────
  const getMedia = async (callType) => {
    const constraints = callType === 'video'
      ? {
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        }
      : {
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        };

    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      // Fallback: try without advanced constraints
      if (callType === 'video') {
        return await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      }
      return await navigator.mediaDevices.getUserMedia({ audio: true });
    }
  };

  // ─────────────────────────────────────────────────────────────────────
  // CALLER flow:
  //   getMedia → buildPeer → addTracks → createOffer → setLocal
  //   → waitForIceGathering (all candidates embedded in SDP)
  //   → emit call:initiate WITH complete offer SDP
  // ─────────────────────────────────────────────────────────────────────
  const startCall = useCallback(async (targetUserId, callType) => {
    try {
      setCallType(callType);
      setCallState('calling');
      remoteUserIdRef.current = targetUserId;
      callTypeRef.current     = callType;

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

      // Wait for all ICE candidates to be gathered before sending
      // This is the KEY fix for mobile networks
      const completeOffer = await waitForIceGathering(peer);
      console.log('[WebRTC] ICE gathered, sending offer. Candidates in SDP:', (completeOffer?.sdp?.match(/a=candidate/g) || []).length);

      getSocket()?.emit('call:initiate', {
        targetUserId,
        callType,
        offer: completeOffer,
      });

      // 30s connection timeout
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        if (peerRef.current && !['connected'].includes(peerRef.current.connectionState)) {
          console.warn('[WebRTC] Connection timeout');
          cleanup(true);
          setCallState('ended');
          setTimeout(resetCall, 2000);
        }
      }, 30000);

    } catch (err) {
      console.error('[startCall]', err);
      cleanup(false);
      setCallState('idle');
      resetCall();
    }
  }, [buildPeer, cleanup, resetCall]);

  // ─────────────────────────────────────────────────────────────────────
  // CALLEE flow:
  //   getMedia → buildPeer → addTracks
  //   → setRemoteDescription(offer) → createAnswer → setLocal
  //   → waitForIceGathering (all candidates embedded)
  //   → emit call:accept WITH complete answer SDP
  // ─────────────────────────────────────────────────────────────────────
  const answerCall = useCallback(async (targetUserId, callType, offer) => {
    try {
      setCallType(callType);
      setCallState('connecting');
      remoteUserIdRef.current = targetUserId;
      callTypeRef.current     = callType;

      const stream = await getMedia(callType);
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }

      const peer = buildPeer();
      stream.getTracks().forEach(t => peer.addTrack(t, stream));

      await peer.setRemoteDescription(new RTCSessionDescription(offer));

      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      // Wait for all ICE candidates
      const completeAnswer = await waitForIceGathering(peer);
      console.log('[WebRTC] ICE gathered, sending answer. Candidates:', (completeAnswer?.sdp?.match(/a=candidate/g) || []).length);

      getSocket()?.emit('call:accept', {
        targetUserId,
        answer: completeAnswer,
      });

      // 30s timeout
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        if (peerRef.current && !['connected'].includes(peerRef.current.connectionState)) {
          cleanup(true);
          setCallState('ended');
          setTimeout(resetCall, 2000);
        }
      }, 30000);

    } catch (err) {
      console.error('[answerCall]', err);
      cleanup(false);
      setCallState('idle');
      resetCall();
    }
  }, [buildPeer, cleanup, resetCall]);

  // ── CALLER receives the callee's answer ───────────────────────────────
  const handleAnswer = useCallback(async (answer) => {
    try {
      if (!peerRef.current) return;
      console.log('[WebRTC] Setting remote answer');
      await peerRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      setCallState('connecting');
    } catch (err) {
      console.error('[handleAnswer]', err);
    }
  }, []);

  // ── ICE candidates (backup trickle — still useful in some scenarios) ──
  const handleIce = useCallback(async (candidate) => {
    try {
      if (peerRef.current?.remoteDescription && candidate) {
        await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch {}
  }, []);

  // ── End call ──────────────────────────────────────────────────────────
  const endCall = useCallback(() => {
    cleanup(true);
    setCallState('ended');
    setTimeout(resetCall, 2000);
  }, [cleanup, resetCall]);

  const toggleMute = useCallback(() => {
    const t = localStreamRef.current?.getAudioTracks()[0];
    if (t) { t.enabled = !t.enabled; setIsMuted(!t.enabled); }
  }, []);

  const toggleCamera = useCallback(() => {
    const t = localStreamRef.current?.getVideoTracks()[0];
    if (t) { t.enabled = !t.enabled; setIsCamOff(!t.enabled); }
  }, []);

  return {
    startCall, answerCall, endCall,
    handleAnswer, handleIce,
    toggleMute, toggleCamera,
    isMuted, isCamOff,
    registerRefs,
  };
};