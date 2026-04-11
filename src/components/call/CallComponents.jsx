import React, { useEffect, useState } from 'react';
import { Phone, PhoneOff, Video, Mic, MicOff, VideoOff } from 'lucide-react';
import { useCallStore }  from '../../store/callStore';
import Avatar from '../common/Avatar';

// ── Web Audio Ringtone (no MP3 file needed) ───────────────────────────────
let ringtoneCtx = null;
let ringtoneNodes = [];
let ringtoneInterval = null;

const playRingtone = () => {
  stopRingtone();
  const ring = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      ringtoneCtx = ctx;
      const beep = (freq, start, dur) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0, ctx.currentTime + start);
        gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + start + 0.02);
        gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + start + dur - 0.05);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + start + dur);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur);
        ringtoneNodes.push(osc);
      };
      beep(880, 0,    0.3);
      beep(660, 0.35, 0.3);
    } catch {}
  };
  ring();
  ringtoneInterval = setInterval(ring, 1800);
};

const stopRingtone = () => {
  clearInterval(ringtoneInterval);
  ringtoneInterval = null;
  ringtoneNodes.forEach(n => { try { n.stop(); } catch {} });
  ringtoneNodes = [];
  if (ringtoneCtx) { try { ringtoneCtx.close(); } catch {} ringtoneCtx = null; }
};

// ── Pulse rings around avatar ─────────────────────────────────────────────
const PulseRing = () => (
  <>
    <style>{`
      @keyframes pulseRing {
        0%   { transform:scale(1);   opacity:0.7; }
        100% { transform:scale(1.7); opacity:0; }
      }
      .pulse-ring {
        position:absolute; inset:-14px; border-radius:50%;
        border:3px solid var(--accent);
        animation:pulseRing 1.5s ease-out infinite;
        pointer-events:none;
      }
      .pulse-ring:nth-child(2){ animation-delay:0.5s; }
      .pulse-ring:nth-child(3){ animation-delay:1s; }
      @keyframes spinCall { to { transform:rotate(360deg); } }
    `}</style>
    <div className="pulse-ring"/>
    <div className="pulse-ring"/>
    <div className="pulse-ring"/>
  </>
);

// ── Incoming Call Popup ───────────────────────────────────────────────────
export const IncomingCall = ({ onAnswer, onReject }) => {
  const { callState, callType, remoteUser } = useCallStore();

  useEffect(() => {
    if (callState === 'ringing') playRingtone();
    else stopRingtone();
    return () => stopRingtone();
  }, [callState]);

  if (callState !== 'ringing') return null;

  return (
    <div className="fade-in" style={{
      position:'fixed', top:20, right:20,
      background:'var(--bg-elevated)',
      border:'1px solid var(--border-strong)',
      borderRadius:20, padding:24, width:300,
      boxShadow:'var(--shadow-md), var(--shadow-glow)',
      zIndex:2000,
    }}>
      <p style={{ color:'var(--accent)', fontWeight:700, fontSize:12, letterSpacing:'1px', marginBottom:16 }}>
        ● INCOMING {callType === 'video' ? 'VIDEO' : 'VOICE'} CALL
      </p>
      <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:20 }}>
        <div style={{ position:'relative', width:56, height:56, flexShrink:0 }}>
          <PulseRing/>
          <Avatar user={remoteUser} size={56} showOnline={false}/>
        </div>
        <div>
          <p style={{ fontWeight:700, color:'var(--text-primary)', fontSize:16 }}>{remoteUser?.displayName}</p>
          <p style={{ color:'var(--text-secondary)', fontSize:13 }}>is calling you…</p>
        </div>
      </div>
      <div style={{ display:'flex', gap:10 }}>
        <button onClick={onAnswer} style={{ flex:1, background:'var(--accent-green)', border:'none', borderRadius:14, padding:'13px 0', color:'#fff', fontWeight:700, fontSize:14, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8, boxShadow:'0 0 20px rgba(0,217,126,0.4)' }}>
          <Phone size={16}/> Accept
        </button>
        <button onClick={onReject} style={{ flex:1, background:'var(--accent-red)', border:'none', borderRadius:14, padding:'13px 0', color:'#fff', fontWeight:700, fontSize:14, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8, boxShadow:'0 0 20px rgba(255,34,68,0.4)' }}>
          <PhoneOff size={16}/> Decline
        </button>
      </div>
    </div>
  );
};

// ── Call Modal (outgoing / active / ended) ────────────────────────────────
export const CallModal = ({ webRTC }) => {
  const { callState, callType, remoteUser } = useCallStore();
  const [duration, setDuration] = useState(0);
  const { toggleMute, toggleCamera, endCall, isMuted, isCamOff, localVideoRef, remoteVideoRef } = webRTC;

  // Ringtone while dialling
  useEffect(() => {
    if (callState === 'calling') playRingtone();
    else stopRingtone();
  }, [callState]);

  // Timer
  useEffect(() => {
    if (callState !== 'active') return;
    setDuration(0);
    const t = setInterval(() => setDuration(d => d + 1), 1000);
    return () => clearInterval(t);
  }, [callState]);

  const fmt = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

  if (!['calling','connecting','active','ended'].includes(callState)) return null;

  const statusLabel = {
    calling:    'Calling… 💕',
    connecting: 'Connecting…',
    active:     fmt(duration),
    ended:      'Call ended 💕',
  }[callState];

  return (
    <div style={{
      position:'fixed', inset:0,
      background:'rgba(8,4,12,0.97)',
      display:'flex', flexDirection:'column',
      alignItems:'center', justifyContent:'center',
      zIndex:1500,
    }}>
      {/* Remote video background */}
      {callType === 'video' && callState === 'active' && (
        <video ref={remoteVideoRef} autoPlay playsInline
          style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', opacity:0.85 }}
        />
      )}

      {/* Centre — avatar + name + status */}
      <div style={{ position:'relative', textAlign:'center', zIndex:1 }}>
        <div style={{ position:'relative', display:'inline-block', marginBottom:28 }}>
          {(callState === 'calling' || callState === 'connecting') && <PulseRing/>}
          <Avatar user={remoteUser} size={130} showOnline={false}/>
        </div>
        <p style={{ color:'#fff', fontWeight:800, fontSize:26, marginBottom:10 }}>
          {remoteUser?.displayName}
        </p>
        <p style={{ color:'rgba(255,255,255,0.55)', fontSize:15, fontFamily: callState === 'active' ? 'JetBrains Mono, monospace' : 'inherit' }}>
          {statusLabel}
        </p>
        {callState === 'connecting' && (
          <div style={{ display:'flex', justifyContent:'center', marginTop:14 }}>
            <div style={{ width:22, height:22, border:'3px solid rgba(255,255,255,0.2)', borderTopColor:'var(--accent)', borderRadius:'50%', animation:'spinCall 700ms linear infinite' }}/>
          </div>
        )}
      </div>

      {/* PiP local video */}
      {callType === 'video' && callState === 'active' && (
        <video ref={localVideoRef} autoPlay muted playsInline
          style={{ position:'absolute', bottom:120, right:24, width:130, height:90, borderRadius:12, objectFit:'cover', border:'2px solid var(--accent)', zIndex:2 }}
        />
      )}

      {/* Video timer */}
      {callType === 'video' && callState === 'active' && (
        <div style={{ position:'absolute', top:20, left:'50%', transform:'translateX(-50%)', background:'rgba(0,0,0,0.6)', borderRadius:99, padding:'6px 18px', color:'#fff', fontSize:14, zIndex:2, fontFamily:'JetBrains Mono, monospace' }}>
          {fmt(duration)}
        </div>
      )}

      {/* ── Controls bar — END CALL always shown ── */}
      <div style={{
        position:'absolute', bottom:40,
        display:'flex', alignItems:'center', gap:16,
        background:'rgba(0,0,0,0.55)',
        border:'1px solid rgba(255,255,255,0.08)',
        borderRadius:99, padding:'14px 28px',
        zIndex:2,
      }}>
        {callState === 'active' && (
          <button onClick={toggleMute} title={isMuted?'Unmute':'Mute'}
            style={{ width:52, height:52, borderRadius:'50%', background:isMuted?'var(--accent-red)':'rgba(255,255,255,0.15)', border:'none', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'background 200ms' }}>
            {isMuted ? <MicOff size={20}/> : <Mic size={20}/>}
          </button>
        )}

        {callState === 'active' && callType === 'video' && (
          <button onClick={toggleCamera} title={isCamOff?'Camera on':'Camera off'}
            style={{ width:52, height:52, borderRadius:'50%', background:isCamOff?'var(--accent-red)':'rgba(255,255,255,0.15)', border:'none', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'background 200ms' }}>
            {isCamOff ? <VideoOff size={20}/> : <Video size={20}/>}
          </button>
        )}

        {/* 🔴 END / CANCEL CALL — visible in ALL states */}
        {callState !== 'ended' && (
          <button
            onClick={endCall}
            title="End call"
            style={{
              width:64, height:64, borderRadius:'50%',
              background:'var(--accent-red)',
              border:'none', color:'#fff',
              cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center',
              boxShadow:'0 0 28px rgba(255,34,68,0.65)',
              transform:'rotate(135deg)',
              transition:'box-shadow 180ms, transform 180ms',
            }}
            onMouseEnter={e => e.currentTarget.style.boxShadow='0 0 40px rgba(255,34,68,1)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow='0 0 28px rgba(255,34,68,0.65)'}
          >
            <Phone size={26}/>
          </button>
        )}
      </div>
    </div>
  );
};