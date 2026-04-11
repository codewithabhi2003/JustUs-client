import { useRef, useState, useCallback } from 'react';
import { getSocket }    from './useSocket';
import { soundPlayer }  from '../utils/soundPlayer';
import { useCallStore } from '../store/callStore';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // Uncomment for strict NAT environments:
    // { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' }
  ]
};

export const useWebRTC = (targetUserId) => {
  const peerRef         = useRef(null);
  const localStreamRef  = useRef(null);
  const localVideoRef   = useRef(null);
  const remoteVideoRef  = useRef(null);

  const [isMuted,  setIsMuted]  = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);

  const { setCallState, setCallType, resetCall } = useCallStore();

  const createPeer = useCallback(() => {
    const socket = getSocket();
    const peer   = new RTCPeerConnection(ICE_SERVERS);

    peer.onicecandidate = ({ candidate }) => {
      if (candidate) socket?.emit('webrtc:ice', { targetUserId, candidate });
    };

    peer.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'connected') setCallState('active');
      if (['disconnected','failed','closed'].includes(peer.connectionState)) {
        endCall();
      }
    };

    return peer;
  }, [targetUserId]);

  const getMedia = async (callType) => {
    const constraints = callType === 'video'
      ? { audio: { echoCancellation: true, noiseSuppression: true }, video: true }
      : { audio: { echoCancellation: true, noiseSuppression: true }, video: false };
    return await navigator.mediaDevices.getUserMedia(constraints);
  };

  // Caller initiates
  const startCall = useCallback(async (callType) => {
    const socket = getSocket();
    setCallType(callType);
    setCallState('calling');

    const stream = await getMedia(callType);
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;

    const peer = createPeer();
    peerRef.current = peer;
    stream.getTracks().forEach(t => peer.addTrack(t, stream));

    socket?.emit('call:initiate', { targetUserId, callType });
  }, [targetUserId, createPeer]);

  // Callee answers
  const answerCall = useCallback(async (callType, offer) => {
    const socket = getSocket();
    soundPlayer.stopRingtone();
    setCallType(callType);
    setCallState('connecting');

    const stream = await getMedia(callType);
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;

    const peer = createPeer();
    peerRef.current = peer;
    stream.getTracks().forEach(t => peer.addTrack(t, stream));

    if (offer) {
      await peer.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socket?.emit('webrtc:answer', { targetUserId, answer });
    }

    socket?.emit('call:accept', { targetUserId });
  }, [targetUserId, createPeer]);

  // Handle incoming offer (after accept)
  const handleOffer = useCallback(async (offer) => {
    if (!peerRef.current) return;
    await peerRef.current.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerRef.current.createAnswer();
    await peerRef.current.setLocalDescription(answer);
    getSocket()?.emit('webrtc:answer', { targetUserId, answer });
  }, [targetUserId]);

  // Handle answer from callee
  const handleAnswer = useCallback(async (answer) => {
    if (!peerRef.current) return;
    await peerRef.current.setRemoteDescription(new RTCSessionDescription(answer));
  }, []);

  // Handle ICE candidates
  const handleIce = useCallback(async (candidate) => {
    try {
      if (peerRef.current) await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
    } catch {}
  }, []);

  const endCall = useCallback(() => {
    soundPlayer.stopRingtone();
    soundPlayer.play('callEnd');
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    peerRef.current?.close();
    localStreamRef.current = null;
    peerRef.current = null;
    if (localVideoRef.current)  localVideoRef.current.srcObject  = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    getSocket()?.emit('call:end', { targetUserId });
    setCallState('ended');
    setTimeout(() => resetCall(), 2000);
  }, [targetUserId, resetCall]);

  const toggleMute = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; setIsMuted(!track.enabled); }
  }, []);

  const toggleCamera = useCallback(() => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (track) { track.enabled = !track.enabled; setIsCamOff(!track.enabled); }
  }, []);

  return {
    startCall, answerCall, endCall, handleOffer, handleAnswer, handleIce,
    toggleMute, toggleCamera,
    isMuted, isCamOff,
    localVideoRef, remoteVideoRef,
  };
};
