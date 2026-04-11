import React, { useState } from 'react';
import { authAPI }       from '../../services/api';
import { useAuthStore }  from '../../store/authStore';
import { useNotification } from '../../hooks/useNotification';
import { Eye, EyeOff, Heart } from 'lucide-react';

export const LoginForm = ({ onSwitch }) => {
  const [form, setForm]   = useState({ email: '', password: '' });
  const [err,  setErr]    = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw]   = useState(false);
  const { setAuth }           = useAuthStore();
  const { requestPermission } = useNotification();

  const handle = async (e) => {
    e.preventDefault();
    setLoading(true); setErr('');
    try {
      const { data } = await authAPI.login(form);
      setAuth(data, data.token);
      await requestPermission();
      // Check for pending invite redirect
      const pending = sessionStorage.getItem('justus-invite-redirect');
      if (pending) { sessionStorage.removeItem('justus-invite-redirect'); window.location.href = pending; }
    } catch (er) {
      setErr(er.response?.data?.message || 'Login failed');
    } finally { setLoading(false); }
  };

  return (
    <form onSubmit={handle} style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ textAlign:'center', marginBottom:8 }}>
        <div style={{ fontSize:48, marginBottom:8 }}>💕</div>
        <h2 style={{ color:'var(--text-primary)', fontSize:24, fontWeight:700 }}>Welcome back</h2>
        <p style={{ color:'var(--text-secondary)', fontSize:14, marginTop:4 }}>Sign in to JustUs</p>
      </div>
      {err && (
        <div style={{ background:'rgba(255,34,68,0.12)', border:'1px solid var(--accent-red)', borderRadius:10, padding:'10px 14px', color:'var(--accent-red)', fontSize:14 }}>
          {err}
        </div>
      )}
      <div>
        <label style={{ color:'var(--text-secondary)', fontSize:13, fontWeight:500, display:'block', marginBottom:6 }}>Email</label>
        <input className="input-base" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="you@example.com" required />
      </div>
      <div>
        <label style={{ color:'var(--text-secondary)', fontSize:13, fontWeight:500, display:'block', marginBottom:6 }}>Password</label>
        <div style={{ position:'relative' }}>
          <input className="input-base" type={showPw?'text':'password'} value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="••••••••" required style={{ paddingRight:40 }} />
          <button type="button" onClick={()=>setShowPw(!showPw)} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', padding:0 }}>
            {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
          </button>
        </div>
      </div>
      <button className="btn-primary" type="submit" disabled={loading} style={{ marginTop:4 }}>
        {loading ? 'Signing in…' : '💕 Sign In'}
      </button>
      <p style={{ textAlign:'center', color:'var(--text-secondary)', fontSize:14 }}>
        No account?{' '}
        <button type="button" onClick={onSwitch} style={{ background:'none', border:'none', color:'var(--accent)', cursor:'pointer', fontWeight:600, fontSize:14 }}>
          Register
        </button>
      </p>
    </form>
  );
};

export const RegisterForm = ({ onSwitch }) => {
  const [form, setForm] = useState({ username:'', displayName:'', email:'', password:'' });
  const [err,  setErr]  = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw]   = useState(false);
  const { setAuth }           = useAuthStore();
  const { requestPermission } = useNotification();

  const handle = async (e) => {
    e.preventDefault();
    setLoading(true); setErr('');
    try {
      const { data } = await authAPI.register(form);
      setAuth(data, data.token);
      await requestPermission();
    } catch (er) {
      setErr(er.response?.data?.message || 'Registration failed');
    } finally { setLoading(false); }
  };

  return (
    <form onSubmit={handle} style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <div style={{ textAlign:'center', marginBottom:4 }}>
        <div style={{ fontSize:48, marginBottom:8 }}>💕</div>
        <h2 style={{ color:'var(--text-primary)', fontSize:24, fontWeight:700 }}>Create account</h2>
        <p style={{ color:'var(--text-secondary)', fontSize:14, marginTop:4 }}>Join JustUs</p>
      </div>
      {err && (
        <div style={{ background:'rgba(255,34,68,0.12)', border:'1px solid var(--accent-red)', borderRadius:10, padding:'10px 14px', color:'var(--accent-red)', fontSize:14 }}>
          {err}
        </div>
      )}
      {[
        { key:'username',    label:'Username',     type:'text',     placeholder:'your_username' },
        { key:'displayName', label:'Display Name', type:'text',     placeholder:'Your Name' },
        { key:'email',       label:'Email',        type:'email',    placeholder:'you@example.com' },
      ].map(f => (
        <div key={f.key}>
          <label style={{ color:'var(--text-secondary)', fontSize:13, fontWeight:500, display:'block', marginBottom:6 }}>{f.label}</label>
          <input className="input-base" type={f.type} value={form[f.key]} onChange={e=>setForm({...form,[f.key]:e.target.value})} placeholder={f.placeholder} required />
        </div>
      ))}
      <div>
        <label style={{ color:'var(--text-secondary)', fontSize:13, fontWeight:500, display:'block', marginBottom:6 }}>Password</label>
        <div style={{ position:'relative' }}>
          <input className="input-base" type={showPw?'text':'password'} value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="Min 6 characters" required minLength={6} style={{ paddingRight:40 }} />
          <button type="button" onClick={()=>setShowPw(!showPw)} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', padding:0 }}>
            {showPw ? <EyeOff size={16}/> : <Eye size={16}/>}
          </button>
        </div>
      </div>
      <button className="btn-primary" type="submit" disabled={loading} style={{ marginTop:4 }}>
        {loading ? 'Creating…' : '💕 Create Account'}
      </button>
      <p style={{ textAlign:'center', color:'var(--text-secondary)', fontSize:14 }}>
        Already have an account?{' '}
        <button type="button" onClick={onSwitch} style={{ background:'none', border:'none', color:'var(--accent)', cursor:'pointer', fontWeight:600, fontSize:14 }}>
          Sign in
        </button>
      </p>
    </form>
  );
};
