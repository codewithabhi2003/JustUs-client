import { useRef, useState, useCallback } from 'react';
import { getSocket }    from './useSocket';
import { useCallStore } from '../store/callStore';

// Multiple TURN servers for maximum cross-device compatibility
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'turn:openrelay.metered.ca:80',                username:'openrelayproject', credential:'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443',               username:'openrelayproject', credential:'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username:'openrelayproject', credential:'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:80?transport=tcp',  username:'openrelayproject', credential:'openrelayproject' },
  ]
};

// Global element refs — set directly by CallComponents, read by this hook
// This avoids React closure/stale-ref problems entirely
const mediaEls = { localVideo: null, remoteVideo: null, remoteAudio: null };

export const registerMediaElements = (els) => {
  Object.assign(mediaEls, els);
  // If stream already arrived before elements mounted, attach now
  if (window.__remoteStream__) attachStream(window.__remoteStream__);
  if (window.__localStream__ && mediaEls.localVideo) {
    mediaEls.localVideo.srcObject = window.__localStream__;
    mediaEls.localVideo.play().catch(() => {});
  }
};

const attachStream = (stream) => {
  window.__remoteStream__ = stream;
  if (mediaEls.remoteVideo) {
    mediaEls.remoteVideo.srcObject = stream;
    mediaEls.remoteVideo.play().catch(() => {});
  }
  if (mediaEls.remoteAudio) {
    mediaEls.remoteAudio.srcObject = stream;
    mediaEls.remoteAudio.play().catch(() => {});
  }
};

const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'turn:openrelay.metered.ca:80',                username:'openrelayproject', credential:'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443',               username:'openrelayproject', credential:'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username:'openrelayproject', credential:'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:80?transport=tcp',  username:'openrelayproject', credential:'openrelayproject' },
  ],
  iceCandidatePoolSize: 10,
};

let peerConnection   = null;
let localStream      = null;
let remoteUserId     = null;

const closePeer = () => {
  if (peerConnection) {
    peerConnection.onicecandidate = null;
    peerConnection.ontrack = null;
    peerConnection.onconnectionstatechange = null;
    peerConnection.oniceconnectionstatechange = null;
    peerConnection.close();
    peerConnection = null;
  }
};

const stopLocalStream = () => {
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
    window.__localStream__ = null;
  }
  if (mediaEls.localVideo)  mediaEls.localVideo.srcObject  = null;
  if (mediaEls.remoteVideo) mediaEls.remoteVideo.srcObject = null;
  if (mediaEls.remoteAudio) mediaEls.remoteAudio.srcObject = null;
  window.__remoteStream__ = null;
};

export const useWebRTC = () => {
  const [isMuted,  setIsMuted]  = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const { setCallState, setCallType, resetCall } = useCallStore();

  const getMedia = async (callType) => {
    const constraints = callType === 'video'
      ? { audio: { echoCancellation: true, noiseSuppression: true }, video: { facingMode: 'user' } }
      : { audio: { echoCancellation: true, noiseSuppression: true }, video: false };
    return await navigator.mediaDevices.getUserMedia(constraints);
  };

  const buildPeer = (targetId, onStateChange) => {
    closePeer();
    remoteUserId = targetId;
    const peer = new RTCPeerConnection(ICE_CONFIG);
    peerConnection = peer;

    peer.onicecandidate = ({ candidate }) => {
      if (candidate) {
        getSocket()?.emit('webrtc:ice', { targetUserId: remoteUserId, candidate });
      }
    };

    // ← Critical: this fires when remote audio/video arrives
    peer.ontrack = (evt) => {
      console.log('[WebRTC] ontrack:', evt.track.kind);
      const stream = evt.streams?.[0];
      if (stream) attachStream(stream);
    };

    peer.onconnectionstatechange = () => {
      const s = peer.connectionState;
      console.log('[WebRTC] connectionState:', s);
      if (s === 'connected') {
        onStateChange('active');
        // Re-attach in case elements weren't ready when ontrack fired
        if (window.__remoteStream__) attachStream(window.__remoteStream__);
      }
      if (['disconnected', 'failed', 'closed'].includes(s)) {
        onStateChange('ended');
      }
    };

    // Extra fallback: ICE connected → try active state
    peer.oniceconnectionstatechange = () => {
      console.log('[WebRTC] iceState:', peer.iceConnectionState);
      if (peer.iceConnectionState === 'connected' || peer.iceConnectionState === 'completed') {
        onStateChange('active');
        if (window.__remoteStream__) attachStream(window.__remoteStream__);
      }
      if (peer.iceConnectionState === 'failed') {
        // Force ICE restart on failure
        peer.restartIce?.();
      }
    };

    return peer;
  };

  // ── CALLER ────────────────────────────────────────────────────────────
  const startCall = async (targetUserId, callType) => {
    try {
      setCallType(callType);
      setCallState('calling');

      localStream = await getMedia(callType);
      window.__localStream__ = localStream;

      if (mediaEls.localVideo) {
        mediaEls.localVideo.srcObject = localStream;
        mediaEls.localVideo.play().catch(() => {});
      }

      const peer = buildPeer(targetUserId, (state) => {
        if (state === 'active') setCallState('active');
        if (state === 'ended') { stopLocalStream(); closePeer(); setCallState('ended'); setTimeout(resetCall, 2000); }
      });

      localStream.getTracks().forEach(t => peer.addTrack(t, localStream));

      const offer = await peer.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: callType === 'video' });
      await peer.setLocalDescription(offer);

      getSocket()?.emit('call:initiate', { targetUserId, callType, offer: peer.localDescription });
    } catch (err) {
      console.error('[startCall]', err);
      stopLocalStream(); closePeer(); resetCall();
    }
  };

  // ── CALLEE ────────────────────────────────────────────────────────────
  const answerCall = async (targetUserId, callType, offer) => {
    try {
      setCallType(callType);
      setCallState('connecting');

      localStream = await getMedia(callType);
      window.__localStream__ = localStream;

      if (mediaEls.localVideo) {
        mediaEls.localVideo.srcObject = localStream;
        mediaEls.localVideo.play().catch(() => {});
      }

      const peer = buildPeer(targetUserId, (state) => {
        if (state === 'active') setCallState('active');
        if (state === 'ended') { stopLocalStream(); closePeer(); setCallState('ended'); setTimeout(resetCall, 2000); }
      });

      localStream.getTracks().forEach(t => peer.addTrack(t, localStream));
      await peer.setRemoteDescription(new RTCSessionDescription(offer));

      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      getSocket()?.emit('call:accept', { targetUserId, answer: peer.localDescription });
    } catch (err) {
      console.error('[answerCall]', err);
      stopLocalStream(); closePeer(); resetCall();
    }
  };

  // ── CALLER receives answer ────────────────────────────────────────────
  const handleAnswer = async (answer) => {
    try {
      if (!peerConnection) return;
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      setCallState('connecting');
    } catch (err) { console.error('[handleAnswer]', err); }
  };

  // ── ICE candidates ────────────────────────────────────────────────────
  const handleIce = async (candidate) => {
    try {
      if (peerConnection?.remoteDescription && candidate) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch {}
  };

  // ── End call ──────────────────────────────────────────────────────────
  const endCall = useCallback((notifyOther = true) => {
    const tid = remoteUserId;
    stopLocalStream();
    closePeer();
    if (notifyOther && tid) getSocket()?.emit('call:end', { targetUserId: tid });
    setCallState('ended');
    setTimeout(() => resetCall(), 2000);
  }, [resetCall]);

  const toggleMute = () => {
    const t = localStream?.getAudioTracks()[0];
    if (t) { t.enabled = !t.enabled; setIsMuted(!t.enabled); }
  };

  const toggleCamera = () => {
    const t = localStream?.getVideoTracks()[0];
    if (t) { t.enabled = !t.enabled; setIsCamOff(!t.enabled); }
  };

  return { startCall, answerCall, endCall, handleAnswer, handleIce, toggleMute, toggleCamera, isMuted, isCamOff };
};