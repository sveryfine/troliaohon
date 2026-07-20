import React, { useContext, useState, useRef } from 'react';
import { StoryContext } from '../store/StoryContext';
import { Search, Filter, X, BookOpen, Clock, User, FileText, ArrowDown, ArrowUp, BookMarked } from 'lucide-react';
import HTMLFlipBook from 'react-pageflip';
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
const PAGE_WIDTH = 360;

const getPageHeight = () => {
  if (typeof window === 'undefined') return 780;
  let ratio = window.innerHeight / window.innerWidth;
  if (ratio < 1.01) ratio = 1.01;
  return PAGE_WIDTH * ratio;
};

export default function ReadTab() {
  const { stories } = useContext(StoryContext);
  const [searchTerm, setSearchTerm] = useState('');
  const [readingStory, setReadingStory] = useState(null);
  const [sortBy, setSortBy] = useState('time_desc');
  const [filterAuthor, setFilterAuthor] = useState('All');
  const [filterPageCount, setFilterPageCount] = useState('All');
  const [filterMonthYear, setFilterMonthYear] = useState('All');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const [initialScale, setInitialScale] = useState(1);
  const [pageHeight, setPageHeight] = useState(getPageHeight());
  const [layoutScale, setLayoutScale] = useState(1);
  
  const bookRef = useRef();
  const touchStartX = useRef(0);

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const handleResize = () => {
        const newPageHeight = getPageHeight();
        setPageHeight(newPageHeight);
        setLayoutScale(window.innerHeight / newPageHeight);
      };
      handleResize();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  const allAuthors = [...new Set(stories.map(s => s.author || 'Ẩn danh'))].filter(Boolean);
  const allMonths = [...new Set(stories.map(s => {
    if (!s.id || !s.id.startsWith('s')) return null;
    const timestamp = parseInt(s.id.substring(1), 10);
    if (isNaN(timestamp)) return null;
    const d = new Date(timestamp);
    return `Tháng ${d.getMonth() + 1}/${d.getFullYear()}`;
  }))].filter(Boolean);

  const sortedStories = [...stories].sort((a, b) => {
    switch(sortBy) {
      case 'author':
        return (a.author || '').localeCompare(b.author || '');
      case 'time_desc':
        return String(b.id).localeCompare(String(a.id));
      case 'pages':
        return (b.pages?.length || 0) - (a.pages?.length || 0);
      case 'name_asc':
        return (a.title || '').localeCompare(b.title || '');
      case 'name_desc':
        return (b.title || '').localeCompare(a.title || '');
      default:
        return 0;
    }
  });

  const filteredStories = sortedStories.filter(s => {
    const matchesSearch = (s.title || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (s.author || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesAuthor = filterAuthor === 'All' || (s.author || 'Ẩn danh') === filterAuthor;
    
    let matchesPages = true;
    const pageCount = s.pages?.length || 0;
    if (filterPageCount === '1-5') matchesPages = pageCount <= 5;
    else if (filterPageCount === '6-10') matchesPages = pageCount > 5 && pageCount <= 10;
    else if (filterPageCount === '10+') matchesPages = pageCount > 10;

    let matchesMonth = true;
    if (filterMonthYear !== 'All') {
      if (s.id && s.id.startsWith('s')) {
        const timestamp = parseInt(s.id.substring(1), 10);
        if (!isNaN(timestamp)) {
          const d = new Date(timestamp);
          matchesMonth = `Tháng ${d.getMonth() + 1}/${d.getFullYear()}` === filterMonthYear;
        } else matchesMonth = false;
      } else matchesMonth = false;
    }

    return matchesSearch && matchesAuthor && matchesPages && matchesMonth;
  });

  const renderFlipbook = () => {
    if (!readingStory || !initialScale) return null;
    return (
      <div className="flipbook-container">
        <button className="close-btn" onClick={() => setReadingStory(null)}>
          <X size={17} />
        </button>
        
        <div className="flipbook-wrapper">
          <TransformWrapper
            initialScale={initialScale}
            minScale={initialScale}
            maxScale={initialScale * 4}
            wheel={{ step: 0.1 }}
            pinch={{ step: 5 }}
            doubleClick={{ disabled: true }}
            limitToBounds={true}
            centerZoomedOut={true}
            panning={{ disabled: zoomScale <= initialScale * 1.05, velocityDisabled: false }}
            swipe={{ disabled: true }}
            onTransformed={(ref) => setZoomScale(ref.state.scale)}
          >
            <TransformComponent wrapperStyle={{ width: '100vw', height: '100vh', touchAction: 'none' }} contentStyle={{ width: '100vw', height: '100vh', touchAction: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div 
                style={{ width: '100vw', height: '100vh', position: 'relative', backgroundColor: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onTouchStart={(e) => { touchStartX.current = e.changedTouches[0].screenX; }}
                onTouchEnd={(e) => {
                  const diffX = e.changedTouches[0].screenX - touchStartX.current;
                  if (Math.abs(diffX) > 20) {
                    if (diffX > 0) bookRef.current?.pageFlip().flipPrev();
                    else bookRef.current?.pageFlip().flipNext();
                  }
                }}
                onMouseDown={(e) => { touchStartX.current = e.clientX; }}
                onMouseUp={(e) => {
                  const diffX = e.clientX - touchStartX.current;
                  if (Math.abs(diffX) > 20) {
                    if (diffX > 0) bookRef.current?.pageFlip().flipPrev();
                    else bookRef.current?.pageFlip().flipNext();
                  } else {
                    const clickX = e.clientX;
                    const width = window.innerWidth;
                    if (clickX < width * 0.4) bookRef.current?.pageFlip().flipPrev();
                    else if (clickX > width * 0.6) bookRef.current?.pageFlip().flipNext();
                  }
                }}
              >
                <div style={{ zoom: layoutScale, width: PAGE_WIDTH, height: pageHeight }}>
                  <HTMLFlipBook 
                    width={PAGE_WIDTH} 
                    height={pageHeight} 
                    size="fixed"
                    minWidth={100}
                    maxWidth={5000}
                    minHeight={100}
                    maxHeight={5000}
                    usePortrait={true}
                    showCover={true}
                    maxShadowOpacity={0.15}
                    mobileScrollSupport={false}
                    flippingTime={400}
                    useMouseEvents={false}
                    ref={bookRef}
                  >
          {/* Cover Page */}
          <div className="demoPage" style={{ position: 'relative', overflow: 'hidden', backgroundColor: '#000' }}>
            <div style={{
              position: 'absolute', top: -20, left: -20, right: -20, bottom: -20,
              backgroundImage: `url(${readingStory.cover || 'https://via.placeholder.com/360x780.png?text=No+Cover'})`,
              backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(15px)', opacity: 0.4
            }} />
            <img src={readingStory.cover || 'https://via.placeholder.com/360x780.png?text=No+Cover'} alt="cover" style={{ width: '100%', height: '100%', objectFit: 'contain', position: 'relative', zIndex: 1 }} />
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.85))', padding: '60px 16px 20px 16px', zIndex: 2 }}>
              <p style={{ 
                margin: 0, fontFamily: "'Playfair Display', Georgia, serif", 
                fontSize: '0.85rem', letterSpacing: '1px',
                color: 'rgba(255,255,255,0.95)', textAlign: 'center',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
              }}>
                {readingStory.title} <span style={{ margin: '0 6px', opacity: 0.5 }}>|</span> {readingStory.author || 'Khuyết danh'}
              </p>
            </div>
          </div>
          
          {/* Story Pages */}
          {readingStory.pages.map((page, index) => (
            <div key={page.id} className="demoPage">
              <div className="paper" style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', flexShrink: 1 }}>
                <div className="paper-content">
                {page.elements.map(el => {
                  if (el.type === 'image') {
                    return (
                      <div key={el.id} style={{ 
                        position: 'absolute', left: el.x, top: el.y, width: el.width, height: el.height, zIndex: 1,
                      }}>
                        <div style={{ 
                          width: '100%', height: '100%',
                          transform: `rotate(${el.rotation || 0}deg)`,
                          transformOrigin: 'center center',
                        }}>
                          <img src={el.src} alt="img" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4 }} />
                        </div>
                      </div>
                    );
                  }
                  if (el.type === 'text') {
                    const allKnownChars = [...(readingStory.characters || []), 'Người Dẫn Truyện', 'Nguoi Dan Truyen'].sort((a, b) => b.length - a.length);
                    let normalTextBefore = "";
                    let charName = null;
                    let charText = el.content;
                    let hasChar = false;
                    
                    for (const c of allKnownChars) {
                        const matchStr = c + ":";
                        const idx = el.content.indexOf(matchStr);
                        if (idx !== -1) {
                            hasChar = true;
                            normalTextBefore = el.content.substring(0, idx);
                            charName = c;
                            charText = el.content.substring(idx + matchStr.length);
                            break;
                        }
                    }

                    return (
                      <React.Fragment key={el.id}>
                        {hasChar ? (
                          (charName?.trim().toLowerCase() === 'người dẫn truyện' || charName?.trim().toLowerCase() === 'nguoi dan truyen') ? (
                            <span style={{
                              fontSize: '13px',
                              color: el.color || '#6e4c2f',
                            }}>
                              {normalTextBefore}<em style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>{charText}</em>
                            </span>
                          ) : (
                            <span>
                              {normalTextBefore && <span style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: '13px', color: el.color || '#2c1a0e' }}>{normalTextBefore}</span>}
                              <span style={{
                                fontFamily: "'Playfair Display', serif",
                                fontSize: '12px',
                                fontWeight: 700,
                                color: '#8a5c20',
                                marginRight: '6px',
                              }}>
                                {charName}:
                              </span>
                              <span style={{
                                fontFamily: "Georgia, 'Times New Roman', serif",
                                fontSize: '13px',
                                color: el.color || '#2c1a0e',
                              }}>
                                {charText}
                              </span>
                            </span>
                          )
                        ) : (
                          <span style={{
                            fontSize: '13px',
                            color: el.color || '#6e4c2f',
                          }}>
                            <em>{charText}</em>
                          </span>
                        )}
                        {index < page.elements.filter(e => e.type === 'text').length - 1 && <br />}
                      </React.Fragment>
                    );
                  }
                  return null;
                })}
              </div>

                <div className="paper-page-number">— {index + 1} —</div>
              </div>
            </div>
          ))}
          
          {/* Back Cover */}
          <div className="demoPage">
            <div style={{
              width: '100%', height: '100%',
              backgroundColor: '#fdf8f0',
              backgroundImage: 'linear-gradient(rgba(180, 150, 100, 0.07) 1px, transparent 1px)',
              backgroundSize: '100% 21.6px',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              position: 'relative', overflow: 'hidden',
              borderLeft: '4px solid #c9a96e',
            }}>
              {/* Decorative top ornament */}
              <div style={{ fontSize: '28px', marginBottom: 8, opacity: 0.5 }}>📖</div>
              
              {/* Ornamental line */}
              <div style={{ 
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 
              }}>
                <span style={{ display: 'inline-block', width: 40, height: 1, background: 'linear-gradient(to right, transparent, #c9a96e)' }}></span>
                <span style={{ fontSize: '10px', color: '#c9a96e' }}>✦</span>
                <span style={{ display: 'inline-block', width: 40, height: 1, background: 'linear-gradient(to left, transparent, #c9a96e)' }}></span>
              </div>

              {/* Main text */}
              <p style={{ 
                fontFamily: "'Playfair Display', Georgia, serif", 
                fontSize: '1.1rem', 
                fontStyle: 'italic',
                color: '#6e4c2f', 
                margin: '0 0 4px 0',
                letterSpacing: '2px'
              }}>
                — Hết —
              </p>

              {/* Subtitle */}
              <p style={{ 
                fontFamily: "'Lora', Georgia, serif", 
                fontSize: '0.65rem', 
                color: '#a08060', 
                margin: '0 0 16px 0',
                letterSpacing: '1px'
              }}>
                Cảm ơn bạn đã đọc ♡
              </p>

              {/* Ornamental line bottom */}
              <div style={{ 
                display: 'flex', alignItems: 'center', gap: 8 
              }}>
                <span style={{ display: 'inline-block', width: 30, height: 1, background: 'linear-gradient(to right, transparent, #c9a96e)' }}></span>
                <span style={{ fontSize: '8px', color: '#c9a96e' }}>❦</span>
                <span style={{ display: 'inline-block', width: 30, height: 1, background: 'linear-gradient(to left, transparent, #c9a96e)' }}></span>
              </div>

              {/* Story info */}
              <p style={{ 
                fontFamily: "'Playfair Display', Georgia, serif", 
                fontSize: '0.55rem', 
                color: '#b09070', 
                margin: '20px 0 0 0',
                textAlign: 'center',
                lineHeight: 1.6,
                letterSpacing: '0.5px'
              }}>
                {readingStory.title}<br />
                <span style={{ opacity: 0.7 }}>{readingStory.author || 'Khuyết danh'}</span>
              </p>
            </div>
          </div>
                  </HTMLFlipBook>
                </div>
              </div>
            </TransformComponent>
          </TransformWrapper>
        </div>
        

      </div>
    );
  };

  return (
    <>
      {renderFlipbook()}
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="section-header">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 6 }}><BookMarked size={22} /> Thư Viện</h2>
        <span className="badge">{stories.length} truyện</span>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'stretch', height: '38px' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input 
            type="text" 
            className="input-field" 
            placeholder="Tìm kiếm truyện..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ paddingLeft: 40, height: '100%', paddingTop: 0, paddingBottom: 0 }}
          />
        </div>
        <div style={{ position: 'relative', height: '100%' }}>
          <button 
            className="btn btn-outline" 
            style={{ height: '100%', padding: '0 14px', background: isFilterOpen ? 'rgba(138, 92, 32, 0.1)' : '', display: 'flex', alignItems: 'center' }}
            onClick={() => setIsFilterOpen(!isFilterOpen)}
          >
            <Filter size={16} />
          </button>

          {isFilterOpen && (
            <>
              <div 
                style={{ 
                  position: 'fixed', inset: 0, zIndex: 900, 
                  background: 'rgba(28, 20, 15, 0.4)', backdropFilter: 'blur(2px)' 
                }} 
                onClick={() => setIsFilterOpen(false)} 
              />
              <div 
                className="glass-panel" 
                style={{ 
                  position: 'fixed', top: 0, right: 0, bottom: 0, 
                  width: '75vw', maxWidth: '340px', zIndex: 901, 
                  display: 'flex', flexDirection: 'column', gap: 8,
                  padding: '24px 16px', borderRadius: '24px 0 0 24px',
                  boxShadow: '-4px 0 24px rgba(0,0,0,0.2)',
                  borderRight: 'none', borderTop: 'none', borderBottom: 'none',
                  overflowY: 'auto'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', padding: '0 8px' }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 'bold', color: '#8a5c20', textTransform: 'uppercase', letterSpacing: 1 }}>Sắp xếp theo</div>
                  <button onClick={() => setIsFilterOpen(false)} style={{ background: 'transparent', border: 'none', color: '#8a5c20', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><X size={20} /></button>
                </div>
                
                <button className="btn btn-outline" style={{ textAlign: 'left', padding: '14px 16px', border: 'none', borderRadius: 12, fontSize: '0.75rem', background: sortBy === 'time_desc' ? 'rgba(138, 92, 32, 0.1)' : 'transparent', color: sortBy === 'time_desc' ? '#8a5c20' : 'inherit' }} onClick={() => { setSortBy('time_desc'); setIsFilterOpen(false); }}><Clock size={16} style={{marginRight: 10}} /> Mới nhất (Thời gian)</button>
                <button className="btn btn-outline" style={{ textAlign: 'left', padding: '14px 16px', border: 'none', borderRadius: 12, fontSize: '0.75rem', background: sortBy === 'author' ? 'rgba(138, 92, 32, 0.1)' : 'transparent', color: sortBy === 'author' ? '#8a5c20' : 'inherit' }} onClick={() => { setSortBy('author'); setIsFilterOpen(false); }}><User size={16} style={{marginRight: 10}} /> Tác giả (A - Z)</button>
                <button className="btn btn-outline" style={{ textAlign: 'left', padding: '14px 16px', border: 'none', borderRadius: 12, fontSize: '0.75rem', background: sortBy === 'pages' ? 'rgba(138, 92, 32, 0.1)' : 'transparent', color: sortBy === 'pages' ? '#8a5c20' : 'inherit' }} onClick={() => { setSortBy('pages'); setIsFilterOpen(false); }}><FileText size={16} style={{marginRight: 10}} /> Số trang (Nhiều nhất)</button>
                <button className="btn btn-outline" style={{ textAlign: 'left', padding: '14px 16px', border: 'none', borderRadius: 12, fontSize: '0.75rem', background: sortBy === 'name_asc' ? 'rgba(138, 92, 32, 0.1)' : 'transparent', color: sortBy === 'name_asc' ? '#8a5c20' : 'inherit' }} onClick={() => { setSortBy('name_asc'); setIsFilterOpen(false); }}><ArrowDown size={16} style={{marginRight: 10}} /> Tên truyện (A - Z)</button>
                <button className="btn btn-outline" style={{ textAlign: 'left', padding: '14px 16px', border: 'none', borderRadius: 12, fontSize: '0.75rem', background: sortBy === 'name_desc' ? 'rgba(138, 92, 32, 0.1)' : 'transparent', color: sortBy === 'name_desc' ? '#8a5c20' : 'inherit' }} onClick={() => { setSortBy('name_desc'); setIsFilterOpen(false); }}><ArrowUp size={16} style={{marginRight: 10}} /> Tên truyện (Z - A)</button>

                <div style={{ fontSize: '12.5px', fontWeight: 'bold', color: '#8a5c20', textTransform: 'uppercase', letterSpacing: 1, marginTop: '24px', marginBottom: '12px', padding: '0 8px' }}>Lọc theo tác giả</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '0 8px' }}>
                  <button 
                    className="btn btn-outline"
                    style={{ padding: '8px 14px', borderRadius: '20px', background: filterAuthor === 'All' ? 'var(--accent)' : 'transparent', border: '1px solid rgba(138, 92, 32, 0.3)', color: filterAuthor === 'All' ? '#fff' : 'inherit', fontSize: '0.72rem' }}
                    onClick={() => { setFilterAuthor('All'); setIsFilterOpen(false); }}
                  >Tất cả</button>
                  {allAuthors.map(author => (
                    <button 
                      key={author}
                      className="btn btn-outline"
                      style={{ padding: '8px 14px', borderRadius: '20px', background: filterAuthor === author ? 'var(--accent)' : 'transparent', border: '1px solid rgba(138, 92, 32, 0.3)', color: filterAuthor === author ? '#fff' : 'inherit', fontSize: '0.72rem' }}
                      onClick={() => { setFilterAuthor(author); setIsFilterOpen(false); }}
                    >{author}</button>
                  ))}
                </div>

                <div style={{ fontSize: '12.5px', fontWeight: 'bold', color: '#8a5c20', textTransform: 'uppercase', letterSpacing: 1, marginTop: '24px', marginBottom: '12px', padding: '0 8px' }}>Lọc theo độ dài (Số trang)</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '0 8px' }}>
                  <button 
                    className="btn btn-outline"
                    style={{ padding: '8px 14px', borderRadius: '20px', background: filterPageCount === 'All' ? 'var(--accent)' : 'transparent', border: '1px solid rgba(138, 92, 32, 0.3)', color: filterPageCount === 'All' ? '#fff' : 'inherit', fontSize: '0.72rem' }}
                    onClick={() => { setFilterPageCount('All'); setIsFilterOpen(false); }}
                  >Tất cả</button>
                  <button 
                    className="btn btn-outline"
                    style={{ padding: '8px 14px', borderRadius: '20px', background: filterPageCount === '1-5' ? 'var(--accent)' : 'transparent', border: '1px solid rgba(138, 92, 32, 0.3)', color: filterPageCount === '1-5' ? '#fff' : 'inherit', fontSize: '0.72rem' }}
                    onClick={() => { setFilterPageCount('1-5'); setIsFilterOpen(false); }}
                  >Ngắn (1-5 trang)</button>
                  <button 
                    className="btn btn-outline"
                    style={{ padding: '8px 14px', borderRadius: '20px', background: filterPageCount === '6-10' ? 'var(--accent)' : 'transparent', border: '1px solid rgba(138, 92, 32, 0.3)', color: filterPageCount === '6-10' ? '#fff' : 'inherit', fontSize: '0.72rem' }}
                    onClick={() => { setFilterPageCount('6-10'); setIsFilterOpen(false); }}
                  >Vừa (6-10 trang)</button>
                  <button 
                    className="btn btn-outline"
                    style={{ padding: '8px 14px', borderRadius: '20px', background: filterPageCount === '10+' ? 'var(--accent)' : 'transparent', border: '1px solid rgba(138, 92, 32, 0.3)', color: filterPageCount === '10+' ? '#fff' : 'inherit', fontSize: '0.72rem' }}
                    onClick={() => { setFilterPageCount('10+'); setIsFilterOpen(false); }}
                  >Dài (10+ trang)</button>
                </div>

                <div style={{ fontSize: '12.5px', fontWeight: 'bold', color: '#8a5c20', textTransform: 'uppercase', letterSpacing: 1, marginTop: '24px', marginBottom: '12px', padding: '0 8px' }}>Lọc theo thời gian sáng tác</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '0 8px', paddingBottom: '32px' }}>
                  <button 
                    className="btn btn-outline"
                    style={{ padding: '8px 14px', borderRadius: '20px', background: filterMonthYear === 'All' ? 'var(--accent)' : 'transparent', border: '1px solid rgba(138, 92, 32, 0.3)', color: filterMonthYear === 'All' ? '#fff' : 'inherit', fontSize: '0.72rem' }}
                    onClick={() => { setFilterMonthYear('All'); setIsFilterOpen(false); }}
                  >Tất cả thời gian</button>
                  {allMonths.map(monthYear => (
                    <button 
                      key={monthYear}
                      className="btn btn-outline"
                      style={{ padding: '8px 14px', borderRadius: '20px', background: filterMonthYear === monthYear ? 'var(--accent)' : 'transparent', border: '1px solid rgba(138, 92, 32, 0.3)', color: filterMonthYear === monthYear ? '#fff' : 'inherit', fontSize: '0.72rem' }}
                      onClick={() => { setFilterMonthYear(monthYear); setIsFilterOpen(false); }}
                    >{monthYear}</button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="story-grid" style={{ flex: 1 }}>
        {filteredStories.map((story, i) => (
          <div 
            key={story.id} 
            className="story-card animate-in" 
            onClick={() => setReadingStory(story)}
            style={{ animationDelay: `${i * 0.05}s` }}
          >
            <div style={{ overflow: 'hidden' }}>
              <img 
                src={story.cover || 'https://via.placeholder.com/300x400.png?text=No+Cover'} 
                alt={story.title} 
                className="story-cover"
              />
            </div>
            <div className="story-info">
              <div className="story-title">{story.title}</div>
              <div className="story-meta">{story.author || 'Ẩn danh'} • {story.pages?.length || 0} trang</div>
            </div>
          </div>
        ))}
        {filteredStories.length === 0 && (
          <div style={{ gridColumn: '1 / -1' }}>
            <div className="empty-state">
              <div className="empty-state-icon">
                <BookOpen size={28} />
              </div>
              <p>Chưa có truyện nào trong thư viện.<br/>Hãy qua tab <strong>Sáng Tác</strong> để bắt đầu viết!</p>
            </div>
          </div>
        )}
      </div>
      </div>
    </>
  );
}
