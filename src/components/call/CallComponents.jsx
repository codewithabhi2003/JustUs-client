import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Phone, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { useCallStore } from '../../store/callStore';
import Avatar from '../common/Avatar';

// ── Ringtone (Web Audio — no MP3 file needed) ─────────────────────────────
let _rCtx = null, _rNodes = [], _rTimer = null;

const playRing = () => {
  stopRing();
  const fire = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      _rCtx = ctx;
      const beep = (hz, start, dur) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = 'sine'; o.frequency.value = hz;
        g.gain.setValueAtTime(0, ctx.currentTime + start);
        g.gain.linearRampToValueAtTime(0.3, ctx.currentTime + start + 0.02);
        g.gain.linearRampToValueAtTime(0.3, ctx.currentTime + start + dur - 0.04);
        g.gain.linearRampToValueAtTime(0, ctx.currentTime + start + dur);
        o.start(ctx.currentTime + start);
        o.stop(ctx.currentTime + start + dur + 0.05);
        _rNodes.push(o);
      };
      beep(880, 0, 0.3);
      beep(660, 0.38, 0.3);
    } catch {}
  };
  fire();
  _rTimer = setInterval(fire, 1900);
};

const stopRing = () => {
  clearInterval(_rTimer); _rTimer = null;
  _rNodes.forEach(n => { try { n.stop(); } catch {} }); _rNodes = [];
  if (_rCtx) { try { _rCtx.close(); } catch {} _rCtx = null; }
};

// ── Pulse rings ───────────────────────────────────────────────────────────
const Pulse = () => (
  <>
    <style>{`
      @keyframes pr{0%{transform:scale(1);opacity:.65}100%{transform:scale(1.8);opacity:0}}
      .pr{position:absolute;inset:-16px;border-radius:50%;border:3px solid var(--accent);animation:pr 1.6s ease-out infinite;pointer-events:none}
      .pr:nth-child(2){animation-delay:.55s}.pr:nth-child(3){animation-delay:1.1s}
      @keyframes sc{to{transform:rotate(360deg)}}
    `}</style>
    <div className="pr"/><div className="pr"/><div className="pr"/>
  </>
);

// ─────────────────────────────────────────────────────────────────────────────
// IncomingCall popup
// ─────────────────────────────────────────────────────────────────────────────
export const IncomingCall = ({ onAnswer, onReject }) => {
  const { callState, callType, remoteUser } = useCallStore();

  useEffect(() => {
    // Play ringtone for BOTH voice and video incoming calls
    if (callState === 'ringing') playRing();
    else stopRing();
    return stopRing;
  }, [callState]);

  if (callState !== 'ringing') return null;

  return (
    <div className="fade-in incoming-call-popup" style={{
      position:'fixed', top:20, right:20, zIndex:3000,
      background:'var(--bg-elevated)',
      border:'1px solid var(--border-strong)',
      borderRadius:22, padding:24, width:300,
      boxShadow:'0 8px 40px rgba(0,0,0,0.65), var(--shadow-glow)',
    }}>
      <p style={{ color:'var(--accent)', fontWeight:700, fontSize:11, letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:16 }}>
        ● Incoming {callType === 'video' ? 'Video' : 'Voice'} Call
      </p>

      <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:22 }}>
        <div style={{ position:'relative', width:58, height:58, flexShrink:0 }}>
          <Pulse/><Avatar user={remoteUser} size={58} showOnline={false}/>
        </div>
        <div>
          <p style={{ fontWeight:700, color:'var(--text-primary)', fontSize:17, marginBottom:2 }}>{remoteUser?.displayName}</p>
          <p style={{ color:'var(--text-secondary)', fontSize:13 }}>is calling…</p>
        </div>
      </div>

      <div style={{ display:'flex', gap:10 }}>
        <button onClick={onAnswer} style={{ flex:1, background:'var(--accent-green)', border:'none', borderRadius:14, padding:'13px 0', color:'#fff', fontWeight:700, fontSize:14, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8, boxShadow:'0 0 20px rgba(0,217,126,.5)' }}>
          <Phone size={17}/> Accept
        </button>
        <button onClick={onReject} style={{ flex:1, background:'var(--accent-red)', border:'none', borderRadius:14, padding:'13px 0', color:'#fff', fontWeight:700, fontSize:14, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8, boxShadow:'0 0 20px rgba(255,34,68,.5)' }}>
          <Phone size={17} style={{ transform:'rotate(135deg)' }}/> Decline
        </button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// CallModal — the active call screen
// ─────────────────────────────────────────────────────────────────────────────
export const CallModal = ({ webRTC }) => {
  const { callState, callType, remoteUser } = useCallStore();
  const { toggleMute, toggleCamera, endCall, isMuted, isCamOff, registerRefs } = webRTC;
  const [duration, setDuration] = useState(0);

  // ── One set of real media element refs ───────────────────────────────
  const remoteAudioRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localVideoRef  = useRef(null);
  const refsRegistered = useRef(false);

  const tryRegister = useCallback(() => {
    // Only register once all three elements are available
    if (remoteAudioRef.current && remoteVideoRef.current && localVideoRef.current && !refsRegistered.current) {
      registerRefs({
        remoteAudio: remoteAudioRef.current,
        remoteVideo: remoteVideoRef.current,
        localVideo:  localVideoRef.current,
      });
      refsRegistered.current = true;
    }
  }, [registerRefs]);

  const audioCallback = useCallback((el) => {
    if (!el) return;
    remoteAudioRef.current = el;
    tryRegister();
  }, [tryRegister]);

  const remoteVideoCallback = useCallback((el) => {
    if (!el) return;
    remoteVideoRef.current = el;
    tryRegister();
  }, [tryRegister]);

  const localVideoCallback = useCallback((el) => {
    if (!el) return;
    localVideoRef.current = el;
    tryRegister();
  }, [tryRegister]);

  // Re-register if registerRefs changes (first render)
  useEffect(() => {
    refsRegistered.current = false;
    tryRegister();
  }, [registerRefs]);

  // Ringtone — plays for CALLER while dialling and VIDEO incoming call
  useEffect(() => {
    if (callState === 'calling') playRing();
    else stopRing();
  }, [callState]);

  // Timer
  useEffect(() => {
    if (callState !== 'active') return;
    setDuration(0);
    const t = setInterval(() => setDuration(d => d + 1), 1000);
    return () => clearInterval(t);
  }, [callState]);

  // Force play on mobile when call becomes active
  useEffect(() => {
    if (callState === 'active') {
      remoteAudioRef.current?.play().catch(() => {});
      remoteVideoRef.current?.play().catch(() => {});
    }
  }, [callState]);

  const fmt = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  const isVisible    = ['calling','connecting','active','ended'].includes(callState);
  const isActive     = callState === 'active';
  const isVideoActive= isActive && callType === 'video';

  return (
    <>
      {/*
        ═══════════════════════════════════════════════════════════════
        ALWAYS-MOUNTED MEDIA ELEMENTS — never unmounted, never hidden
        via display:none (Safari/Chrome mobile block audio on hidden els)
        Positioned off-screen when not in use via translateX/opacity.
        ═══════════════════════════════════════════════════════════════
      */}

      {/* Remote AUDIO — routes to speaker via AudioContext in useWebRTC
          Also kept here as fallback for browsers that need srcObject    */}
      <audio
        ref={audioCallback}
        autoPlay
        playsInline
        style={{ position:'fixed', width:1, height:1, bottom:0, right:0, opacity:0.01, zIndex:-1 }}
      />

      {/* Remote VIDEO — full screen background for video calls */}
      <video
        ref={remoteVideoCallback}
        autoPlay
        playsInline
        style={{
          position:'fixed', inset:0,
          width:'100%', height:'100%',
          objectFit:'cover',
          background:'#000',
          zIndex: isVideoActive ? 1501 : -1,
          opacity: isVideoActive ? 1 : 0,
          transition:'opacity 350ms ease',
          pointerEvents:'none',
        }}
      />

      {/* Local VIDEO — PiP bottom-right for video calls */}
      <video
        ref={localVideoCallback}
        autoPlay
        muted
        playsInline
        style={{
          position:'fixed',
          bottom: isVideoActive ? 110 : '-200px',
          right:  isVideoActive ? 18  : '-200px',
          width:110, height:80,
          objectFit:'cover',
          borderRadius:12,
          border:'2px solid var(--accent)',
          zIndex:1503,
          transition:'bottom 300ms, right 300ms',
          boxShadow:'var(--shadow-md)',
          background:'#111',
        }}
      />

      {/* ── Call UI overlay ── */}
      {isVisible && (
        <div style={{
          position:'fixed', inset:0, zIndex:1502,
          background: isVideoActive ? 'rgba(0,0,0,0.12)' : 'rgba(8,4,12,0.96)',
          display:'flex', flexDirection:'column',
          alignItems:'center', justifyContent:'center',
        }}>

          {/* Timer — top-left for video */}
          {isVideoActive && (
            <div style={{
              position:'absolute', top:16, left:16,
              background:'rgba(0,0,0,0.55)', backdropFilter:'blur(6px)',
              borderRadius:99, padding:'5px 14px',
              color:'#fff', fontSize:13, fontFamily:'JetBrains Mono,monospace',
              zIndex:1504,
            }}>
              {fmt(duration)}
            </div>
          )}

          {/* Centre content — audio calls and non-active states */}
          {!isVideoActive && callState !== 'ended' && (
            <div style={{ textAlign:'center', zIndex:1504, padding:'0 24px' }}>
              <div style={{ position:'relative', display:'inline-block', marginBottom:30 }}>
                {(callState === 'calling' || callState === 'connecting') && <Pulse/>}
                <Avatar user={remoteUser} size={130} showOnline={false}/>
              </div>

              <p style={{ color:'#fff', fontWeight:800, fontSize:26, marginBottom:10 }}>
                {remoteUser?.displayName}
              </p>

              {callState !== 'active' && (
                <p style={{ color:'rgba(255,255,255,0.5)', fontSize:15 }}>
                  {callState === 'calling'    ? 'Calling… 💕' : 'Connecting…'}
                </p>
              )}

              {isActive && (
                <p style={{ color:'rgba(255,255,255,0.6)', fontSize:18, fontFamily:'JetBrains Mono,monospace', letterSpacing:2, marginTop:4 }}>
                  {fmt(duration)}
                </p>
              )}

              {callState === 'connecting' && (
                <div style={{ display:'flex', justifyContent:'center', marginTop:18 }}>
                  <div style={{ width:24, height:24, border:'3px solid rgba(255,255,255,0.15)', borderTopColor:'var(--accent)', borderRadius:'50%', animation:'sc 650ms linear infinite' }}/>
                </div>
              )}
            </div>
          )}

          {callState === 'ended' && (
            <p style={{ color:'rgba(255,255,255,0.6)', fontSize:18, zIndex:1504 }}>Call ended 💕</p>
          )}

          {/* ── Controls ── */}
          {callState !== 'ended' && (
            <div style={{
              position:'absolute', bottom:36,
              display:'flex', alignItems:'center', gap:14,
              background:'rgba(0,0,0,0.6)',
              border:'1px solid rgba(255,255,255,0.08)',
              borderRadius:99, padding:'14px 26px',
              backdropFilter:'blur(10px)',
              zIndex:1504,
            }}>
              {/* Mute — active only */}
              {isActive && (
                <button onClick={toggleMute}
                  style={{ width:52, height:52, borderRadius:'50%', background:isMuted?'var(--accent-red)':'rgba(255,255,255,0.16)', border:'none', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'background 180ms' }}>
                  {isMuted ? <MicOff size={20}/> : <Mic size={20}/>}
                </button>
              )}

              {/* Camera — active video only */}
              {isActive && callType === 'video' && (
                <button onClick={toggleCamera}
                  style={{ width:52, height:52, borderRadius:'50%', background:isCamOff?'var(--accent-red)':'rgba(255,255,255,0.16)', border:'none', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'background 180ms' }}>
                  {isCamOff ? <VideoOff size={20}/> : <Video size={20}/>}
                </button>
              )}

              {/* End call — always shown during call */}
              <button onClick={endCall}
                style={{ width:64, height:64, borderRadius:'50%', background:'var(--accent-red)', border:'none', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 30px rgba(255,34,68,0.7)', transform:'rotate(135deg)' }}
                onMouseEnter={e => e.currentTarget.style.boxShadow='0 0 44px rgba(255,34,68,1)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow='0 0 30px rgba(255,34,68,0.7)'}
              >
                <Phone size={26}/>
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
};