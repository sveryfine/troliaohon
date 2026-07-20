import React, { createContext, useState, useEffect, useContext } from 'react';
import { 
  collection, doc, addDoc, updateDoc, deleteDoc, 
  query, where, onSnapshot 
} from 'firebase/firestore';
import { db } from '../firebase';
import { AuthContext } from './AuthContext';

export const StoryContext = createContext();

export const StoryProvider = ({ children }) => {
  const [stories, setStories] = useState([]);
  const [editingStoryId, setEditingStoryId] = useState(null);
  const [loading, setLoading] = useState(true);

  // Lấy trạng thái user từ AuthContext
  const authContext = useContext(AuthContext);
  const user = authContext?.user;
  const authLoading = authContext?.loading;

  // Xử lý tải dữ liệu tùy theo trạng thái đăng nhập
  useEffect(() => {
    if (authLoading) return; // Chờ Firebase Auth khởi tạo xong

    if (user) {
      // ĐÃ ĐĂNG NHẬP: Tải truyện của riêng tài khoản này từ Firestore
      setLoading(true);
      const storiesRef = collection(db, 'stories');
      // Lọc truyện chỉ thuộc về user này
      const q = query(storiesRef, where('authorUid', '==', user.uid));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const storiesData = snapshot.docs.map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data()
        }));
        
        // Sắp xếp truyện mới nhất lên đầu (xử lý ở JS để khỏi phải tạo Index trên Firestore)
        storiesData.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        setStories(storiesData);
        setLoading(false);
      }, (error) => {
        console.error('Lỗi đọc stories từ Firestore:', error);
        setLoading(false);
      });

      return () => unsubscribe();
    } else {
      // CHƯA ĐĂNG NHẬP: Tải truyện từ LocalStorage (Máy hiện tại)
      setLoading(true);
      try {
        const localData = localStorage.getItem('local_stories');
        if (localData) {
          setStories(JSON.parse(localData));
        } else {
          setStories([]);
        }
      } catch (err) {
        console.error('Lỗi đọc local_stories:', err);
        setStories([]);
      }
      setLoading(false);
    }
  }, [user, authLoading]);

  // Hàm hỗ trợ lưu LocalStorage
  const saveLocalStories = (newStories) => {
    setStories(newStories);
    localStorage.setItem('local_stories', JSON.stringify(newStories));
  };

  // Thêm truyện mới
  const addStory = async (newStory) => {
    const storyData = {
      ...newStory,
      createdAt: new Date().toISOString(),
      authorUid: user?.uid || 'local',
      authorEmail: user?.email || '',
    };

    if (user) {
      // Lưu lên Mây
      delete storyData.id;
      const docRef = await addDoc(collection(db, 'stories'), storyData);
      return docRef.id;
    } else {
      // Lưu cục bộ LocalStorage
      storyData.id = 'local_' + Date.now();
      saveLocalStories([storyData, ...stories]);
      return storyData.id;
    }
  };

  // Cập nhật truyện
  const updateStory = async (id, updatedStory) => {
    if (user) {
      // Sửa trên Mây
      const storyRef = doc(db, 'stories', id);
      const dataToUpdate = { ...updatedStory };
      delete dataToUpdate.id;
      await updateDoc(storyRef, dataToUpdate);
    } else {
      // Sửa cục bộ
      const newStories = stories.map(s => s.id === id ? { ...s, ...updatedStory } : s);
      saveLocalStories(newStories);
    }
  };

  // Xóa truyện
  const deleteStory = async (id) => {
    if (user) {
      // Xóa trên Mây
      await deleteDoc(doc(db, 'stories', id));
    } else {
      // Xóa cục bộ
      const newStories = stories.filter(s => s.id !== id);
      saveLocalStories(newStories);
    }
  };

  return (
    <StoryContext.Provider value={{ 
      stories, addStory, updateStory, deleteStory,
      editingStoryId, setEditingStoryId, loading 
    }}>
      {children}
    </StoryContext.Provider>
  );
};
