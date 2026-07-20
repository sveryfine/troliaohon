// ═══════════════════════════════════════
//   FIREBASE CONFIGURATION
//   Thay thế các giá trị bên dưới bằng
//   thông tin từ Firebase Console của bạn
// ═══════════════════════════════════════

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyA3GOvRgn52IJtvsSzps-M1PapdHzxiRyc",
  authDomain: "stoon-b5746.firebaseapp.com",
  projectId: "stoon-b5746",
  storageBucket: "stoon-b5746.firebasestorage.app",
  messagingSenderId: "968691557486",
  appId: "1:968691557486:web:e1a9c7bc3b783b1e5ef27f",
  measurementId: "G-R8HKQ880CJ"
};

// Khởi tạo Firebase
const app = initializeApp(firebaseConfig);

// Xuất các dịch vụ
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;

// Hàm hỗ trợ nén ảnh và đẩy lên ImgBB (Thay thế cho Firebase Storage)
export const uploadImage = async (file) => {
  return new Promise((resolve, reject) => {
    // 1. Đọc file ảnh
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = async () => {
        // 2. Thiết lập Canvas để nén ảnh
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // Giới hạn chiều ngang tối đa là 1080px (chất lượng HD)
        const MAX_WIDTH = 1080;
        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // 3. Xuất ra định dạng WebP (siêu nhẹ) với chất lượng 80%
        const dataUrl = canvas.toDataURL('image/webp', 0.8);
        
        // 4. Upload lên ImgBB
        try {
          // dataUrl có dạng 'data:image/webp;base64,iVBOR...'
          // ImgBB API yêu cầu gửi base64 không có tiền tố
          const base64Image = dataUrl.split(',')[1];
          
          const formData = new FormData();
          formData.append("image", base64Image);
          
          const IMGBB_API_KEY = "8ea6e0ac000a6bbb111f820271f914ee";
          const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
            method: 'POST',
            body: formData
          });
          
          const result = await response.json();
          if (result.success) {
            // Trả về link ảnh trực tiếp
            resolve(result.data.url);
          } else {
            throw new Error(result.error.message);
          }
        } catch (error) {
          console.error("Lỗi khi upload ảnh lên ImgBB:", error);
          reject(error);
        }
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};
