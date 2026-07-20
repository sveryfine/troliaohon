import React, { useState, useContext, useEffect, useRef } from 'react';
import { PenLine, BookMarked, Settings, UserCircle, Lock } from 'lucide-react';
import { App as CapApp } from '@capacitor/app';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';
import { StoryProvider, StoryContext } from './store/StoryContext';
import { AuthProvider } from './store/AuthContext';
import WriteTab from './components/WriteTab';
import ReadTab from './components/ReadTab';
import EditTab from './components/EditTab';
import ProfileTab from './components/ProfileTab';
import './index.css';

function AppLockScreen({ onUnlocked }) {
  const handleUnlock = async () => {
    try {
      await NativeBiometric.verifyIdentity({
        reason: "Xác thực để mở ứng dụng",
        title: "Khóa ứng dụng",
        subtitle: "Sử dụng sinh trắc học hoặc mật khẩu máy để tiếp tục",
        useFallback: true,
      });
      onUnlocked();
    } catch (e) {
      console.error("Lỗi xác thực", e);
      alert("Xác thực thất bại, vui lòng thử lại.");
    }
  };

  useEffect(() => {
    handleUnlock();
  }, []);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8f9fa' }}>
      <div style={{ padding: 24, background: '#fff', borderRadius: '50%', boxShadow: '0 8px 30px rgba(0,0,0,0.1)', marginBottom: 24 }}>
        <Lock size={48} color="#111" />
      </div>
      <h2 style={{ fontSize: '1.4rem', fontWeight: 600, color: '#111', marginBottom: 12 }}>Ứng dụng đã khoá</h2>
      <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: 32 }}>Vui lòng xác minh danh tính để tiếp tục</p>
      <button 
        onClick={handleUnlock}
        style={{
          padding: '14px 28px', background: '#111', color: '#fff', borderRadius: 12, border: 'none',
          fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
        }}>
        Mở khoá ngay
      </button>
    </div>
  );
}

function AppContent() {
  const [isUnlocked, setIsUnlocked] = useState(localStorage.getItem('appLockEnabled') !== 'true');
  const [activeTab, setActiveTab] = useState('write');
  const { setEditingStoryId } = useContext(StoryContext);
  
  const navRef = useRef(null);
  const [navWidth, setNavWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 400);

  useEffect(() => {
    const appStateListener = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive && localStorage.getItem('appLockEnabled') === 'true') {
        setIsUnlocked(false);
      }
    });

    return () => {
      appStateListener.then(listener => listener.remove());
    };
  }, []);

  useEffect(() => {
    const updateWidth = () => {
      if (navRef.current) {
        setNavWidth(navRef.current.offsetWidth);
      }
    };
    updateWidth(); // Lấy width ngay sau render
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const tabs = ['write', 'read', 'edit', 'profile'];
  const activeIndex = tabs.indexOf(activeTab);

  // Tính toán rãnh khuyết ôm tròn hoàn hảo bằng Toán học Hình học (SVG Arc)
  const tabWidth = navWidth / 4;
  const cx = tabWidth ? (activeIndex + 0.5) * tabWidth : 0;
  
  const holeRadius = 24; // Bán kính rãnh (ôm vừa vặn nút 38px, tạo gap 5px)
  const holeY = 14; // Tọa độ tâm Y (đồng tâm với nút nổi)
  const cornerRadius = 10; // Bán kính vuốt góc ở miệng rãnh

  // Tính điểm giao cắt (tiếp điểm) giữa góc bo và rãnh tròn
  const distCenters = holeRadius + cornerRadius;
  const dy = holeY - cornerRadius;
  const dx = Math.sqrt(distCenters * distCenters - dy * dy);
  
  // Tọa độ tiếp điểm tương đối
  const tx = (cornerRadius / distCenters) * dx;
  const ty = (cornerRadius / distCenters) * dy;
  
  const startX = cx - dx; // Bắt đầu lõm xuống
  const endX = cx + dx; // Kết thúc lõm
  
  const p1x = startX + tx; // Tiếp điểm trái (Tọa độ tuyệt đối)
  const p1y = cornerRadius + ty;
  const p2x = endX - tx; // Tiếp điểm phải (Tọa độ tuyệt đối)
  const p2y = cornerRadius + ty;

  // SVG Path: Đường thẳng -> Cung bo tròn xuống -> Cung tròn lõm -> Cung bo tròn lên -> Đường thẳng
  const liquidPath = navWidth ? `
    M 0,0 
    L ${startX},0
    A ${cornerRadius},${cornerRadius} 0 0,1 ${p1x},${p1y}
    A ${holeRadius},${holeRadius} 0 0,0 ${p2x},${p2y}
    A ${cornerRadius},${cornerRadius} 0 0,1 ${endX},0
    L ${navWidth},0
    L ${navWidth},200
    L 0,200
    Z
  ` : "";

  if (!isUnlocked) {
    return <AppLockScreen onUnlocked={() => setIsUnlocked(true)} />;
  }

  return (
    <div 
      className="app-container"
      style={{
        background: activeTab === 'profile' ? '#f8f9fa' : 'transparent',
        transition: 'background 0.4s ease'
      }}
    >
      <div className="tab-content">
          {activeTab === 'write' && <WriteTab />}
          {activeTab === 'read' && <ReadTab />}
          {activeTab === 'edit' && <EditTab setActiveTab={setActiveTab} />}
          {activeTab === 'profile' && <ProfileTab />}
        </div>

      <div 
        className="bottom-nav" 
        ref={navRef}
        style={{
          '--accent': activeTab === 'profile' ? '#111' : '',
          '--bg-primary': activeTab === 'profile' ? '#f8f9fa' : ''
        }}
      >
        {/* Nền SVG chất lỏng (thay thế cho thanh cứng và tai cắt) */}
        <div className="nav-liquid-bg">
          <svg width="100%" height="100%" preserveAspectRatio="none">
            <path 
              d={liquidPath} 
              fill="var(--accent)" 
              style={{ transition: 'd 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)' }} 
            />
          </svg>
        </div>

        {/* Nút nổi trượt trên rãnh nước */}
        <div className="nav-indicator" style={{ transform: `translateX(calc(${activeIndex * 100}%))` }}>
          <div className="nav-floating-btn"></div>
        </div>
        
        <button 
          className={`tab-btn ${activeTab === 'write' ? 'active' : ''}`}
          onClick={() => { setActiveTab('write'); setEditingStoryId(null); }}
        >
          <span className="icon-wrapper"><PenLine size={20} /></span>
        </button>
        
        <button 
          className={`tab-btn ${activeTab === 'read' ? 'active' : ''}`}
          onClick={() => setActiveTab('read')}
        >
          <span className="icon-wrapper"><BookMarked size={20} /></span>
        </button>
        
        <button 
          className={`tab-btn ${activeTab === 'edit' ? 'active' : ''}`}
          onClick={() => setActiveTab('edit')}
        >
          <span className="icon-wrapper"><Settings size={20} /></span>
        </button>
        
        <button 
          className={`tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          <span className="icon-wrapper"><UserCircle size={20} /></span>
        </button>
      </div>
      </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <StoryProvider>
        <AppContent />
      </StoryProvider>
    </AuthProvider>
  );
}

export default App;
