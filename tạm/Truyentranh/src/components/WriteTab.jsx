import React, { useState, useContext, useEffect, useRef } from 'react';
import { StoryContext } from '../store/StoryContext';
import { Rnd } from 'react-rnd';
import { Image, Save, Plus, ArrowRight, ArrowLeft, Trash2, Edit, PenLine, RotateCw, ChevronDown, Loader } from 'lucide-react';
import { uploadImage } from '../firebase';

const PAGE_WIDTH = 360;
const TEXT_LINE_HEIGHT = 21.6;

const getPageHeight = () => {
  if (typeof window === 'undefined') return 780;
  // Calculate logical height based on actual screen aspect ratio
  // Enforce a minimum ratio to trick react-pageflip into ALWAYS showing 1 page (Portrait mode)
  let ratio = window.innerHeight / window.innerWidth;
  if (ratio < 1.01) ratio = 1.01; 
  return PAGE_WIDTH * ratio;
};

export default function WriteTab({ onBack }) {
  const { stories, addStory, updateStory, editingStoryId, setEditingStoryId } = useContext(StoryContext);

  const [pages, setPages] = useState([{ id: 'p' + Date.now(), elements: [] }]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [characters, setCharacters] = useState(['Người Dẫn Truyện']);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [newChar, setNewChar] = useState('');
  const [selectedChar, setSelectedChar] = useState('Người Dẫn Truyện');
  const [textInput, setTextInput] = useState('');
  const [textColor, setTextColor] = useState('#2c1a0e');
  const [storyMeta, setStoryMeta] = useState({ title: 'Truyện Mới', description: '', genre: '', author: '', status: '', year: '', cover: '' });
  const [editorRev, setEditorRev] = useState(0);

  // Track selected element for editing (e.g. image replace)
  const [selectedElementId, setSelectedElementId] = useState(null);
  const [isCornerResize, setIsCornerResize] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [activeCharDropdown, setActiveCharDropdown] = useState(null);
  const [isToolsExpanded, setIsToolsExpanded] = useState(false);

  const containerRef = useRef(null);
  const [layoutScale, setLayoutScale] = useState(1);
  const [pageHeight, setPageHeight] = useState(getPageHeight());

  useEffect(() => {
    const updateDimensions = () => {
      const newPageHeight = getPageHeight();
      setPageHeight(newPageHeight);
      
      if (containerRef.current) {
        // Fit paper horizontally with 16px padding on each side
        const availableWidth = containerRef.current.clientWidth - 32;
        const scale = availableWidth / PAGE_WIDTH;
        setLayoutScale(scale); // Scale proportionally
      }
    };
    
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const bookRef = useRef();
  const touchStartX = useRef(0);
  const shouldAutoJump = useRef(false);
  const autoJumpFocus = useRef(false);
  const lastCursorPos = useRef(null);
  const fileInputRef = useRef(null);
  const coverInputRef = useRef(null);
  const replaceImgInputRef = useRef(null);

  useEffect(() => {
    if (editingStoryId) {
      const story = stories.find(s => s.id === editingStoryId);
      if (story) {
        setPages(story.pages && story.pages.length > 0 ? story.pages : [{ id: 'p1', elements: [] }]);
        setStoryMeta({
          title: story.title, description: story.description, genre: story.genre,
          author: story.author, status: story.status, year: story.year, cover: story.cover
        });
      }
    }
  }, [editingStoryId, stories]);

  useEffect(() => {
    if (autoJumpFocus.current) {
        autoJumpFocus.current = false;
        setTimeout(() => {
            const editor = document.getElementById('story-editor-content');
            if (editor) {
                editor.focus();
                const range = document.createRange();
                range.selectNodeContents(editor);
                range.collapse(false);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            }
        }, 50);
    }
  }, [currentPageIndex]);

  const saveCursor = (el) => {
      let caretPos = 0;
      const sel = window.getSelection();
      if (sel.rangeCount) {
          const range = sel.getRangeAt(0);
          if (el.contains(range.commonAncestorContainer)) {
              const preCaretRange = range.cloneRange();
              preCaretRange.selectNodeContents(el);
              preCaretRange.setEnd(range.endContainer, range.endOffset);
              
              const tempDiv = document.createElement("div");
              tempDiv.style.cssText = "position:absolute;left:-9999px;top:-9999px;white-space:pre-wrap;line-height:21.6px;";
              tempDiv.appendChild(preCaretRange.cloneContents());
              document.body.appendChild(tempDiv);
              
              caretPos = tempDiv.innerText.replace(/\r\n/g, '\n').length;
              document.body.removeChild(tempDiv);
              
              lastCursorPos.current = caretPos;
          }
      }
  };

  const addText = () => {
    if (!textInput.trim()) return;
    
    const MAX_LINES_PER_PAGE = Math.max(10, Math.floor((pageHeight - 45) / TEXT_LINE_HEIGHT));
    const CHARS_PER_LINE = 44;
    
    const content = selectedChar ? `${selectedChar}: ${textInput}` : textInput;
    
    const currentPageTextEls = pages[currentPageIndex].elements.filter(el => el.type === 'text');
    const currentPageText = currentPageTextEls.map(el => el.content).join('\n');
    
    const insertPos = lastCursorPos.current !== null ? Math.min(lastCursorPos.current, currentPageText.length) : currentPageText.length;
    const newCurrentPageText = currentPageText.substring(0, insertPos) + content + currentPageText.substring(insertPos);
    
    let subsequentText = [];
    for (let i = currentPageIndex + 1; i < pages.length; i++) {
        const textEls = pages[i].elements.filter(el => el.type === 'text');
        textEls.forEach(el => subsequentText.push(el.content));
    }
    const allLines = [...newCurrentPageText.split('\n'), ...subsequentText];
    
    let newPages = [...pages];
    for (let i = currentPageIndex; i < newPages.length; i++) {
        newPages[i] = {
            ...newPages[i],
            elements: newPages[i].elements.filter(el => el.type !== 'text')
        };
    }
    
    let targetPageIndex = currentPageIndex;
    let accumulatedLines = 0;

    const addElementToPage = (textStr) => {
        if (!textStr.trim()) {
            if (accumulatedLines + 1 > MAX_LINES_PER_PAGE) {
                targetPageIndex++;
                if (targetPageIndex >= newPages.length) {
                    newPages.push({ id: 'p' + Date.now() + Math.random(), elements: [] });
                }
                accumulatedLines = 1;
            } else {
                accumulatedLines += 1;
            }
            const el = { id: 't' + Date.now() + Math.random(), type: 'text', content: "", color: textColor };
            newPages[targetPageIndex].elements.push(el);
            return;
        }

        let prefix = "";
        let mainText = textStr;
        const colonIndex = textStr.indexOf(':');
        if (colonIndex !== -1 && colonIndex < 30) {
            prefix = textStr.substring(0, colonIndex + 1) + " ";
            mainText = textStr.substring(colonIndex + 1).trim();
        }

        let remainingText = mainText;
        while (remainingText.length > 0 || prefix) {
            let linesLeft = MAX_LINES_PER_PAGE - accumulatedLines;
            if (linesLeft <= 0) {
                targetPageIndex++;
                if (targetPageIndex >= newPages.length) {
                    newPages.push({ id: 'p' + Date.now() + Math.random(), elements: [] });
                }
                accumulatedLines = 0;
                linesLeft = MAX_LINES_PER_PAGE;
            }
            
            if (remainingText.length === 0 && prefix) {
                const el = { id: 't' + Date.now() + Math.random(), type: 'text', content: prefix, color: textColor };
                newPages[targetPageIndex].elements.push(el);
                accumulatedLines += 1;
                break;
            }

            const availableChars = linesLeft * CHARS_PER_LINE - prefix.length;
            
            if (remainingText.length <= availableChars) {
                const el = { id: 't' + Date.now() + Math.random(), type: 'text', content: prefix + remainingText, color: textColor };
                newPages[targetPageIndex].elements.push(el);
                accumulatedLines += Math.ceil((prefix.length + remainingText.length) / CHARS_PER_LINE);
                break;
            } else {
                let splitIndex = availableChars;
                while (splitIndex > 0 && remainingText[splitIndex] !== ' ') {
                    splitIndex--;
                }
                if (splitIndex === 0) splitIndex = availableChars;

                const part = remainingText.substring(0, splitIndex).trim();
                const el = { id: 't' + Date.now() + Math.random(), type: 'text', content: prefix + part, color: textColor };
                newPages[targetPageIndex].elements.push(el);
                
                remainingText = remainingText.substring(splitIndex).trim();
                accumulatedLines = MAX_LINES_PER_PAGE;
            }
        }
    };

    allLines.forEach(line => addElementToPage(line));

    while (newPages.length > 1 && newPages[newPages.length - 1].elements.length === 0) {
        newPages.pop();
    }

    setPages(newPages);
    
    setEditorRev(r => r + 1);
    setTextInput('');
    
    if (lastCursorPos.current !== null) {
        lastCursorPos.current += content.length;
    }
  };

  const addCharacter = () => {
    if (newChar.trim() && !characters.includes(newChar.trim())) {
      setCharacters([...characters, newChar.trim()]);
      setSelectedChar(newChar.trim());
      setNewChar('');
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      setIsUploading(true);
      try {
        const url = await uploadImage(file, 'story_images');
        const newElement = {
          id: 'i' + Date.now(), type: 'image', src: url,
          x: 50, y: 50, width: 200, height: 150
        };
        updateCurrentPageElements([...pages[currentPageIndex].elements, newElement]);
      } catch (err) {
        alert("Lỗi tải ảnh lên mây. Vui lòng thử lại.");
      }
      setIsUploading(false);
    }
  };

  const handleImageReplace = async (e) => {
    const file = e.target.files[0];
    if (file && selectedElementId) {
      setIsUploading(true);
      try {
        const url = await uploadImage(file, 'story_images');
        const newElements = pages[currentPageIndex].elements.map(el => {
          if (el.id === selectedElementId) {
            return { ...el, src: url }; // keep x, y, width, height
          }
          return el;
        });
        updateCurrentPageElements(newElements);
      } catch (err) {
        alert("Lỗi tải ảnh lên mây. Vui lòng thử lại.");
      }
      setIsUploading(false);
    }
  };

  const handleCoverUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      setIsUploading(true);
      try {
        const url = await uploadImage(file, 'covers');
        setStoryMeta({ ...storyMeta, cover: url });
      } catch (err) {
        alert("Lỗi tải ảnh bìa lên mây. Vui lòng thử lại.");
      }
      setIsUploading(false);
    }
  };

  const updateCurrentPageElements = (newElements) => {
    const newPages = [...pages];
    newPages[currentPageIndex].elements = newElements;
    setPages(newPages);
  };

  const handleRotateStart = (e, el) => {
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    setIsRotating(true);

    const elementNode = document.getElementById(`img-wrap-${el.id}`);
    if (!elementNode) return;
    const rect = elementNode.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const handleMove = (moveEvent) => {
      const clientX = moveEvent.touches ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const clientY = moveEvent.touches ? moveEvent.touches[0].clientY : moveEvent.clientY;

      const radians = Math.atan2(clientY - centerY, clientX - centerX);
      let degrees = radians * (180 / Math.PI) + 90;

      setPages(prevPages => {
        const newPages = [...prevPages];
        newPages[currentPageIndex].elements = newPages[currentPageIndex].elements.map(item =>
          item.id === el.id ? { ...item, rotation: Math.round(degrees) } : item
        );
        return newPages;
      });
    };

    const handleUp = () => {
      setIsRotating(false);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleUp);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    document.addEventListener('touchmove', handleMove, { passive: false });
    document.addEventListener('touchend', handleUp);
  };

  const removeElement = (id) => {
    updateCurrentPageElements(pages[currentPageIndex].elements.filter(e => e.id !== id));
    if (selectedElementId === id) setSelectedElementId(null);
  };

  const saveStory = async () => {
    const storyData = {
      ...storyMeta,
      pages: pages
    };

    try {
      if (editingStoryId) {
        await updateStory(editingStoryId, storyData);
      } else {
        const newId = await addStory(storyData);
        setEditingStoryId(newId);
      }
    } catch (error) {
      console.error('Lỗi lưu truyện:', error);
      alert('Không thể lưu truyện. Vui lòng thử lại.');
    }
  };

  const createNewStory = () => {
    setEditingStoryId(null);
    setPages([{ id: 'p' + Date.now(), elements: [] }]);
    setCurrentPageIndex(0);
    setCharacters(['Người Dẫn Truyện']);
    setSelectedChar('Người Dẫn Truyện');
    setStoryMeta({ title: 'Truyện Mới', description: '', genre: '', author: '', status: '', year: '', cover: '' });
  };

  const renderPage = () => {
    const page = pages[currentPageIndex];
    if (!page) return null;

    return (
      <div className="paper" style={{ width: PAGE_WIDTH, height: pageHeight, minHeight: pageHeight, maxHeight: pageHeight }}>
        <div className="paper-content" style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
          {/* Layer Ảnh (Images) */}
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 20 }}>
            {page.elements.filter(el => el.type === 'image').map(el => (
                <Rnd
                  key={el.id}
                  position={{ x: el.x, y: el.y }}
                  size={{ width: el.width, height: el.height }}
                  onDragStop={(e, d) => {
                    const newEls = page.elements.map(e => e.id === el.id ? { ...e, x: d.x, y: d.y } : e);
                    updateCurrentPageElements(newEls);
                  }}
                  onResizeStart={(e, direction) => {
                    setIsCornerResize(['topLeft', 'topRight', 'bottomLeft', 'bottomRight'].includes(direction));
                  }}
                  onResizeStop={(e, direction, ref, delta, position) => {
                    const newEls = page.elements.map(e => e.id === el.id ? {
                      ...e, width: ref.offsetWidth, height: ref.offsetHeight, ...position
                    } : e);
                    updateCurrentPageElements(newEls);
                    setIsCornerResize(false);
                  }}
                  onDragStart={(e, d) => {
                    setSelectedElementId(el.id);
                    if (document.activeElement && document.activeElement.blur) {
                      document.activeElement.blur();
                    }
                  }}
                  disableDragging={isRotating}
                  cancel=".no-drag"
                  onClick={() => {
                    setSelectedElementId(el.id);
                    if (document.activeElement && document.activeElement.blur) {
                      document.activeElement.blur();
                    }
                  }}
                  enableResizing={selectedElementId === el.id}
                  lockAspectRatio={isCornerResize}
                  resizeHandleComponent={selectedElementId === el.id ? {
                    bottomRight: <div style={{ width: 14, height: 14, background: '#fff', borderRadius: '50%', border: '2px solid #c9a96e', position: 'absolute', right: -7, bottom: -7, boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />,
                    bottomLeft: <div style={{ width: 14, height: 14, background: '#fff', borderRadius: '50%', border: '2px solid #c9a96e', position: 'absolute', left: -7, bottom: -7, boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />,
                    topRight: <div style={{ width: 14, height: 14, background: '#fff', borderRadius: '50%', border: '2px solid #c9a96e', position: 'absolute', right: -7, top: -7, boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />,
                    topLeft: <div style={{ width: 14, height: 14, background: '#fff', borderRadius: '50%', border: '2px solid #c9a96e', position: 'absolute', left: -7, top: -7, boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />,
                    right: <div style={{ width: 14, height: 14, background: '#fff', borderRadius: '50%', border: '2px solid #c9a96e', position: 'absolute', right: -7, top: '50%', transform: 'translateY(-50%)', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />,
                    left: <div style={{ width: 14, height: 14, background: '#fff', borderRadius: '50%', border: '2px solid #c9a96e', position: 'absolute', left: -7, top: '50%', transform: 'translateY(-50%)', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />,
                    top: <div style={{ width: 14, height: 14, background: '#fff', borderRadius: '50%', border: '2px solid #c9a96e', position: 'absolute', top: -7, left: '50%', transform: 'translateX(-50%)', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />,
                    bottom: <div style={{ width: 14, height: 14, background: '#fff', borderRadius: '50%', border: '2px solid #c9a96e', position: 'absolute', bottom: -7, left: '50%', transform: 'translateX(-50%)', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                  } : {}}
                  style={{
                    border: selectedElementId === el.id ? '2px dashed #c9a96e' : 'none',
                    cursor: 'move',
                    zIndex: selectedElementId === el.id ? 100 : 1,
                    pointerEvents: 'auto',
                    overflow: 'visible',
                  }}
                >
                  <div
                    id={`img-wrap-${el.id}`}
                    style={{
                      width: '100%', height: '100%',
                      transform: `rotate(${el.rotation || 0}deg)`,
                      transformOrigin: 'center center',
                      pointerEvents: 'none',
                    }}
                  >
                    <img src={el.src} alt="img" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4 }} />
                  </div>

                  {selectedElementId === el.id && (
                    <>
                      <div style={{ position: 'absolute', top: -16, left: '50%', width: 1, height: 16, background: '#c9a96e', zIndex: 101 }} />
                      <div
                        className="no-drag"
                        onMouseDown={(e) => handleRotateStart(e, el)}
                        onTouchStart={(e) => handleRotateStart(e, el)}
                        style={{
                          position: 'absolute', top: -36, left: '50%', transform: 'translateX(-50%)',
                          background: '#fff', border: '2px solid #c9a96e', borderRadius: '50%',
                          width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.2)', zIndex: 102, cursor: 'grab'
                        }}
                      >
                        <RotateCw size={12} color="#8a5c20" />
                      </div>

                      <button
                        className="no-drag"
                        onClick={(e) => { e.stopPropagation(); removeElement(el.id); }}
                        style={{ position: 'absolute', top: 6, right: 6, background: '#ef4444', color: 'white', borderRadius: '50%', border: 'none', width: 24, height: 24, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 102, boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </Rnd>
            ))}
          </div>

          {/* Placeholder text, positioned absolutely so it doesn't interfere with contentEditable */}
          {page.elements.filter(el => el.type === 'text').length === 0 && (
             <div style={{ position: 'absolute', top: 21.6, left: 20, color: '#ccc', fontStyle: 'italic', fontSize: '12px', pointerEvents: 'none', zIndex: 5 }}>Nhấp vào trang để bắt đầu viết...</div>
          )}
          
          {/* Layer Chữ (Text) */}
          <div 
            id="story-editor-content"
            key={`editor-${currentPageIndex}-${editorRev}`}
            contentEditable
            suppressContentEditableWarning
            onFocus={() => setSelectedElementId(null)}
            onKeyUp={(e) => saveCursor(e.currentTarget)}
            onClick={(e) => saveCursor(e.currentTarget)}
            onPaste={(e) => {
              e.preventDefault();
              const text = e.clipboardData.getData('text/plain');
              document.execCommand('insertText', false, text);
            }}
            onBlur={(e) => {
              saveCursor(e.target);
              const rawLines = e.target.innerText.split('\n');
              const MAX_LINES_PER_PAGE = Math.max(10, Math.floor((pageHeight - 45) / TEXT_LINE_HEIGHT));
              const CHARS_PER_LINE = 44;
              
              let subsequentText = [];
              for (let i = currentPageIndex + 1; i < pages.length; i++) {
                 const textEls = pages[i].elements.filter(el => el.type === 'text');
                 textEls.forEach(el => subsequentText.push(el.content));
              }
              const allLines = [...rawLines, ...subsequentText];
              
              let newPages = [...pages];
              
              // Clear text from currentPageIndex to the end, keeping images intact
              for (let i = currentPageIndex; i < newPages.length; i++) {
                 newPages[i] = {
                   ...newPages[i],
                   elements: newPages[i].elements.filter(el => el.type !== 'text')
                 };
              }

              let targetPageIndex = currentPageIndex;
              let accumulatedLines = 0;

              const addElementToPage = (textStr) => {
                  if (!textStr.trim()) {
                      if (accumulatedLines + 1 > MAX_LINES_PER_PAGE) {
                          targetPageIndex++;
                          if (targetPageIndex >= newPages.length) {
                             newPages.push({ id: 'p' + Date.now() + Math.random(), elements: [] });
                          }
                          accumulatedLines = 1;
                      } else {
                          accumulatedLines += 1;
                      }
                      const el = { id: 't' + Date.now() + Math.random(), type: 'text', content: "", color: textColor };
                      newPages[targetPageIndex].elements.push(el);
                      return;
                  }

                  let prefix = "";
                  let mainText = textStr;
                  const colonIndex = textStr.indexOf(':');
                  if (colonIndex !== -1 && colonIndex < 30) {
                      prefix = textStr.substring(0, colonIndex + 1) + " ";
                      mainText = textStr.substring(colonIndex + 1).trim();
                  }

                  let remainingText = mainText;
                  while (remainingText.length > 0 || prefix) {
                      let linesLeft = MAX_LINES_PER_PAGE - accumulatedLines;
                      if (linesLeft <= 0) {
                          targetPageIndex++;
                          if (targetPageIndex >= newPages.length) {
                             newPages.push({ id: 'p' + Date.now() + Math.random(), elements: [] });
                          }
                          accumulatedLines = 0;
                          linesLeft = MAX_LINES_PER_PAGE;
                      }
                      
                      if (remainingText.length === 0 && prefix) {
                          const el = { id: 't' + Date.now() + Math.random(), type: 'text', content: prefix, color: textColor };
                          newPages[targetPageIndex].elements.push(el);
                          accumulatedLines += 1;
                          break;
                      }

                      const availableChars = linesLeft * CHARS_PER_LINE - prefix.length;
                      
                      if (remainingText.length <= availableChars) {
                          const el = { id: 't' + Date.now() + Math.random(), type: 'text', content: prefix + remainingText, color: textColor };
                          newPages[targetPageIndex].elements.push(el);
                          accumulatedLines += Math.ceil((prefix.length + remainingText.length) / CHARS_PER_LINE);
                          break;
                      } else {
                          let splitIndex = availableChars;
                          while (splitIndex > 0 && remainingText[splitIndex] !== ' ') {
                              splitIndex--;
                          }
                          if (splitIndex === 0) splitIndex = availableChars;

                          const part = remainingText.substring(0, splitIndex).trim();
                          const el = { id: 't' + Date.now() + Math.random(), type: 'text', content: prefix + part, color: textColor };
                          newPages[targetPageIndex].elements.push(el);
                          
                          remainingText = remainingText.substring(splitIndex).trim();
                          accumulatedLines = MAX_LINES_PER_PAGE;
                      }
                  }
              };

              allLines.forEach(line => addElementToPage(line));

              // Clean up empty pages at the end
              while (newPages.length > 1 && newPages[newPages.length - 1].elements.length === 0) {
                  newPages.pop();
              }

              setPages(newPages);
              
              if (shouldAutoJump.current) {
                  setCurrentPageIndex(Math.min(currentPageIndex + 1, newPages.length - 1));
                  shouldAutoJump.current = false;
                  autoJumpFocus.current = true;
              }
              
            // Force React to recreate the contentEditable node to avoid NotFoundError crashes
              setEditorRev(r => r + 1);
            }}
            onInput={(e) => {
              if (e.target.scrollHeight > e.target.clientHeight + 2) {
                const sel = window.getSelection();
                if (sel.rangeCount > 0) {
                  const range = sel.getRangeAt(0);
                  const endRange = document.createRange();
                  try {
                    endRange.selectNodeContents(e.target);
                    endRange.setStart(range.endContainer, range.endOffset);
                    if (endRange.toString().trim().length === 0) {
                      shouldAutoJump.current = true;
                      e.target.blur();
                    }
                  } catch (err) {
                    // Ignore range errors
                  }
                }
              }
            }}
            style={{ flex: 1, width: '100%', minHeight: `${pageHeight - 45}px`, maxHeight: `${pageHeight - 45}px`, overflow: 'hidden', cursor: 'text', zIndex: 10, position: 'relative', padding: '0 4px', outline: 'none', lineHeight: '21.6px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
          >
            {page.elements.filter(el => el.type === 'text').map((el, index, array) => {
              const allKnownChars = [...characters, 'Người Dẫn Truyện', 'Nguoi Dan Truyen'].sort((a, b) => b.length - a.length);
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
                      <span style={{ fontSize: '13px', color: el.color || '#6e4c2f' }}>
                        {normalTextBefore}<em style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>{charText}</em>
                      </span>
                    ) : (
                      <span>
                        {normalTextBefore && <span style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: '13px', color: el.color || '#2c1a0e' }}>{normalTextBefore}</span>}
                        <span 
                          contentEditable={false}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            const rect = e.currentTarget.getBoundingClientRect();
                            setActiveCharDropdown({ id: el.id, x: rect.left, y: rect.bottom + 4, charText: charText.trim() });
                          }}
                          onTouchStart={(e) => {
                            e.preventDefault();
                            const rect = e.currentTarget.getBoundingClientRect();
                            setActiveCharDropdown({ id: el.id, x: rect.left, y: rect.bottom + 4, charText: charText.trim() });
                          }}
                          style={{ fontFamily: "'Playfair Display', serif", fontSize: '12px', fontWeight: 700, color: '#8a5c20', marginRight: '6px', cursor: 'pointer', background: 'rgba(201, 169, 110, 0.1)', padding: '2px 4px', borderRadius: 4, userSelect: 'none' }}
                          title="Đổi nhân vật"
                        >
                          {charName}:
                        </span>
                        <span style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: '13px', color: el.color || '#2c1a0e' }}>{charText}</span>
                      </span>
                    )
                  ) : (
                    <span style={{ fontSize: '13px', color: el.color || '#6e4c2f' }}>
                      <em>{charText}</em>
                    </span>
                  )}
                  {index < array.length - 1 && <br />}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Số trang ở dưới */}
        <div className="paper-page-number">— {currentPageIndex + 1} —</div>
      </div>
    );
  };


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minHeight: '100%' }}>
      {/* Controls Panel */}
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px' }}>
        <div className="section-header" style={{ marginBottom: 0 }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.2rem' }}>
            {onBack && (
              <button 
                onClick={onBack} 
                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0, color: 'inherit' }}
              >
                <ArrowLeft size={20} />
              </button>
            )}
            {editingStoryId ? 'Chỉnh Sửa' : '✨ Sáng Tác'}
          </h2>
          <button 
            className="btn btn-outline" 
            style={{ marginLeft: 'auto', padding: '6px 12px', fontSize: '0.75rem', borderRadius: '12px' }}
            onClick={() => setIsToolsExpanded(!isToolsExpanded)}
          >
            {isToolsExpanded ? 'Thu gọn' : 'Cài đặt truyện'}
          </button>
        </div>

        {/* Collapsible Metadata Section */}
        {isToolsExpanded && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '12px', borderBottom: '1px solid rgba(139, 94, 60, 0.2)' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <div 
                onClick={() => coverInputRef.current?.click()}
                title="Đổi ảnh bìa"
                style={{ 
                  width: 60, height: 84, 
                  background: storyMeta.cover ? `url(${storyMeta.cover}) center/cover` : 'var(--bg-glass)',
                  border: '2px dashed rgba(139, 94, 60, 0.4)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  overflow: 'hidden',
                  position: 'relative'
                }}
              >
                {!storyMeta.cover ? <Image size={24} color="rgba(139, 94, 60, 0.6)" /> : null}
                {isUploading && (
                      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10 }}>
                        <Loader size={16} color="#fff" style={{ animation: 'spin 1s linear infinite' }} />
                      </div>
                )}
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Tên Truyện"
                  value={storyMeta.title}
                  onChange={e => setStoryMeta({ ...storyMeta, title: e.target.value })}
                />
                <input
                  type="text"
                  className="input-field"
                  placeholder="Tên Tác Giả"
                  value={storyMeta.author}
                  onChange={e => setStoryMeta({ ...storyMeta, author: e.target.value })}
                />
              </div>
              <input type="file" hidden ref={coverInputRef} onChange={handleCoverUpload} accept="image/*" />
            </div>
            
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn" style={{ flex: 1, padding: '10px 8px', fontSize: '0.75rem', justifyContent: 'center' }} onClick={saveStory}>
                <Save size={14} style={{ marginRight: 4 }} /> Lưu Truyện
              </button>
              {editingStoryId && (
                <button 
                  className="btn btn-outline" 
                  style={{ padding: '10px 12px', fontSize: '0.75rem', borderRadius: 'var(--radius-md)' }}
                  onClick={createNewStory}
                  title="Tạo mới truyện"
                >
                  <Plus size={14} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Always Visible Writing Tools */}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <div 
              className="input-field" 
              style={{ 
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                cursor: 'pointer', userSelect: 'none',
                height: '100%', padding: '8px 12px'
              }}
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>{selectedChar}</span>
              <ChevronDown size={14} color="#3b2f20" style={{ transform: isDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0, marginLeft: 4 }} />
            </div>
            
            {isDropdownOpen && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 0,
                right: 0,
                background: '#ddd0b6',
                border: '1px solid rgba(139, 94, 60, 0.3)',
                borderRadius: 'var(--radius-md)',
                boxShadow: '0 4px 12px rgba(60, 40, 20, 0.2)',
                zIndex: 1000,
                maxHeight: '150px',
                overflowY: 'auto',
                padding: '4px'
              }}>
                {characters.map(c => (
                  <div 
                    key={c}
                    onClick={() => { setSelectedChar(c); setIsDropdownOpen(false); }}
                    style={{
                      padding: '8px 10px',
                      cursor: 'pointer',
                      borderRadius: 'var(--radius-sm)',
                      background: selectedChar === c ? 'rgba(139, 94, 60, 0.15)' : 'transparent',
                      color: '#3b2f20',
                      fontSize: '0.77rem',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = selectedChar === c ? 'rgba(139, 94, 60, 0.15)' : 'rgba(139, 94, 60, 0.1)'}
                    onMouseLeave={e => e.currentTarget.style.background = selectedChar === c ? 'rgba(139, 94, 60, 0.15)' : 'transparent'}
                  >
                    {c}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              className="input-field"
              placeholder="Nhân vật mới..."
              value={newChar}
              onChange={e => setNewChar(e.target.value)}
              style={{ width: 100, fontSize: '0.8rem' }}
            />
            <button className="btn btn-outline" onClick={addCharacter} style={{ padding: '8px 10px' }}>
              <Plus size={14} />
            </button>
          </div>
        </div>

        <textarea
          className="input-field"
          placeholder="Nhập nội dung truyện..."
          rows={2}
          value={textInput}
          onChange={e => setTextInput(e.target.value)}
          style={{ resize: 'vertical', fontSize: '0.8rem' }}
        />

        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', height: '38px' }}>
          <label style={{
            position: 'relative', cursor: 'pointer', flexShrink: 0,
            width: 38, borderRadius: 'var(--radius-md)',
            border: '2px solid rgba(139, 94, 60, 0.3)',
            background: textColor,
            boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
            transition: 'all var(--transition)',
          }}>
            <input
              type="color"
              value={textColor}
              onChange={e => setTextColor(e.target.value)}
              style={{ opacity: 0, position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'pointer' }}
            />
          </label>
          
          <button className="btn" onClick={addText} style={{ justifyContent: 'center', flex: 1, fontSize: '0.8rem', padding: 0 }}>
            <PenLine size={14} style={{ marginRight: 4 }} /> Viết
          </button>
          
          <button className="btn btn-outline" onClick={() => fileInputRef.current.click()} style={{ padding: '0 12px', justifyContent: 'center', position: 'relative' }} title="Chèn ảnh">
            <Image size={16} />
            {isUploading && (
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8 }}>
                    <Loader size={14} color="#fff" style={{ animation: 'spin 1s linear infinite' }} />
                  </div>
            )}
          </button>
          <input type="file" hidden ref={fileInputRef} onChange={handleImageUpload} accept="image/*" />

          {selectedElementId && pages[currentPageIndex].elements.find(e => e.id === selectedElementId)?.type === 'image' && (
            <>
              <button className="btn btn-outline" onClick={() => replaceImgInputRef.current.click()} style={{ padding: '0 12px', justifyContent: 'center', position: 'relative' }} title="Đổi ảnh">
                <Edit size={16} />
                {isUploading && (
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8 }}>
                    <Loader size={14} color="#fff" style={{ animation: 'spin 1s linear infinite' }} />
                  </div>
                )}
              </button>
              <input type="file" hidden ref={replaceImgInputRef} onChange={handleImageReplace} accept="image/*" />
            </>
          )}
        </div>
      </div>

      {/* Canvas Area */}
      <div className="paper-container" style={{ flex: 1 }} ref={containerRef}>
        <div style={{ 
            zoom: layoutScale, 
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
            width: '360px'
        }}>
            {/* Pagination Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', width: PAGE_WIDTH, alignItems: 'center' }}>
              <button 
                className="btn btn-outline" 
                disabled={currentPageIndex === 0}
                onClick={() => setCurrentPageIndex(p => p - 1)}
                style={{ padding: '6px 12px', opacity: currentPageIndex === 0 ? 0.5 : 1, borderRadius: '20px' }}
              >
                <ArrowLeft size={16} />
              </button>
              
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                Trang {currentPageIndex + 1} / {pages.length}
              </span>

              <button 
                className="btn btn-outline" 
                onClick={() => {
                  if (currentPageIndex === pages.length - 1) {
                    setPages([...pages, { id: 'p' + Date.now(), elements: [] }]);
                  }
                  setCurrentPageIndex(p => p + 1);
                }}
                style={{ padding: '6px 12px', borderRadius: '20px' }}
              >
                <ArrowRight size={16} />
              </button>
            </div>
    
            {/* Vùng giấy */}
            {renderPage()}
        </div>
      </div>

      {/* Dropdown Đổi Nhân Vật */}
      {activeCharDropdown && (
        <>
          <div 
            style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 99998 }} 
            onMouseDown={() => setActiveCharDropdown(null)} 
            onTouchStart={() => setActiveCharDropdown(null)} 
          />
          <div 
            className="glass-panel"
            style={{ 
              position: 'fixed', left: activeCharDropdown.x, top: activeCharDropdown.y, 
              zIndex: 99999, padding: '4px', display: 'flex', flexDirection: 'column', gap: '2px',
              maxHeight: '200px', overflowY: 'auto'
            }}
          >
            {characters.map(c => (
              <button 
                key={c}
                className="btn btn-outline"
                style={{ textAlign: 'left', padding: '8px 12px', border: 'none', background: 'transparent' }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  const newContent = `${c}: ${activeCharDropdown.charText}`;
                  const newEls = pages[currentPageIndex].elements.map(el => el.id === activeCharDropdown.id ? { ...el, content: newContent } : el);
                  updateCurrentPageElements(newEls);
                  setActiveCharDropdown(null);
                }}
                onTouchStart={(e) => {
                  e.preventDefault();
                  const newContent = `${c}: ${activeCharDropdown.charText}`;
                  const newEls = pages[currentPageIndex].elements.map(el => el.id === activeCharDropdown.id ? { ...el, content: newContent } : el);
                  updateCurrentPageElements(newEls);
                  setActiveCharDropdown(null);
                }}
              >
                {c}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
