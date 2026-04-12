import React, { useEffect, useState, useRef } from 'react';
import { Phone, PhoneOff, Video, Mic, MicOff, VideoOff } from 'lucide-react';
import { useCallStore } from '../../store/callStore';
import { registerMediaElements } from '../../hooks/useWebRTC';
import Avatar from '../common/Avatar';

// ── Ringtone ──────────────────────────────────────────────────────────────
let ringtoneCtx = null, ringtoneNodes = [], ringtoneInterval = null;
const playRingtone = () => {
  stopRingtone();
  const ring = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      ringtoneCtx = ctx;
      const beep = (freq, t, dur) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = freq; o.type = 'sine';
        g.gain.setValueAtTime(0, ctx.currentTime + t);
        g.gain.linearRampToValueAtTime(0.28, ctx.currentTime + t + 0.02);
        g.gain.linearRampToValueAtTime(0.28, ctx.currentTime + t + dur - 0.05);
        g.gain.linearRampToValueAtTime(0, ctx.currentTime + t + dur);
        o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + dur);
        ringtoneNodes.push(o);
      };
      beep(880, 0, 0.3); beep(660, 0.35, 0.3);
    } catch {}
  };
  ring(); ringtoneInterval = setInterval(ring, 1800);
};
const stopRingtone = () => {
  clearInterval(ringtoneInterval); ringtoneInterval = null;
  ringtoneNodes.forEach(n => { try { n.stop(); } catch {} }); ringtoneNodes = [];
  if (ringtoneCtx) { try { ringtoneCtx.close(); } catch {} ringtoneCtx = null; }
};

// ── Pulse animation ───────────────────────────────────────────────────────
const PulseRing = () => (
  <>
    <style>{`
      @keyframes pulseRing{0%{transform:scale(1);opacity:.7}100%{transform:scale(1.7);opacity:0}}
      .pr{position:absolute;inset:-14px;border-radius:50%;border:3px solid var(--accent);animation:pulseRing 1.5s ease-out infinite;pointer-events:none}
      .pr:nth-child(2){animation-delay:.5s}.pr:nth-child(3){animation-delay:1s}
      @keyframes spinCall{to{transform:rotate(360deg)}}
    `}</style>
    <div className="pr"/><div className="pr"/><div className="pr"/>
  </>
);

// ── Incoming call ─────────────────────────────────────────────────────────
export const IncomingCall = ({ onAnswer, onReject }) => {
  const { callState, callType, remoteUser } = useCallStore();
  useEffect(() => {
    if (callState === 'ringing') playRingtone(); else stopRingtone();
    return stopRingtone;
  }, [callState]);
  if (callState !== 'ringing') return null;
  return (
    <div className="fade-in incoming-call-popup" style={{ position:'fixed', top:20, right:20, background:'var(--bg-elevated)', border:'1px solid var(--border-strong)', borderRadius:20, padding:24, width:300, boxShadow:'var(--shadow-md),var(--shadow-glow)', zIndex:2000 }}>
      <p style={{ color:'var(--accent)', fontWeight:700, fontSize:12, letterSpacing:'1px', marginBottom:16 }}>
        ● INCOMING {callType === 'video' ? 'VIDEO' : 'VOICE'} CALL
      </p>
      <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:20 }}>
        <div style={{ position:'relative', width:56, height:56, flexShrink:0 }}>
          <PulseRing/><Avatar user={remoteUser} size={56} showOnline={false}/>
        </div>
        <div>
          <p style={{ fontWeight:700, color:'var(--text-primary)', fontSize:16 }}>{remoteUser?.displayName}</p>
          <p style={{ color:'var(--text-secondary)', fontSize:13 }}>is calling you…</p>
        </div>
      </div>
      <div style={{ display:'flex', gap:10 }}>
        <button onClick={onAnswer} style={{ flex:1, background:'var(--accent-green)', border:'none', borderRadius:14, padding:'13px 0', color:'#fff', fontWeight:700, fontSize:14, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8, boxShadow:'0 0 20px rgba(0,217,126,.4)' }}>
          <Phone size={16}/> Accept
        </button>
        <button onClick={onReject} style={{ flex:1, background:'var(--accent-red)', border:'none', borderRadius:14, padding:'13px 0', color:'#fff', fontWeight:700, fontSize:14, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8, boxShadow:'0 0 20px rgba(255,34,68,.4)' }}>
          <PhoneOff size={16}/> Decline
        </button>
      </div>
    </div>
  );
};

// ── Call Modal ────────────────────────────────────────────────────────────
export const CallModal = ({ webRTC }) => {
  const { callState, callType, remoteUser } = useCallStore();
  const { toggleMute, toggleCamera, endCall, isMuted, isCamOff } = webRTC;
  const [duration, setDuration] = useState(0);

  // These are the ONE set of real media elements — registered globally
  const localVideoRef  = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);

  // Register with useWebRTC as soon as component mounts
  useEffect(() => {
    registerMediaElements({
      localVideo:  localVideoRef.current,
      remoteVideo: remoteVideoRef.current,
      remoteAudio: remoteAudioRef.current,
    });
  }, []);

  // Ringtone while calling
  useEffect(() => {
    if (callState === 'calling') playRingtone(); else stopRingtone();
  }, [callState]);

  // Timer
  useEffect(() => {
    if (callState !== 'active') return;
    setDuration(0);
    const t = setInterval(() => setDuration(d => d + 1), 1000);
    return () => clearInterval(t);
  }, [callState]);

  // Force play when active (mobile browsers need this)
  useEffect(() => {
    if (callState === 'active') {
      remoteAudioRef.current?.play().catch(() => {});
      remoteVideoRef.current?.play().catch(() => {});
    }
  }, [callState]);

  const fmt = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  const isVisible = ['calling','connecting','active','ended'].includes(callState);
  const isVideoActive = callType === 'video' && callState === 'active';

  return (
    <>
      {/* ── ALWAYS-MOUNTED MEDIA ELEMENTS ── */}
      {/* Remote audio — voice for ALL call types */}
      <audio ref={remoteAudioRef} autoPlay playsInline style={{ position:'fixed', left:'-9999px', width:1, height:1 }}/>

      {/* Remote video — full background for video calls */}
      <video
        ref={remoteVideoRef}
        autoPlay playsInline
        style={{
          position:'fixed', inset:0,
          width:'100%', height:'100%',
          objectFit:'cover',
          zIndex: isVideoActive ? 1501 : -1,
          opacity: isVideoActive ? 1 : 0,
          pointerEvents: 'none',
        }}
      />

      {/* Local video — picture-in-picture bottom right */}
      <video
        ref={localVideoRef}
        autoPlay muted playsInline
        style={{
          position:'fixed',
          bottom: isVideoActive ? 110 : '-9999px',
          right:  isVideoActive ? 20  : '-9999px',
          width: 110, height: 78,
          objectFit:'cover',
          borderRadius: 12,
          border: '2px solid var(--accent)',
          zIndex: 1503,
          display: isVideoActive ? 'block' : 'none',
        }}
      />

      {/* ── Call UI ── */}
      {isVisible && (
        <div style={{
          position:'fixed', inset:0,
          background: isVideoActive ? 'rgba(0,0,0,0.2)' : 'rgba(8,4,12,0.97)',
          display:'flex', flexDirection:'column',
          alignItems:'center', justifyContent:'center',
          zIndex:1502,
        }}>

          {/* Timer top-left — video calls only */}
          {isVideoActive && (
            <div style={{
              position:'absolute', top:18, left:18,
              background:'rgba(0,0,0,0.55)',
              borderRadius:99, padding:'5px 14px',
              color:'#fff', fontSize:13,
              fontFamily:'JetBrains Mono,monospace',
              backdropFilter:'blur(4px)',
              zIndex:1504,
            }}>
              {fmt(duration)}
            </div>
          )}

          {/* Avatar + status — audio calls and non-active states */}
          {!isVideoActive && (
            <div style={{ textAlign:'center', zIndex:1504 }}>
              <div style={{ position:'relative', display:'inline-block', marginBottom:28 }}>
                {(callState === 'calling' || callState === 'connecting') && <PulseRing/>}
                <Avatar user={remoteUser} size={130} showOnline={false}/>
              </div>
              <p style={{ color:'#fff', fontWeight:800, fontSize:26, marginBottom:10 }}>
                {remoteUser?.displayName}
              </p>
              <p style={{ color:'rgba(255,255,255,.55)', fontSize:15,
                fontFamily: callState === 'active' ? 'JetBrains Mono,monospace' : 'inherit' }}>
                {callState === 'calling'    ? 'Calling… 💕' :
                 callState === 'connecting' ? 'Connecting…'  :
                 callState === 'active'     ? fmt(duration)  :
                 callState === 'ended'      ? 'Call ended 💕' : ''}
              </p>
              {callState === 'connecting' && (
                <div style={{ display:'flex', justifyContent:'center', marginTop:14 }}>
                  <div style={{ width:22, height:22, border:'3px solid rgba(255,255,255,.2)', borderTopColor:'var(--accent)', borderRadius:'50%', animation:'spinCall 700ms linear infinite' }}/>
                </div>
              )}
            </div>
          )}

          {/* Controls */}
          <div style={{
            position:'absolute', bottom:36,
            display:'flex', alignItems:'center', gap:14,
            background:'rgba(0,0,0,0.6)',
            border:'1px solid rgba(255,255,255,.1)',
            borderRadius:99, padding:'14px 26px',
            backdropFilter:'blur(8px)',
            zIndex:1504,
          }}>
            {callState === 'active' && (
              <button onClick={toggleMute} style={{ width:52, height:52, borderRadius:'50%', background:isMuted?'var(--accent-red)':'rgba(255,255,255,.18)', border:'none', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'background 180ms' }}>
                {isMuted ? <MicOff size={20}/> : <Mic size={20}/>}
              </button>
            )}
            {callState === 'active' && callType === 'video' && (
              <button onClick={toggleCamera} style={{ width:52, height:52, borderRadius:'50%', background:isCamOff?'var(--accent-red)':'rgba(255,255,255,.18)', border:'none', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'background 180ms' }}>
                {isCamOff ? <VideoOff size={20}/> : <Video size={20}/>}
              </button>
            )}
            {/* End call — always visible */}
            {callState !== 'ended' && (
              <button onClick={endCall} style={{ width:64, height:64, borderRadius:'50%', background:'var(--accent-red)', border:'none', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 28px rgba(255,34,68,.7)', transform:'rotate(135deg)' }}>
                <Phone size={26}/>
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
};