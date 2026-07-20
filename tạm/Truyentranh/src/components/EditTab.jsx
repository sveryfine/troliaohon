import React, { useContext, useState, useRef } from 'react';
import { StoryContext } from '../store/StoryContext';
import { Edit2, PenLine, BookOpen, User, FileText, Tag, Eye, X, ArrowLeft, Trash2 } from 'lucide-react';
import HTMLFlipBook from 'react-pageflip';
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { uploadImage } from '../firebase';
import WriteTab from './WriteTab';

export default function EditTab({ setActiveTab }) {
  const { stories, updateStory, deleteStory, setEditingStoryId } = useContext(StoryContext);
  const [readingStory, setReadingStory] = useState(null);
  const [isEditingInManage, setIsEditingInManage] = useState(false);
  const [storyToDelete, setStoryToDelete] = useState(null);
  const bookRef = useRef();

  const handleEditStory = (storyId) => {
    setEditingStoryId(storyId);
    setIsEditingInManage(true);
  };

  const handleUpdateCover = async (storyId, e) => {
    const file = e.target.files[0];
    if (file) {
      try {
        // Tải ảnh lên Firebase Storage với thư mục 'covers'
        const url = await uploadImage(file, 'covers');
        const story = stories.find(s => s.id === storyId);
        await updateStory(storyId, { ...story, cover: url });
      } catch (error) {
        console.error('Lỗi cập nhật cover:', error);
        alert("Lỗi tải ảnh. Vui lòng thử lại.");
      }
    }
  };

  if (isEditingInManage) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <WriteTab onBack={() => { setIsEditingInManage(false); setEditingStoryId(null); }} />
        </div>
      </div>
    );
  }

  // === Flipbook Reader ===
  if (readingStory) {
    return (
      <div className="flipbook-container">
        <button className="close-btn" onClick={() => setReadingStory(null)}>
          <X size={17} />
        </button>
        
        <div className="flipbook-wrapper">
          <TransformWrapper
            initialScale={1} minScale={1} maxScale={4}
            wheel={{ step: 0.1 }} pinch={{ step: 5 }}
            doubleClick={{ disabled: true }}
          >
            <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }} contentStyle={{ width: '100%', height: '100%' }}>
              <HTMLFlipBook 
                width={360} height={780} size="stretch"
                minWidth={300} maxWidth={2000} minHeight={400} maxHeight={3000}
                maxShadowOpacity={0.5} mobileScrollSupport={true}
                flippingTime={600} ref={bookRef}
              >
                {/* Cover */}
                <div className="demoPage" style={{ position: 'relative', overflow: 'hidden', backgroundColor: '#000' }}>
                  <div style={{
                    position: 'absolute', top: -20, left: -20, right: -20, bottom: -20,
                    backgroundImage: `url(${readingStory.cover || 'https://via.placeholder.com/360x780.png?text=No+Cover'})`,
                    backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(15px)', opacity: 0.4
                  }} />
                  <img src={readingStory.cover || 'https://via.placeholder.com/360x780.png?text=No+Cover'} alt="cover" style={{ width: '100%', height: '100%', objectFit: 'contain', position: 'relative', zIndex: 1 }} />
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.85))', padding: '60px 16px 20px 16px', zIndex: 2 }}>
                    <p style={{ margin: 0, fontFamily: "'Playfair Display', Georgia, serif", fontSize: '0.85rem', letterSpacing: '1px', color: 'rgba(255,255,255,0.95)', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {readingStory.title} <span style={{ margin: '0 6px', opacity: 0.5 }}>|</span> {readingStory.author || 'Khuyết danh'}
                    </p>
                  </div>
                </div>

                {/* Pages */}
                {readingStory.pages.map((page, index) => (
                  <div key={page.id} className="demoPage">
                    <div className="paper" style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', flexShrink: 1 }}>
                      <div className="paper-content">
                        {page.elements.map(el => {
                          if (el.type === 'image') {
                            return (
                              <img key={el.id} src={el.src} alt="" style={{
                                position: 'absolute', left: el.x, top: el.y,
                                width: el.width, height: el.height, objectFit: 'cover',
                                transform: el.rotation ? `rotate(${el.rotation}deg)` : 'none',
                                borderRadius: 4, zIndex: 5,
                              }} />
                            );
                          }
                          if (el.type === 'text') {
                            const hasChar = el.content.includes(':');
                            const parts = hasChar ? el.content.split(':') : null;
                            const charName = parts ? parts[0].trim() : null;
                            const charText = parts ? parts.slice(1).join(':').trim() : el.content;

                            return (
                              <div key={el.id} style={{ position: 'relative', zIndex: 10 }}>
                                {hasChar ? (
                                  (charName?.trim().toLowerCase() === 'người dẫn truyện' || charName?.trim().toLowerCase() === 'nguoi dan truyen') ? (
                                    <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '13px', color: el.color || '#6e4c2f' }}>
                                      <em>{charText}</em>
                                    </div>
                                  ) : (
                                    <div>
                                      <span style={{ fontFamily: "'Playfair Display', serif", fontSize: '12px', fontWeight: 700, color: '#8a5c20', marginRight: '6px' }}>
                                        {charName}:
                                      </span>
                                      <span style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: '13px', color: el.color || '#2c1a0e' }}>
                                        {charText}
                                      </span>
                                    </div>
                                  )
                                ) : (
                                  <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '13px', color: el.color || '#6e4c2f' }}>
                                    <em>{charText}</em>
                                  </div>
                                )}
                              </div>
                            );
                          }
                          return null;
                        })}
                      </div>
                      <div className="paper-page-number">— {index + 1} —</div>
                    </div>
                  </div>
                ))}

                {/* End page */}
                <div className="demoPage">
                  <div style={{
                    width: '100%', height: '100%', backgroundColor: '#fdf8f0',
                    backgroundImage: 'linear-gradient(rgba(180, 150, 100, 0.07) 1px, transparent 1px)',
                    backgroundSize: '100% 21.6px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    position: 'relative', overflow: 'hidden', borderLeft: '4px solid #c9a96e',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <span style={{ display: 'inline-block', width: 40, height: 1, background: 'linear-gradient(to right, transparent, #c9a96e)' }}></span>
                      <BookOpen size={16} color="#c9a96e" style={{ opacity: 0.6 }} />
                      <span style={{ display: 'inline-block', width: 40, height: 1, background: 'linear-gradient(to left, transparent, #c9a96e)' }}></span>
                    </div>
                    <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '1.1rem', fontStyle: 'italic', color: '#6e4c2f', margin: '0 0 4px 0', letterSpacing: '2px' }}>
                      — Hết —
                    </p>
                    <p style={{ fontFamily: "'Lora', Georgia, serif", fontSize: '0.65rem', color: '#a08060', margin: '0 0 16px 0', letterSpacing: '1px' }}>
                      Cảm ơn bạn đã đọc
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ display: 'inline-block', width: 30, height: 1, background: 'linear-gradient(to right, transparent, #c9a96e)' }}></span>
                      <span style={{ fontSize: '8px', color: '#c9a96e' }}>❦</span>
                      <span style={{ display: 'inline-block', width: 30, height: 1, background: 'linear-gradient(to left, transparent, #c9a96e)' }}></span>
                    </div>
                    <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '0.55rem', color: '#b09070', margin: '20px 0 0 0', textAlign: 'center', lineHeight: 1.6 }}>
                      {readingStory.title}<br />
                      <span style={{ opacity: 0.7 }}>{readingStory.author || 'Khuyết danh'}</span>
                    </p>
                  </div>
                </div>
              </HTMLFlipBook>
            </TransformComponent>
          </TransformWrapper>
        </div>
      </div>
    );
  }

  // === Management List ===
  return (
    <div style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="section-header">
        <h2>Quản Lý</h2>
        <span className="badge">{stories.length} truyện</span>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {stories.map((story, i) => (
          <div 
            key={story.id} 
            className="animate-in" 
            style={{ 
              display: 'flex', gap: 14, alignItems: 'center',
              padding: '14px 4px',
              borderBottom: '1px solid rgba(139, 94, 60, 0.1)',
              animationDelay: `${i * 0.06}s`,
            }}
          >
            {/* Cover thumbnail */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <img 
                src={story.cover || 'https://via.placeholder.com/300x400.png?text=No+Cover'} 
                alt="cover" 
                onClick={() => setReadingStory(story)}
                style={{ 
                  width: 52, height: 70, objectFit: 'cover', borderRadius: 5,
                  border: '1px solid rgba(139, 94, 60, 0.15)', cursor: 'pointer'
                }}
              />
              <label style={{ 
                position: 'absolute', bottom: -3, right: -3, 
                background: 'rgba(139, 94, 60, 0.75)', 
                padding: 3, borderRadius: '50%', cursor: 'pointer', color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Edit2 size={8} />
                <input type="file" hidden accept="image/*" onChange={(e) => handleUpdateCover(story.id, e)} />
              </label>
            </div>
            
            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{ 
                margin: '0 0 6px 0', fontSize: '1.05rem', fontWeight: 600, 
                color: 'var(--text-primary)', lineHeight: 1.3,
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                overflow: 'hidden', textOverflow: 'ellipsis'
              }}>
                {story.title}
              </h3>
              <div style={{ 
                fontSize: '0.65rem', color: 'var(--text-muted)', 
                display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
              }}>
                <User size={9} />
                <span>{story.author || 'Khuyết danh'}</span>
                <span style={{ opacity: 0.3 }}>·</span>
                <FileText size={9} />
                <span>{story.pages?.length || 0} trang</span>
                {story.genre && (
                  <>
                    <span style={{ opacity: 0.3 }}>·</span>
                    <Tag size={9} />
                    <span>{story.genre}</span>
                  </>
                )}
              </div>
            </div>
            
            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flexShrink: 0, justifyContent: 'center' }}>
              <button 
                onClick={() => handleEditStory(story.id)}
                style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
                title="Sửa nội dung"
              >
                <PenLine size={16} />
              </button>
              <button 
                onClick={() => setStoryToDelete(story)}
                style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#e74c3c', display: 'flex' }}
                title="Xóa truyện"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
        {stories.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">
              <BookOpen size={28} />
            </div>
            <p>Bạn chưa có truyện nào.<br/>Hãy qua tab <strong>Sáng Tác</strong> để bắt đầu!</p>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {storyToDelete && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(4px)', padding: 20
        }}>
          <div className="animate-in" style={{
            background: 'var(--bg-card)', padding: '24px', borderRadius: '16px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.2)', width: '100%', maxWidth: '340px',
            textAlign: 'center', border: '1px solid rgba(139, 94, 60, 0.2)'
          }}>
            <div style={{ 
              width: 50, height: 50, borderRadius: '25px', background: 'rgba(231, 76, 60, 0.1)', 
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
              color: '#e74c3c'
            }}>
              <Trash2 size={24} />
            </div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', color: 'var(--text-primary)' }}>
              Xóa Truyện?
            </h3>
            <p style={{ margin: '0 0 24px 0', fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Bạn có chắc chắn muốn xóa <strong>{storyToDelete.title}</strong>? Thao tác này không thể hoàn tác.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button 
                onClick={() => setStoryToDelete(null)}
                style={{ 
                  flex: 1, padding: '10px 0', borderRadius: '8px', border: 'none', 
                  background: 'rgba(139, 94, 60, 0.1)', color: 'var(--text-primary)', 
                  fontWeight: 600, cursor: 'pointer' 
                }}
              >
                Hủy
              </button>
              <button 
                onClick={async () => {
                  await deleteStory(storyToDelete.id);
                  setStoryToDelete(null);
                }}
                style={{ 
                  flex: 1, padding: '10px 0', borderRadius: '8px', border: 'none', 
                  background: '#e74c3c', color: 'white', 
                  fontWeight: 600, cursor: 'pointer' 
                }}
              >
                Xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
