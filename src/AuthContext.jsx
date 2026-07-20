import React, { createContext, useState, useEffect, useContext } from 'react';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  updateProfile,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithPopup,
  signInWithCredential,
  GoogleAuthProvider,
  FacebookAuthProvider
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

export const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Lắng nghe trạng thái đăng nhập
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Không đá văng user nữa, lưu trạng thái emailVerified để UI xử lý
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          const baseData = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            emailVerified: firebaseUser.emailVerified,
            photoURL: firebaseUser.photoURL,
            providers: firebaseUser.providerData ? firebaseUser.providerData.map(p => p.providerId) : []
          };
          if (userDoc.exists()) {
            setUser({ ...baseData, displayName: userDoc.data().displayName || firebaseUser.displayName, ...userDoc.data() });
          } else {
            setUser(baseData);
          }
        } catch (err) {
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            emailVerified: firebaseUser.emailVerified,
            photoURL: firebaseUser.photoURL,
            providers: firebaseUser.providerData ? firebaseUser.providerData.map(p => p.providerId) : []
          });
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Đăng ký tài khoản mới
  const register = async (email, password, displayName) => {
    setError('');
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      
      // Cập nhật tên hiển thị
      await updateProfile(result.user, { displayName });

      // Gửi email xác thực
      await sendEmailVerification(result.user);

      // Lưu thông tin user vào Firestore
      await setDoc(doc(db, 'users', result.user.uid), {
        email,
        displayName,
        createdAt: new Date().toISOString(),
        uid: result.user.uid
      });

      return { success: true };
    } catch (err) {
      let message = 'Đã xảy ra lỗi. Vui lòng thử lại.';
      switch (err.code) {
        case 'auth/email-already-in-use':
          message = 'Email này đã được đăng ký. Vui lòng đăng nhập.';
          break;
        case 'auth/weak-password':
          message = 'Mật khẩu phải có ít nhất 6 ký tự.';
          break;
        case 'auth/invalid-email':
          message = 'Địa chỉ email không hợp lệ.';
          break;
        default:
          message = err.message;
      }
      setError(message);
      return { success: false, message };
    }
  };

  // Đăng nhập
  const login = async (email, password) => {
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // Không gọi signOut ở đây nữa, để UI xử lý "Chờ xác thực"
      return { success: true };
    } catch (err) {
      let message = 'Đã xảy ra lỗi. Vui lòng thử lại.';
      switch (err.code) {
        case 'auth/user-not-found':
        case 'auth/invalid-credential':
          message = 'Tài khoản không tồn tại hoặc mật khẩu sai.';
          break;
        case 'auth/wrong-password':
          message = 'Mật khẩu không đúng.';
          break;
        case 'auth/invalid-email':
          message = 'Địa chỉ email không hợp lệ.';
          break;
        case 'auth/too-many-requests':
          message = 'Quá nhiều lần thử. Vui lòng đợi một lát.';
          break;
        default:
          message = err.message;
      }
      setError(message);
      return { success: false, message, code: err.code };
    }
  };

  // Đăng nhập bằng Google
  const loginWithGoogle = async () => {
    setError('');
    try {
      let result;
      if (Capacitor.isNativePlatform()) {
        GoogleAuth.initialize({
          clientId: '968691557486-qa6hpffpcqpghu443ppg8trhptmtsea8.apps.googleusercontent.com',
          scopes: ['profile', 'email'],
          grantOfflineAccess: true,
        });
        const googleUser = await GoogleAuth.signIn();
        const credential = GoogleAuthProvider.credential(googleUser.authentication.idToken);
        result = await signInWithCredential(auth, credential);
      } else {
        const provider = new GoogleAuthProvider();
        result = await signInWithPopup(auth, provider);
      }
      
      // Kiểm tra xem đã có trong Firestore chưa, nếu chưa thì tạo mới
      const userDoc = await getDoc(doc(db, 'users', result.user.uid));
      if (!userDoc.exists()) {
        await setDoc(doc(db, 'users', result.user.uid), {
          email: result.user.email,
          displayName: result.user.displayName,
          photoURL: result.user.photoURL || '',
          createdAt: new Date().toISOString(),
          uid: result.user.uid
        });
      } else if (result.user.photoURL && !userDoc.data().photoURL) {
        // Cập nhật thêm ảnh nếu tài khoản cũ chưa có ảnh
        await setDoc(doc(db, 'users', result.user.uid), { photoURL: result.user.photoURL }, { merge: true });
      }
      return { success: true };
    } catch (err) {
      setError(err.message);
      return { success: false, message: err.message };
    }
  };

  // Đăng nhập bằng Facebook
  const loginWithFacebook = async () => {
    setError('');
    try {
      const provider = new FacebookAuthProvider();
      const result = await signInWithPopup(auth, provider);
      
      const userDoc = await getDoc(doc(db, 'users', result.user.uid));
      if (!userDoc.exists()) {
        await setDoc(doc(db, 'users', result.user.uid), {
          email: result.user.email,
          displayName: result.user.displayName,
          photoURL: result.user.photoURL || '',
          createdAt: new Date().toISOString(),
          uid: result.user.uid
        });
      } else if (result.user.photoURL && !userDoc.data().photoURL) {
        await setDoc(doc(db, 'users', result.user.uid), { photoURL: result.user.photoURL }, { merge: true });
      }
      return { success: true };
    } catch (err) {
      if (err.code === 'auth/account-exists-with-different-credential') {
        setError('Email này đã được đăng ký bằng phương thức khác (Vd: Google hoặc Mật khẩu). Vui lòng đăng nhập bằng phương thức đó.');
      } else {
        setError(err.message);
      }
      return { success: false, message: err.message };
    }
  };

  // Đăng xuất
  const logout = async () => {
    setError('');
    try {
      await signOut(auth);
    } catch (err) {
      setError('Không thể đăng xuất. Thử lại sau.');
    }
  };

  // Quên mật khẩu
  const resetPassword = async (email) => {
    setError('');
    try {
      await sendPasswordResetEmail(auth, email);
      return { success: true };
    } catch (err) {
      let message = 'Không thể gửi email khôi phục. Vui lòng thử lại.';
      if (err.code === 'auth/invalid-email') message = 'Địa chỉ email không hợp lệ.';
      if (err.code === 'auth/user-not-found') message = 'Email này chưa được đăng ký.';
      setError(message);
      return { success: false, message };
    }
  };

  // Gửi lại email xác thực
  const resendVerification = async () => {
    if (auth.currentUser) {
      await sendEmailVerification(auth.currentUser);
    }
  };

  // Nạp lại trạng thái user từ server (để check xem đã click link chưa)
  const reloadVerificationState = async () => {
    if (auth.currentUser) {
      await auth.currentUser.reload();
      if (auth.currentUser.emailVerified) {
        setUser(prev => ({ ...prev, emailVerified: true }));
        return true;
      }
    }
    return false;
  };

  const clearError = () => setError('');

  return (
    <AuthContext.Provider value={{ 
      user, loading, error, 
      register, login, loginWithGoogle, loginWithFacebook, logout, resetPassword, clearError,
      resendVerification, reloadVerificationState
    }}>
      {children}
    </AuthContext.Provider>
  );
};
