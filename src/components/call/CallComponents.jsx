import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Phone, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { useCallStore } from '../../store/callStore';
import Avatar from '../common/Avatar';

// ── Ringtone via Web Audio API (no MP3 needed) ────────────────────────────
let _ctx = null, _nodes = [], _interval = null;

const playRing = () => {
  stopRing();
  const fire = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      _ctx = ctx;
      const tone = (hz, start, dur) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.type = 'sine'; o.frequency.value = hz;
        g.gain.setValueAtTime(0, ctx.currentTime + start);
        g.gain.linearRampToValueAtTime(0.3, ctx.currentTime + start + 0.02);
        g.gain.linearRampToValueAtTime(0.3, ctx.currentTime + start + dur - 0.04);
        g.gain.linearRampToValueAtTime(0, ctx.currentTime + start + dur);
        o.start(ctx.currentTime + start);
        o.stop(ctx.currentTime + start + dur + 0.05);
        _nodes.push(o);
      };
      tone(880, 0,    0.3);
      tone(660, 0.38, 0.3);
    } catch {}
  };
  fire();
  _interval = setInterval(fire, 1900);
};

const stopRing = () => {
  clearInterval(_interval); _interval = null;
  _nodes.forEach(n => { try { n.stop(); } catch {} }); _nodes = [];
  if (_ctx) { try { _ctx.close(); } catch {} _ctx = null; }
};

// ── Pulse ring animation around avatar ───────────────────────────────────
const Pulse = () => (
  <>
    <style>{`
      @keyframes pr{0%{transform:scale(1);opacity:.65}100%{transform:scale(1.75);opacity:0}}
      .pulse{position:absolute;inset:-16px;border-radius:50%;border:3px solid var(--accent);animation:pr 1.6s ease-out infinite;pointer-events:none}
      .pulse:nth-child(2){animation-delay:.55s}
      .pulse:nth-child(3){animation-delay:1.1s}
      @keyframes spin2{to{transform:rotate(360deg)}}
    `}</style>
    <div className="pulse"/><div className="pulse"/><div className="pulse"/>
  </>
);

// ─────────────────────────────────────────────────────────────────────────────
// IncomingCall — popup shown to the person being called
// ─────────────────────────────────────────────────────────────────────────────
export const IncomingCall = ({ onAnswer, onReject }) => {
  const { callState, callType, remoteUser } = useCallStore();

  useEffect(() => {
    // Play ringtone for BOTH audio and video incoming calls
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
      boxShadow:'0 8px 40px rgba(0,0,0,0.6), var(--shadow-glow)',
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
          <p style={{ color:'var(--text-secondary)', fontSize:13 }}>is calling you…</p>
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
// CallModal — shown to both caller and callee during / after the call
// ─────────────────────────────────────────────────────────────────────────────
export const CallModal = ({ webRTC }) => {
  const { callState, callType, remoteUser } = useCallStore();
  const { toggleMute, toggleCamera, endCall, isMuted, isCamOff, registerRefs } = webRTC;
  const [duration, setDuration] = useState(0);

  // ── Media element refs ──────────────────────────────────────────────
  const remoteAudioRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localVideoRef  = useRef(null);

  // Register refs with useWebRTC so it can attach streams
  const audioRefCallback = useCallback((el) => {
    remoteAudioRef.current = el;
    registerRefs({ remoteAudio: el, remoteVideo: remoteVideoRef.current, localVideo: localVideoRef.current });
  }, [registerRefs]);

  const remoteVideoRefCallback = useCallback((el) => {
    remoteVideoRef.current = el;
    registerRefs({ remoteAudio: remoteAudioRef.current, remoteVideo: el, localVideo: localVideoRef.current });
  }, [registerRefs]);

  const localVideoRefCallback = useCallback((el) => {
    localVideoRef.current = el;
    registerRefs({ remoteAudio: remoteAudioRef.current, remoteVideo: remoteVideoRef.current, localVideo: el });
  }, [registerRefs]);

  // Ringtone for CALLER while dialling
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

  // Force play when call becomes active (critical for mobile autoplay policy)
  useEffect(() => {
    if (callState === 'active') {
      remoteAudioRef.current?.play().catch(() => {});
      remoteVideoRef.current?.play().catch(() => {});
    }
  }, [callState]);

  const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const isActive  = callState === 'active';
  const isVideoOn = callType === 'video';
  const showUI    = ['calling', 'connecting', 'active', 'ended'].includes(callState);

  const statusText = {
    calling:    'Calling… 💕',
    connecting: 'Connecting…',
    ended:      'Call ended 💕',
  }[callState] || '';

  return (
    <>
      {/* ── ALWAYS-MOUNTED MEDIA ELEMENTS ──────────────────────────────
          Never conditionally rendered — refs must be alive before ontrack fires.
          Positioned off-screen when not in use.                           */}

      {/* Remote AUDIO — plays voice from the other person on ALL call types */}
      <audio
        ref={audioRefCallback}
        autoPlay
        playsInline
        // 1×1 pixel — visible enough to play on iOS Safari, invisible to user
        style={{ position:'fixed', bottom:0, right:0, width:1, height:1, opacity:0, zIndex:-1 }}
      />

      {/* Remote VIDEO — full-screen background when video call is active */}
      <video
        ref={remoteVideoRefCallback}
        autoPlay playsInline
        style={{
          position: 'fixed', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'cover',
          zIndex: isActive && isVideoOn ? 1501 : -1,
          opacity: isActive && isVideoOn ? 1 : 0,
          transition: 'opacity 400ms ease',
          pointerEvents: 'none',
          background: '#000',
        }}
      />

      {/* Local VIDEO — picture-in-picture (bottom-right) */}
      <video
        ref={localVideoRefCallback}
        autoPlay muted playsInline
        style={{
          position: 'fixed',
          bottom: isActive && isVideoOn ? 110 : '-200px',
          right:  isActive && isVideoOn ? 18  : '-200px',
          width: 110, height: 80,
          objectFit: 'cover',
          borderRadius: 12,
          border: '2px solid var(--accent)',
          zIndex: 1503,
          transition: 'bottom 300ms, right 300ms',
          boxShadow: 'var(--shadow-md)',
        }}
      />

      {/* ── Call UI overlay ── */}
      {showUI && (
        <div style={{
          position:'fixed', inset:0, zIndex:1502,
          background: isActive && isVideoOn ? 'rgba(0,0,0,0.15)' : 'rgba(8,4,12,0.96)',
          display:'flex', flexDirection:'column',
          alignItems:'center', justifyContent:'center',
          backdropFilter: isActive && isVideoOn ? 'none' : 'none',
        }}>

          {/* Timer — top-left for video, center for audio */}
          {isActive && isVideoOn && (
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

          {/* Avatar + name + status — audio calls and non-active states */}
          {(!isVideoOn || !isActive) && callState !== 'ended' && (
            <div style={{ textAlign:'center', position:'relative', zIndex:1504 }}>
              <div style={{ position:'relative', display:'inline-block', marginBottom:30 }}>
                {(callState === 'calling' || callState === 'connecting') && <Pulse/>}
                <Avatar user={remoteUser} size={130} showOnline={false}/>
              </div>
              <p style={{ color:'#fff', fontWeight:800, fontSize:26, marginBottom:10 }}>
                {remoteUser?.displayName}
              </p>

              {/* Status text */}
              {callState !== 'active' && (
                <p style={{ color:'rgba(255,255,255,0.5)', fontSize:15 }}>{statusText}</p>
              )}

              {/* Timer for audio calls */}
              {isActive && !isVideoOn && (
                <p style={{ color:'rgba(255,255,255,0.6)', fontSize:17, fontFamily:'JetBrains Mono,monospace', letterSpacing:2 }}>
                  {fmt(duration)}
                </p>
              )}

              {/* Spinner during connecting */}
              {callState === 'connecting' && (
                <div style={{ display:'flex', justifyContent:'center', marginTop:18 }}>
                  <div style={{ width:24, height:24, border:'3px solid rgba(255,255,255,0.15)', borderTopColor:'var(--accent)', borderRadius:'50%', animation:'spin2 650ms linear infinite' }}/>
                </div>
              )}
            </div>
          )}

          {/* Call ended message */}
          {callState === 'ended' && (
            <p style={{ color:'rgba(255,255,255,0.65)', fontSize:18, zIndex:1504 }}>Call ended 💕</p>
          )}

          {/* ── Controls bar ── */}
          {callState !== 'ended' && (
            <div style={{
              position:'absolute', bottom:36,
              display:'flex', alignItems:'center', gap:14,
              background:'rgba(0,0,0,0.6)',
              border:'1px solid rgba(255,255,255,0.1)',
              borderRadius:99, padding:'14px 28px',
              backdropFilter:'blur(10px)',
              zIndex:1504,
            }}>
              {/* Mute — shown when active */}
              {isActive && (
                <button onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'}
                  style={{ width:52, height:52, borderRadius:'50%', background:isMuted?'var(--accent-red)':'rgba(255,255,255,0.16)', border:'none', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'background 180ms' }}>
                  {isMuted ? <MicOff size={20}/> : <Mic size={20}/>}
                </button>
              )}

              {/* Camera toggle — video + active only */}
              {isActive && isVideoOn && (
                <button onClick={toggleCamera} title={isCamOff ? 'Camera on' : 'Camera off'}
                  style={{ width:52, height:52, borderRadius:'50%', background:isCamOff?'var(--accent-red)':'rgba(255,255,255,0.16)', border:'none', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'background 180ms' }}>
                  {isCamOff ? <VideoOff size={20}/> : <Video size={20}/>}
                </button>
              )}

              {/* End call — ALWAYS visible (calling / connecting / active) */}
              <button onClick={endCall} title="End call"
                style={{ width:64, height:64, borderRadius:'50%', background:'var(--accent-red)', border:'none', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 30px rgba(255,34,68,0.7)', transform:'rotate(135deg)', transition:'box-shadow 180ms' }}
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