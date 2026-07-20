import React, { useState, useContext, useEffect, useRef } from 'react';
import { User, Lock, LogIn, UserPlus, Mail, LogOut, AlertCircle, CheckCircle, Eye, EyeOff, Loader, RefreshCw, Shield, Calendar, AtSign, Fingerprint } from 'lucide-react';
import { AuthContext } from './AuthContext';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';
import { motion, AnimatePresence } from 'framer-motion';

// ═══════════════════════════════════════
// CSS riêng cho ProfileTab (Light Theme)
// ═══════════════════════════════════════
const profileStyles = `
  @keyframes profileFadeIn {
    from { opacity: 0; transform: translateY(24px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes profilePulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(0, 0, 0, 0.15); }
    50% { box-shadow: 0 0 0 14px rgba(0, 0, 0, 0); }
  }
  @keyframes profileFloat {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-6px); }
  }
  @keyframes profileGlow {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 1; }
  }
  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
  @keyframes orbitSlow {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  .profile-root {
    margin: -16px;
    width: calc(100% + 32px);
    height: calc(100% + 32px);
    display: flex; flex-direction: column;
    background: #f8f9fa;
    position: relative; overflow-y: auto; overflow-x: hidden;
  }
  .profile-bg {
    position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: 0;
  }
  .profile-bg::before {
    content: ''; position: absolute; top: -50%; right: -35%;
    width: 500px; height: 500px; border-radius: 50%;
    background: radial-gradient(circle, rgba(0,0,0,0.03) 0%, transparent 70%);
    animation: orbitSlow 30s linear infinite; pointer-events: none;
  }
  .profile-bg::after {
    content: ''; position: absolute; bottom: -35%; left: -25%;
    width: 400px; height: 400px; border-radius: 50%;
    background: radial-gradient(circle, rgba(0,0,0,0.03) 0%, transparent 70%);
    animation: orbitSlow 25s linear infinite reverse; pointer-events: none;
  }
  .profile-card {
    position: relative; z-index: 1;
    background: #ffffff;
    border: 1px solid #eaeaea;
    border-radius: 20px; backdrop-filter: blur(20px);
    padding: 28px 22px; margin: 0 16px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.04);
    animation: profileFadeIn 0.6s ease-out;
  }
  .profile-input {
    width: 100%; padding: 14px 14px 14px 44px;
    background: #fafafa; border: 1px solid #eaeaea;
    border-radius: 12px; color: #111; font-size: 0.9rem;
    outline: none; transition: all 0.3s ease; box-sizing: border-box;
  }
  .profile-input::placeholder { color: #999; }
  .profile-input:focus {
    border-color: #111;
    box-shadow: 0 0 0 3px rgba(0,0,0,0.05);
    background: #fff;
  }
  .profile-btn-primary {
    width: 100%; padding: 14px; border: none; border-radius: 12px;
    background: #111;
    color: #fff; font-size: 0.95rem; font-weight: 600; cursor: pointer;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    transition: all 0.3s ease; position: relative; overflow: hidden;
    background-size: 200% 200%; box-sizing: border-box;
  }
  .profile-btn-primary:hover {
    transform: translateY(-2px); box-shadow: 0 8px 25px rgba(0,0,0,0.2);
    background: #000;
  }
  .profile-btn-primary:active { transform: translateY(0); }
  .profile-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
  .profile-btn-social {
    width: 100%; padding: 12px; border-radius: 12px; font-size: 0.85rem;
    font-weight: 600; cursor: pointer; display: flex; align-items: center;
    justify-content: center; gap: 10px; transition: all 0.3s ease;
    box-sizing: border-box;
  }
  .profile-btn-social:hover { transform: translateY(-2px); }
  .profile-btn-social:active { transform: translateY(0); }
  .profile-btn-google, .profile-btn-fb {
    background: #fff; color: #111; border: 1px solid #eaeaea;
  }
  .profile-btn-google:hover, .profile-btn-fb:hover { box-shadow: 0 6px 20px rgba(0,0,0,0.05); border-color: #ccc; }
  .profile-link { color: #111; cursor: pointer; font-weight: 600; text-decoration: underline; transition: color 0.2s; }
  .profile-link:hover { color: #444; }
  .profile-avatar {
    width: 90px; height: 90px; border-radius: 50%; margin: 0 auto 16px;
    display: flex; align-items: center; justify-content: center;
    background: #111;
    box-shadow: 0 8px 30px rgba(0,0,0,0.15);
    font-size: 2.2rem; color: #fff; font-weight: 700;
    overflow: hidden; position: relative;
    animation: profilePulse 3s ease-in-out infinite;
  }
  .profile-avatar img { width: 100%; height: 100%; object-fit: cover; }
  .profile-info-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 0; border-bottom: 1px solid #f0f0f0;
  }
  .profile-info-row:last-child { border-bottom: none; }
  .profile-info-icon {
    width: 36px; height: 36px; border-radius: 10px; display: flex;
    align-items: center; justify-content: center; flex-shrink: 0;
  }
  .profile-btn-logout {
    width: 100%; padding: 14px; border: 1px solid #ffeded;
    border-radius: 12px; background: #fffafb; color: #ef4444;
    font-size: 0.95rem; font-weight: 600; cursor: pointer;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    transition: all 0.3s ease; box-sizing: border-box;
  }
  .profile-btn-logout:hover {
    background: #ffeded; border-color: #ffcccc;
    transform: translateY(-2px); box-shadow: 0 6px 20px rgba(239,68,68,0.1);
  }
  .profile-verify-card {
    position: relative; z-index: 1; text-align: center;
    animation: profileFadeIn 0.6s ease-out;
    padding: 30px 20px;
  }
`;

export default function ProfileTab() {
  const { user, loading, error, register, login, loginWithGoogle, loginWithFacebook, logout, resetPassword, clearError, resendVerification, reloadVerificationState } = useContext(AuthContext);
  
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState('');
  
  const [isExploding, setIsExploding] = useState(false);
  const pressTimer = useRef(null);
  
  // Chế độ chạy trốn
  const [isRunawayMode, setIsRunawayMode] = useState(false);
  const [logoPos, setLogoPos] = useState({ x: 0, y: 0 });
  const tapHistory = useRef([]);

  const runAway = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    const screenW = typeof window !== 'undefined' ? window.innerWidth : 400;
    const screenH = typeof window !== 'undefined' ? window.innerHeight : 800;
    
    const maxLeft = -screenW / 2 + 70;
    const maxRight = screenW / 2 - 70;
    const maxTop = -screenH + 150;
    const maxBottom = -20;
    
    const randomX = maxLeft + Math.random() * (maxRight - maxLeft);
    const randomY = maxTop + Math.random() * (maxBottom - maxTop);
    
    setLogoPos({ x: randomX, y: randomY });
  };

  const handlePointerDown = () => {
    if (isExploding) return;
    
    if (isRunawayMode) {
      runAway();
      return;
    }
    
    const now = Date.now();
    tapHistory.current = tapHistory.current.filter(time => now - time < 800);
    tapHistory.current.push(now);

    if (tapHistory.current.length >= 3) {
      setIsRunawayMode(true);
      tapHistory.current = [];
      runAway();
      return;
    }

    pressTimer.current = setTimeout(() => {
      setIsExploding(true);
      setTimeout(() => setIsExploding(false), 2500);
      pressTimer.current = null;
    }, 1500);
  };

  const handlePointerUp = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };
  
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(localStorage.getItem('appLockEnabled') === 'true');

  useEffect(() => {
    const checkBiometric = async () => {
      try {
        const result = await NativeBiometric.isAvailable();
        setBiometricAvailable(result.isAvailable);
      } catch (e) {
        console.error("Biometric check error:", e);
        setBiometricAvailable(false);
      }
    };
    checkBiometric();
  }, []);

  const handleToggleBiometric = async () => {
    if (!biometricAvailable) return;
    
    if (!biometricEnabled) {
      try {
        await NativeBiometric.verifyIdentity({
          reason: "Xác thực để bật khoá ứng dụng",
          title: "Bật khoá bảo mật",
          subtitle: "Sử dụng sinh trắc học hoặc mật khẩu máy để tiếp tục",
          useFallback: true,
        });
        localStorage.setItem('appLockEnabled', 'true');
        setBiometricEnabled(true);
      } catch (e) {
        alert("Xác thực thất bại, không thể bật khoá.");
      }
    } else {
      localStorage.setItem('appLockEnabled', 'false');
      setBiometricEnabled(false);
    }
  };

  const isOAuthUser = user?.providers?.some(p => p === 'google.com' || p === 'facebook.com');

  const switchMode = (newMode) => {
    setMode(newMode);
    clearError();
    setSuccessMsg('');
    setEmail('');
    setPassword('');
    setDisplayName('');
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!email || !password || !displayName) return;
    setIsSubmitting(true);
    setSuccessMsg('');
    const result = await register(email, password, displayName);
    setIsSubmitting(false);
    if (result.success) {
      setPassword('');
      setDisplayName('');
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    setIsSubmitting(true);
    setSuccessMsg('');
    const result = await login(email, password);
    setIsSubmitting(false);
  };

  const handleForgotPass = async () => {
    if (!email) {
      alert("Vui lòng nhập Email của bạn vào ô Email trước khi nhấn 'Quên mật khẩu'.");
      return;
    }
    setIsSubmitting(true);
    setSuccessMsg('');
    const result = await resetPassword(email);
    setIsSubmitting(false);
    if (result.success) {
      setSuccessMsg('Đã gửi link khôi phục! Vui lòng kiểm tra hộp thư Email của bạn.');
    }
  };

  useEffect(() => {
    let interval = null;
    if (user && !user.emailVerified && !isOAuthUser) {
      interval = setInterval(async () => {
        const isVerified = await reloadVerificationState();
        if (isVerified) clearInterval(interval);
      }, 3000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [user, reloadVerificationState]);

  const handleResend = async () => {
    setIsResending(true);
    try {
      await resendVerification();
      setVerifyMsg('Đã gửi lại link! Vui lòng kiểm tra hộp thư (cả mục Thư rác/Spam).');
    } catch (e) {
      setVerifyMsg('Có lỗi xảy ra khi gửi lại email. Vui lòng thử lại sau.');
    }
    setIsResending(false);
  };

  // ═══════ LOADING ═══════
  if (loading) {
    return (
      <div className="profile-root">
        <style>{profileStyles}</style>
        <div className="profile-bg" />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Loader size={36} color="#111" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      </div>
    );
  }

  // ═══════ CHỜ XÁC THỰC ═══════
  if (user && !user.emailVerified && !isOAuthUser) {
    return (
      <div className="profile-root">
        <style>{profileStyles}</style>
        <div className="profile-bg" />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
          <div className="profile-verify-card">
            <div style={{ marginBottom: 24, animation: 'profileFloat 3s ease-in-out infinite' }}>
              <Shield size={56} color="#111" />
            </div>
            <h2 style={{ color: '#1e293b', fontSize: '1.3rem', marginBottom: 8 }}>Đang chờ xác thực</h2>
            <p style={{ color: '#64748b', fontSize: '0.85rem', lineHeight: 1.6, marginBottom: 28, maxWidth: 300, margin: '0 auto 28px' }}>
              Link xác thực đã được gửi đến<br/>
              <strong style={{ color: '#111' }}>{user.email}</strong>
            </p>
            {verifyMsg && (
              <div style={{ padding: '10px 16px', background: '#f5f5f5', borderRadius: 10, color: '#111', fontSize: '0.8rem', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <CheckCircle size={14} /> {verifyMsg}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 280, margin: '0 auto' }}>
              <button className="profile-btn-primary" onClick={handleResend} disabled={isResending}>
                {isResending ? 'Đang gửi...' : <><RefreshCw size={16} /> Gửi lại Email</>}
              </button>
              <button className="profile-btn-logout" onClick={logout}>
                <LogOut size={16} /> Thoát tài khoản
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════ HỒ SƠ (ĐÃ ĐĂNG NHẬP) ═══════
  if (user && (user.emailVerified || isOAuthUser)) {
    return (
      <div className="profile-root">
        <style>{profileStyles}</style>
        <div className="profile-bg" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '20px 0', zIndex: 1 }}>
          {/* Avatar + Tên */}
          <div style={{ textAlign: 'center', marginBottom: 32, animation: 'profileFadeIn 0.5s ease-out' }}>
            <div style={{ 
              width: 104, height: 104, borderRadius: '50%', margin: '0 auto 16px',
              padding: 4, background: 'linear-gradient(135deg, #e0e0e0, #f8f9fa)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.06)'
            }}>
              <div className="profile-avatar" style={{ margin: 0, width: '100%', height: '100%' }}>
                {user.photoURL
                  ? <img src={user.photoURL} alt="Avatar" />
                  : (user.displayName || user.email || '?')[0].toUpperCase()
                }
              </div>
            </div>
            <h2 style={{ color: '#111', fontSize: '1.4rem', fontWeight: 700, marginBottom: 4, letterSpacing: '-0.3px' }}>
              {user.displayName || 'Người dùng'}
            </h2>
            <p style={{ color: '#666', fontSize: '0.85rem' }}>{user.email}</p>
          </div>

          {/* Thông tin */}
          <div className="profile-card" style={{ animationDelay: '0.15s', padding: '12px 24px' }}>
            <div className="profile-info-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div className="profile-info-icon" style={{ background: '#f8f9fa' }}>
                  <User size={18} color="#444" />
                </div>
                <div style={{ fontSize: '0.85rem', color: '#666', fontWeight: 500 }}>Tên tài khoản</div>
              </div>
              <div style={{ fontSize: '0.95rem', color: '#111', fontWeight: 600 }}>{user.displayName}</div>
            </div>
            <div className="profile-info-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div className="profile-info-icon" style={{ background: '#f8f9fa' }}>
                  <AtSign size={18} color="#444" />
                </div>
                <div style={{ fontSize: '0.85rem', color: '#666', fontWeight: 500 }}>Email</div>
              </div>
              <div style={{ fontSize: '0.95rem', color: '#111', fontWeight: 600 }}>{user.email}</div>
            </div>
            {user.createdAt && (
              <div className="profile-info-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div className="profile-info-icon" style={{ background: '#f8f9fa' }}>
                    <Calendar size={18} color="#444" />
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#666', fontWeight: 500 }}>Ngày tham gia</div>
                </div>
                <div style={{ fontSize: '0.95rem', color: '#111', fontWeight: 600 }}>
                  {new Date(user.createdAt).toLocaleDateString('vi-VN')}
                </div>
              </div>
            )}
          </div>

          {/* Cài đặt */}
          <div className="profile-card" style={{ animationDelay: '0.2s', padding: '16px 24px', marginTop: 16 }}>
            <div className="profile-info-row" style={{ borderBottom: 'none', padding: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div className="profile-info-icon" style={{ background: '#f8f9fa' }}>
                  <Fingerprint size={18} color={biometricAvailable ? "#444" : "#ccc"} />
                </div>
                <div>
                  <div style={{ fontSize: '0.95rem', color: biometricAvailable ? '#111' : '#999', fontWeight: 600 }}>Khoá ứng dụng</div>
                  <div style={{ fontSize: '0.75rem', color: '#999', marginTop: 4 }}>
                    {biometricAvailable ? "Yêu cầu vân tay/khuôn mặt khi mở app" : "Thiết bị không hỗ trợ sinh trắc học"}
                  </div>
                </div>
              </div>
              
              <div 
                onClick={handleToggleBiometric}
                style={{
                  width: 44, height: 24, borderRadius: 12,
                  background: biometricEnabled ? '#111' : '#e0e0e0',
                  position: 'relative', cursor: biometricAvailable ? 'pointer' : 'not-allowed',
                  transition: 'background 0.3s',
                  opacity: biometricAvailable ? 1 : 0.5,
                  flexShrink: 0
                }}
              >
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', background: '#fff',
                  position: 'absolute', top: 2, left: biometricEnabled ? 22 : 2,
                  transition: 'left 0.3s', boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                }} />
              </div>
            </div>
          </div>

          {/* Nút đăng xuất */}
          <div style={{ padding: '20px 16px 0', animation: 'profileFadeIn 0.7s ease-out' }}>
            <button className="profile-btn-logout" onClick={logout}>
              <LogOut size={16} /> Đăng xuất
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ═══════ ĐĂNG NHẬP / ĐĂNG KÝ ═══════
  return (
    <div className="profile-root">
      <style>{profileStyles}</style>
      <div className="profile-bg" />


      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '20px 0' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24, animation: 'profileFadeIn 0.4s ease-out' }}>
          <div style={{
            width: 70, height: 70, borderRadius: '50%', margin: '0 auto 16px',
            background: '#111',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
            animation: 'profileFloat 3s ease-in-out infinite',
            transition: 'all 0.5s ease'
          }}>
            {mode === 'login'
              ? <LogIn size={30} color="#fff" />
              : <UserPlus size={30} color="#fff" />
            }
          </div>
          <h2 style={{ color: '#1e293b', fontSize: '1.4rem', fontWeight: 700, marginBottom: 4 }}>
            {mode === 'login' ? 'Chào mừng trở lại' : 'Tạo tài khoản'}
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
            {mode === 'login' ? 'Đăng nhập để tiếp tục hành trình' : 'Đăng ký miễn phí chỉ trong 30 giây'}
          </p>
        </div>

        {/* Thông báo */}
        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', margin: '0 16px 16px',
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: 12, color: '#ef4444', fontSize: '0.8rem',
            animation: 'profileFadeIn 0.3s ease-out'
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', margin: '0 16px 16px',
            background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)',
            borderRadius: 12, color: '#16a34a', fontSize: '0.8rem',
            animation: 'profileFadeIn 0.3s ease-out'
          }}>
            <CheckCircle size={16} style={{ flexShrink: 0 }} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={mode === 'login' ? handleLogin : handleRegister}>
          <div className="profile-card">

            {mode === 'register' && (
              <div style={{ position: 'relative', marginBottom: 14 }}>
                <User size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input className="profile-input" type="text" placeholder="Tên tài khoản"
                  value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                  required autoComplete="name"
                />
              </div>
            )}

            <div style={{ position: 'relative', marginBottom: 14 }}>
              <Mail size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input className="profile-input" type="email" placeholder="Email"
                value={email} onChange={(e) => setEmail(e.target.value)}
                required autoComplete="email"
              />
            </div>

            <div style={{ position: 'relative', marginBottom: 20 }}>
              <Lock size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input className="profile-input" type={showPassword ? 'text' : 'password'}
                placeholder={mode === 'register' ? 'Mật khẩu (ít nhất 6 ký tự)' : 'Mật khẩu'}
                value={password} onChange={(e) => setPassword(e.target.value)}
                style={{ paddingRight: 44 }}
                required minLength={6}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                  color: '#94a3b8', display: 'flex'
                }}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <button type="submit" className="profile-btn-primary" disabled={isSubmitting}>
              {isSubmitting ? (
                <div style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              ) : mode === 'login' ? (
                <><LogIn size={18} /> Đăng nhập</>
              ) : (
                <><UserPlus size={18} /> Đăng ký</>
              )}
            </button>

            <div style={{ textAlign: 'center', marginTop: 16 }}>
              {mode === 'login' ? (
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  Chưa có tài khoản?{' '}
                  <span className="profile-link" onClick={() => switchMode('register')}>Đăng ký ngay</span>
                  <br />
                  <span style={{ color: '#94a3b8', cursor: 'pointer', display: 'inline-block', marginTop: 10, fontSize: '0.75rem' }}
                    onClick={handleForgotPass}>
                    Quên mật khẩu?
                  </span>
                </span>
              ) : (
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  Đã có tài khoản?{' '}
                  <span className="profile-link" onClick={() => switchMode('login')}>Đăng nhập</span>
                </span>
              )}
            </div>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', margin: '18px 0 14px' }}>
              <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
              <span style={{ margin: '0 12px', fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>hoặc</span>
              <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
            </div>

            {/* OAuth Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button type="button" className="profile-btn-social profile-btn-google" onClick={loginWithGoogle}>
                <img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" alt="G" style={{ width: 18, height: 18 }} />
                Tiếp tục với Google
              </button>
              <button type="button" className="profile-btn-social profile-btn-fb" onClick={loginWithFacebook}>
                <img src="https://upload.wikimedia.org/wikipedia/commons/c/cd/Facebook_logo_%28square%29.png" alt="FB" style={{ width: 18, height: 18, borderRadius: 4 }} />
                Tiếp tục với Facebook
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
