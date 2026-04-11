import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { LoginForm, RegisterForm } from '../components/auth/AuthForms';

const Auth = () => {
  const [mode, setMode] = useState('login');
  const { token }       = useAuthStore();
  const navigate        = useNavigate();

  useEffect(() => { if (token) navigate('/'); }, [token]);

  return (
    <div style={{ minHeight:'100vh', display:'flex', background:'var(--bg-base)' }}>

      {/* Left branding panel — hidden on mobile */}
      <div className="auth-left" style={{
        flex: 1, display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'center',
        padding: 48,
        background:'linear-gradient(135deg,#1C0818 0%,#2A0820 50%,#1C0818 100%)',
        borderRight:'1px solid var(--border)',
        position:'relative', overflow:'hidden',
        minWidth: 320,
      }}>
        {[300,200,150,100,80].map((s,i) => (
          <div key={i} style={{
            position:'absolute', width:s, height:s, borderRadius:'50%',
            border:`1px solid rgba(255,77,141,${[0.08,0.06,0.10,0.05,0.12][i]})`,
            top:['10%','60%','30%','80%','5%'][i],
            left:['60%','10%','80%','60%','30%'][i],
            transform:'translate(-50%,-50%)',
          }}/>
        ))}
        <div style={{ position:'relative', textAlign:'center' }}>
          <div style={{ fontSize:80, marginBottom:24, filter:'drop-shadow(0 0 30px rgba(255,77,141,0.5))' }}>💕</div>
          <h1 style={{ fontSize:42, fontWeight:900, color:'#fff', letterSpacing:'-1px', marginBottom:12 }}>JustUs</h1>
          <p style={{ color:'rgba(255,255,255,0.5)', fontSize:16, lineHeight:1.7, maxWidth:300 }}>
            Private. Intimate. Real-time.<br/>A space made just for the two of you.
          </p>
          <div style={{ display:'flex', flexWrap:'wrap', gap:10, justifyContent:'center', marginTop:36 }}>
            {['💬 Real-time chat','📞 Voice & video','🔒 Private & secure'].map(f=>(
              <div key={f} style={{ fontSize:12, color:'rgba(255,255,255,0.4)', background:'rgba(255,77,141,0.08)', border:'1px solid rgba(255,77,141,0.15)', borderRadius:99, padding:'6px 14px' }}>{f}</div>
            ))}
          </div>
        </div>
      </div>

      {/* Right — form panel */}
      <div className="auth-right" style={{
        width: 480, display:'flex', alignItems:'center', justifyContent:'center',
        padding:'48px 40px', background:'var(--bg-surface)',
      }}>
        {/* Mobile logo */}
        <div style={{ position:'absolute', top:24, left:'50%', transform:'translateX(-50%)', display:'flex', alignItems:'center', gap:8 }} className="mobile-menu-btn">
          <span style={{ fontSize:24 }}>💕</span>
          <span style={{ fontWeight:800, fontSize:20, color:'var(--accent)' }}>JustUs</span>
        </div>

        <div style={{ width:'100%', maxWidth:380, marginTop:0 }}>
          {mode === 'login'
            ? <LoginForm    onSwitch={() => setMode('register')} />
            : <RegisterForm onSwitch={() => setMode('login')} />
          }
        </div>
      </div>
    </div>
  );
};

export default Auth;