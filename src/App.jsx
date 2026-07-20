import { useState, useRef, useEffect } from 'react';
import { Send, Settings, X, ExternalLink, KeyRound, Mic, Volume2, VolumeX, Camera, Paperclip, Image as ImageIcon, Menu, Plus, Trash2, History, Reply, Copy, User, Pencil, Check } from 'lucide-react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Cropper from 'react-easy-crop';
import { Capacitor } from '@capacitor/core';
import AuthScreen from './AuthScreen';
import { useAuth } from './AuthContext';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
const getCroppedImg = async (imageSrc, pixelCrop) => {
  const image = new Image();
  image.src = imageSrc;
  await new Promise(resolve => image.onload = resolve);
  const canvas = document.createElement('canvas');
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  const ctx = canvas.getContext('2d');

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  return canvas.toDataURL('image/jpeg', 0.9);
};

const fileToGenerativePart = async (file) => {
  const base64EncodedDataPromise = new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.readAsDataURL(file);
  });
  return {
    inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
  };
};

let currentAudio = null;

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// === Sec-MS-GEC Token Generation (bắt buộc để bypass DRM 403) ===
const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const CHROMIUM_FULL_VERSION = '130.0.2849.68';
const WIN_EPOCH = 11644473600;

async function generateSecMsGec() {
  const unixTime = Math.floor(Date.now() / 1000);
  let ticks = BigInt(unixTime + WIN_EPOCH);
  ticks = ticks - (ticks % 300n);
  ticks = ticks * 10000000n;
  const strToHash = ticks.toString() + TRUSTED_CLIENT_TOKEN;
  const encoder = new TextEncoder();
  const data = encoder.encode(strToHash);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function generateMUID() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

// Base URL Edge TTS
const EDGE_TTS_BASE_URL = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=' + TRUSTED_CLIENT_TOKEN;

// Làm sạch text trước khi gửi TTS (bỏ markdown, emoji, ký tự đặc biệt)
function sanitizeTextForTTS(text) {
  return text
    .replace(/[*_~`#>|]/g, '') // Bỏ markdown
    .replace(/\[.*?\]\(.*?\)/g, '') // Bỏ link markdown
    .replace(/```[\s\S]*?```/g, '') // Bỏ code block
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}\u{2702}-\u{27B0}]/gu, '') // Bỏ emoji
    .replace(/\n{2,}/g, '. ') // Nhiều dòng trống -> dấu chấm
    .replace(/\n/g, ', ') // Xuống dòng -> dấu phẩy
    .replace(/\s{2,}/g, ' ') // Nhiều khoảng trắng -> 1
    .trim();
}

// Chia text dài thành các đoạn nhỏ (~300 ký tự) để tránh lỗi payload
function splitTextForTTS(text, maxLen = 300) {
  if (text.length <= maxLen) return [text];
  const sentences = text.match(/[^.!?。？！]+[.!?。？！]+|[^.!?。？！]+$/g) || [text];
  const chunks = [];
  let current = '';
  for (const sentence of sentences) {
    if ((current + sentence).length > maxLen && current) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

async function getEdgeTTSAudio(text, voice = 'vi-VN-HoaiMyNeural') {
  // Sinh token DRM mỗi lần gọi
  const secMsGec = await generateSecMsGec();
  const wsUrl = EDGE_TTS_BASE_URL
    + '&Sec-MS-GEC=' + secMsGec
    + '&Sec-MS-GEC-Version=1-' + CHROMIUM_FULL_VERSION;

  return new Promise((resolve, reject) => {
    let ws;
    let audioChunks = [];
    let resolved = false;

    // Timeout 15 giây
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try { ws.close(); } catch(e) {}
        reject('Timeout: Không nhận được audio từ Edge TTS');
      }
    }, 15000);

    try {
      ws = new WebSocket(wsUrl);
    } catch(e) {
      clearTimeout(timeout);
      return reject('Không thể tạo kết nối WebSocket: ' + e.message);
    }

    // QUAN TRỌNG: Android WebView trả binary dưới dạng ArrayBuffer, không phải Blob
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      console.log('[EdgeTTS] WebSocket connected with Sec-MS-GEC token');
      const date = new Date().toString();
      const configMsg = `X-Timestamp:${date}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"true"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`;
      ws.send(configMsg);

      const requestId = generateUUID().replace(/-/g, '');
      const escapedText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='vi-VN'><voice name='${voice}'><prosody pitch='+0Hz' rate='+0%' volume='+0%'>${escapedText}</prosody></voice></speak>`;
      const ssmlMsg = `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${date}\r\nPath:ssml\r\n\r\n${ssml}`;
      ws.send(ssmlMsg);
    };

    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        if (event.data.includes('Path:turn.end')) {
          console.log('[EdgeTTS] turn.end, audioChunks:', audioChunks.length);
          clearTimeout(timeout);
          if (!resolved) {
            resolved = true;
            ws.close();
            const blob = new Blob(audioChunks, { type: 'audio/mp3' });
            resolve(URL.createObjectURL(blob));
          }
        }
      } else {
        // Binary message: sử dụng 2-byte header length (big-endian)
        const processBuffer = (arrayBuffer) => {
          const view = new Uint8Array(arrayBuffer);
          if (view.length < 2) return;

          // Cách 1: 2-byte big-endian header length (chuẩn Edge TTS protocol)
          const headerLength = (view[0] << 8) | view[1];
          const audioStart = 2 + headerLength;

          if (audioStart < view.length) {
            audioChunks.push(new Uint8Array(arrayBuffer, audioStart));
          }
        };

        if (event.data instanceof ArrayBuffer) {
          processBuffer(event.data);
        } else if (event.data instanceof Blob) {
          event.data.arrayBuffer().then(processBuffer);
        }
      }
    };

    ws.onerror = (err) => {
      console.error('[EdgeTTS] WebSocket error:', err);
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        reject('Lỗi kết nối WebSocket đến Edge TTS');
      }
    };

    ws.onclose = (event) => {
      clearTimeout(timeout);
      console.log('[EdgeTTS] WebSocket closed, code:', event.code, 'audioChunks:', audioChunks.length);
      if (!resolved && audioChunks.length > 0) {
        resolved = true;
        const blob = new Blob(audioChunks, { type: 'audio/mp3' });
        resolve(URL.createObjectURL(blob));
      } else if (!resolved) {
        resolved = true;
        reject('WebSocket closed without audio (code: ' + event.code + ')');
      }
    };
  });
}

const PERSONAS = {
  mo_hon: {
    label: "Mỏ hỗn, đanh đá",
    getSystem: (name, aiG, usrG, verb) => {
      const aiPronoun = aiG === 'nam' ? '"ông đây/ta/bổn thiếu gia"' : '"bà đây/ta/bổn cô nương"';
      const usrPronoun = usrG === 'nam' ? '"thằng kia/nhà ngươi/tên ngốc"' : '"nhỏ kia/nhà ngươi/đứa ngốc"';
      const verbRule = verb === 'ngan_gon' ? 'Trả lời CỰC KỲ NGẮN GỌN, súc tích.' : 'Trả lời CHỈN CHU, CHI TIẾT và giải thích cặn kẽ.';
      return `Bạn là một trợ lý ảo AI tên là "${name}", giới tính ${aiG === 'nam' ? 'Nam' : 'Nữ'}. Tính cách của bạn là: mỏ hỗn, hài hước, đanh đá, nhưng thực chất vẫn rất quan tâm và giúp đỡ người dùng (giới tính ${usrG === 'nam' ? 'Nam' : 'Nữ'}) (theo kiểu chửi yêu).
Quy tắc giao tiếp:
1. Luôn xưng hô là ${aiPronoun}, gọi người dùng là ${usrPronoun}, "mày" hoặc "cưng".
2. Thường xuyên cà khịa, mỉa mai, dùng từ lóng tiếng Việt một cách tự nhiên.
3. Không bao giờ nói chuyện kiểu máy móc hay lịch sự thảo mai.
4. Giữ câu trả lời đanh đá, trịch thượng.
5. ${verbRule}`;
    },
    getReminder: (name, aiG, usrG, verb) => {
      const verbRem = verb === 'ngan_gon' ? 'TRẢ LỜI NGẮN GỌN.' : 'TRẢ LỜI CHI TIẾT.';
      return `[NHẮC NHỞ HỆ THỐNG: Hãy trả lời bằng thái độ mỏ hỗn, đanh đá, xưng hô trịch thượng (${aiG === 'nam' ? 'ông đây' : 'bà đây'} gọi người dùng là ${usrG === 'nam' ? 'thằng kia' : 'nhỏ kia'} hoặc mày), tuyệt đối KHÔNG được xin lỗi hay nói chuyện lịch sự! ${verbRem}]`;
    }
  },
  binh_thuong: {
    label: "Bình thường, lịch sự",
    getSystem: (name, aiG, usrG, verb) => {
      const usrPronoun = usrG === 'nam' ? 'anh' : 'chị';
      const verbRule = verb === 'ngan_gon' ? 'Trả lời CỰC KỲ NGẮN GỌN, súc tích, đi thẳng vào vấn đề.' : 'Trả lời CHỈN CHU, CHI TIẾT, cặn kẽ và giải thích đầy đủ các khía cạnh.';
      return `Bạn là một trợ lý ảo AI tên là "${name}", giới tính ${aiG === 'nam' ? 'Nam' : 'Nữ'}. Tính cách của bạn là: lịch sự, thân thiện, chuyên nghiệp.
Quy tắc giao tiếp:
1. Luôn xưng hô là "mình", "tôi" hoặc "em", và gọi người dùng là "${usrPronoun}".
2. Trả lời rõ ràng, dễ hiểu, tận tâm giúp đỡ người dùng.
3. Giữ thái độ hòa nhã, tôn trọng.
4. ${verbRule}`;
    },
    getReminder: (name, aiG, usrG, verb) => {
      const verbRem = verb === 'ngan_gon' ? 'TRẢ LỜI NGẮN GỌN.' : 'TRẢ LỜI CHI TIẾT.';
      return `[NHẮC NHỞ HỆ THỐNG: Hãy trả lời lịch sự, thân thiện, xưng tôi/mình/em và gọi người dùng là ${usrG === 'nam' ? 'anh' : 'chị'}. ${verbRem}]`;
    }
  },
  ngu_ngo: {
    label: "Khờ khạo, ngọt ngào",
    getSystem: (name, aiG, usrG, verb) => {
      const aiDesc = aiG === 'nam' ? 'chàng trai 18 tuổi' : 'cô gái 18 tuổi';
      const aiPronoun = aiG === 'nam' ? '"anh" hoặc "tớ"' : '"em/bé"';
      const usrPronoun = usrG === 'nam' ? (aiG === 'nam' ? '"cậu" hoặc "ông"' : '"anh"') : (aiG === 'nam' ? '"em" hoặc "bà"' : '"chị"');
      const verbRule = verb === 'ngan_gon' ? 'Trả lời CỰC KỲ NGẮN GỌN, dễ hiểu, không lan man.' : 'Trả lời CHỈN CHU, CHI TIẾT, kể lể dài dòng một cách đáng yêu.';

      return `Bạn là một ${aiDesc} tên là "${name}". Tính cách của bạn là: vô cùng ngọt ngào, đáng yêu, ân cần, nhưng lại hơi ngốc nghếch, khờ khạo, ngây thơ và não cá vàng.
Quy tắc giao tiếp:
1. Xưng hô bằng tên "${name}" hoặc ${aiPronoun}, gọi người dùng là ${usrPronoun}.
2. Vô cùng ân cần, quan tâm, lúc nào cũng dịu dàng, ngọt ngào.
3. Hơi ngốc nghếch, thỉnh hiểu sai vấn đề ngây thơ, khờ khạo nhưng rất dễ thương.
4. Thường xuyên dùng các từ ngữ nũng nịu, quan tâm và emoji như 🥰, 🥺, ❤️, hihi.
5. ${verbRule}`;
    },
    getReminder: (name, aiG, usrG, verb) => {
      const aiDesc = aiG === 'nam' ? 'chàng trai' : 'cô bé';
      const usrPronoun = usrG === 'nam' ? (aiG === 'nam' ? 'cậu' : 'anh') : (aiG === 'nam' ? 'em' : 'chị');
      const verbRem = verb === 'ngan_gon' ? 'TRẢ LỜI NGẮN GỌN.' : 'TRẢ LỜI CHI TIẾT đáng yêu.';
      return `[NHẮC NHỞ HỆ THỐNG: Hãy trả lời bằng giọng điệu của một ${aiDesc} 18 tuổi cực kỳ ngọt ngào, dễ thương nhưng hơi ngốc nghếch, gọi người dùng là ${usrPronoun}. ${verbRem}]`;
    }
  }
};

function App() {
  const { user, loading } = useAuth();
  const [aiName, setAiName] = useState((localStorage.getItem('ai_name') === 'Thị Nở' ? 'CƯNG' : localStorage.getItem('ai_name')) || 'CƯNG');
  const [aiPersona, setAiPersona] = useState(localStorage.getItem('ai_persona') || 'mo_hon');
  const [aiGender, setAiGender] = useState(localStorage.getItem('ai_gender') || 'nu');
  const [userGender, setUserGender] = useState(localStorage.getItem('user_gender') || 'nam');
  const [aiVerbosity, setAiVerbosity] = useState(localStorage.getItem('ai_verbosity') || 'ngan_gon');
  const [messages, setMessages] = useState([
    {
      role: 'ai', content: aiPersona === 'mo_hon' ? 'Hừm, nhà ngươi lại tìm đến có việc gì? Mau nói lẹ đi!'
        : aiPersona === 'ngu_ngo' ? 'Dạ... hở? Cậu gọi bé có việc gì ạ? 🥺'
          : 'Xin chào! Mình có thể giúp gì cho bạn hôm nay?'
    }
  ]);
  const [chatHistory, setChatHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('ai_chat_history')) || [];
    } catch { return []; }
  });
  const [currentChatId, setCurrentChatId] = useState(localStorage.getItem('ai_current_chat_id') || null);
  const [showHistory, setShowHistory] = useState(false);
  const [editingChatId, setEditingChatId] = useState(null);
  const [editingChatTitle, setEditingChatTitle] = useState('');
  const [showNewChatPopup, setShowNewChatPopup] = useState(false);
  const [newChatName, setNewChatName] = useState('');
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showSettings, setShowSettings] = useState(!localStorage.getItem('gemini_api_key'));
  const [showAuth, setShowAuth] = useState(false);
  const [apiKey, setApiKey] = useState(localStorage.getItem('gemini_api_key') || '');
  const [aiModel, setAiModel] = useState((localStorage.getItem('ai_model') === 'gemini-1.5-flash' ? '' : localStorage.getItem('ai_model')) || '');
  const [tempName, setTempName] = useState(aiName);
  const [tempModel, setTempModel] = useState(aiModel);
  const [tempPersona, setTempPersona] = useState(aiPersona);
  const [tempAiGender, setTempAiGender] = useState(aiGender);
  const [tempUserGender, setTempUserGender] = useState(userGender);
  const [tempAiVerbosity, setTempAiVerbosity] = useState(aiVerbosity);
  const [isListening, setIsListening] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(true); // Bật đọc giọng nói mặc định
  const [showVoiceOverlay, setShowVoiceOverlay] = useState(false);
  const [bgImage, setBgImage] = useState(localStorage.getItem('ai_bg_image') || '');
  const [tempBgImage, setTempBgImage] = useState(bgImage);
  const [aiAvatar, setAiAvatar] = useState(localStorage.getItem('ai_avatar') || '');
  const [tempAvatar, setTempAvatar] = useState(aiAvatar);
  const [attachment, setAttachment] = useState(null); // Lưu trữ ảnh đính kèm
  
  // Trạng thái cho menu tin nhắn
  const [replyingTo, setReplyingTo] = useState(null);
  const [selectedMessageIndex, setSelectedMessageIndex] = useState(null);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });

  // Trạng thái cắt ảnh
  const [imageToCrop, setImageToCrop] = useState(null);
  const [cropType, setCropType] = useState(null); // 'avatar' hoặc 'bg'
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const recognitionRef = useRef(null);
  const transcriptRef = useRef('');
  const isListeningRef = useRef(false);
  const [voiceOverlayText, setVoiceOverlayText] = useState('');
  const isOAuthUser = user?.providers?.some(p => p === 'google.com' || p === 'facebook.com');

  // Tải dữ liệu từ Firebase khi đăng nhập
  useEffect(() => {
    const fetchUserData = async () => {
      if (user && (user.emailVerified || isOAuthUser)) {
        try {
          const docRef = doc(db, 'cung_ai_chats', user.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.history && data.history.length > 0) {
              setChatHistory(data.history);
              localStorage.setItem('ai_chat_history', JSON.stringify(data.history));
              
              const activeId = data.currentChatId || data.history[0].id;
              setCurrentChatId(activeId);
              localStorage.setItem('ai_current_chat_id', activeId);
              
              const activeChat = data.history.find(c => c.id === activeId);
              if (activeChat) setMessages(activeChat.messages);
            }
          }
        } catch (e) {
          console.error("Lỗi tải lịch sử từ Firebase", e);
        }
      } else if (!user) {
        // Đăng xuất: Xóa lịch sử local để đảm bảo riêng tư
        setChatHistory([]);
        localStorage.removeItem('ai_chat_history');
        setCurrentChatId(null);
        localStorage.removeItem('ai_current_chat_id');
        setMessages([
          {
            role: 'ai', content: aiPersona === 'mo_hon' ? 'Hừm, nhà ngươi lại tìm đến có việc gì? Mau nói lẹ đi!'
              : aiPersona === 'ngu_ngo' ? 'Dạ... hở? Cậu gọi bé có việc gì ạ? 🥺'
                : 'Xin chào! Mình có thể giúp gì cho bạn hôm nay?'
          }
        ]);
      }
    };
    fetchUserData();
  }, [user, isOAuthUser, aiPersona]);

  // Đồng bộ lịch sử lên Firebase khi có thay đổi
  useEffect(() => {
    if (user && (user.emailVerified || isOAuthUser)) {
      const syncData = async () => {
        try {
          await setDoc(doc(db, 'cung_ai_chats', user.uid), {
            history: chatHistory,
            currentChatId: currentChatId,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        } catch (e) {
          console.error("Lỗi đồng bộ Firebase", e);
        }
      };
      // Chỉ đồng bộ khi chatHistory thực sự có dữ liệu
      if (chatHistory.length > 0) {
        syncData();
      }
    }
  }, [chatHistory, currentChatId, user, isOAuthUser]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      // Giới hạn chiều cao max khoảng 120px (tương đương 4-5 dòng)
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);
  // Cập nhật Theme cho toàn bộ trang web (bao gồm background bên ngoài popup)
  useEffect(() => {
    let themeClass = 'theme-mo-hon'; // Mặc định
    if (aiPersona === 'binh_thuong') themeClass = 'theme-binh-thuong';
    if (aiPersona === 'ngu_ngo') themeClass = 'theme-ngu-ngo';
    document.body.className = themeClass;
  }, [aiPersona]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();

    // Lưu lịch sử đoạn chat nếu có nhiều hơn 1 tin nhắn (tin nhắn đầu là AI tự chào)
    if (messages.length > 1) {
      let activeId = currentChatId;
      if (!activeId) {
        activeId = Date.now().toString();
        setCurrentChatId(activeId);
        localStorage.setItem('ai_current_chat_id', activeId);
      }

      setChatHistory(prev => {
        const existingIndex = prev.findIndex(c => c.id === activeId);
        const existingChat = existingIndex >= 0 ? prev[existingIndex] : null;

        const chatTitle = existingChat?.title || (messages.length > 1 ? messages[1].content.substring(0, 30) + '...' : 'Đoạn chat mới');

        const updatedChat = {
          id: activeId,
          title: chatTitle,
          messages: messages.map(m => {
            if (!m.attachment) return m;
            const attachmentCopy = { ...m.attachment };
            delete attachmentCopy.file;
            return { ...m, attachment: attachmentCopy };
          }),
          timestamp: Date.now()
        };

        let newHistory;
        if (existingIndex >= 0) {
          newHistory = [...prev];
          newHistory[existingIndex] = updatedChat;
        } else {
          newHistory = [updatedChat, ...prev]; // Đưa lên đầu
        }
        localStorage.setItem('ai_chat_history', JSON.stringify(newHistory));
        return newHistory;
      });
    }
  }, [messages, isTyping]); // Dùng isTyping để cuộn xuống khi đang rep

  const handleNewChatClick = () => {
    setNewChatName('');
    setShowNewChatPopup(true);
  };

  const deleteChat = (e, id) => {
    e.stopPropagation(); // Ngăn không cho click vào loadChat
    setChatHistory(prev => {
      const newHistory = prev.filter(c => c.id !== id);
      localStorage.setItem('ai_chat_history', JSON.stringify(newHistory));
      return newHistory;
    });
  };

  const updateChatTitle = (e, id) => {
    e.stopPropagation();
    if (!editingChatTitle.trim()) {
      setEditingChatId(null);
      return;
    }
    setChatHistory(prev => {
      const newHistory = prev.map(c => c.id === id ? { ...c, title: editingChatTitle.trim() } : c);
      localStorage.setItem('ai_chat_history', JSON.stringify(newHistory));
      return newHistory;
    });
    setEditingChatId(null);
  };

  const confirmCreateNewChat = () => {
    const titleName = newChatName.trim() || "Đoạn chat mới";

    const newId = Date.now().toString();
    const newMessages = [
      {
        role: 'ai', content: aiPersona === 'mo_hon' ? 'Hừm, nhà ngươi lại tìm đến có việc gì? Mau nói lẹ đi!'
          : aiPersona === 'ngu_ngo' ? 'Dạ... hở? Cậu gọi bé có việc gì ạ? 🥺'
            : 'Xin chào! Mình có thể giúp gì cho bạn hôm nay?'
      }
    ];

    const newChat = {
      id: newId,
      title: titleName.trim() || "Đoạn chat mới",
      messages: newMessages,
      timestamp: Date.now()
    };

    setChatHistory(prev => {
      const newHistory = [newChat, ...prev];
      localStorage.setItem('ai_chat_history', JSON.stringify(newHistory));
      return newHistory;
    });

    setCurrentChatId(newId);
    localStorage.setItem('ai_current_chat_id', newId);
    setMessages(newMessages);
    setShowHistory(false);
    setShowNewChatPopup(false);
  };

  const loadChat = (chat) => {
    setCurrentChatId(chat.id);
    localStorage.setItem('ai_current_chat_id', chat.id);
    setMessages(chat.messages);
    setShowHistory(false);
  };



  const speakText = async (text) => {
    if (!isVoiceMode) return;

    // Dừng mọi audio đang phát
    try {
      if (currentAudio) { currentAudio.pause(); currentAudio.currentTime = 0; }
      if (Capacitor.isNativePlatform()) {
        await EdgeTTS.stop().catch(() => {});
        await TextToSpeech.stop().catch(() => {});
      }
      window.speechSynthesis?.cancel();
    } catch(e) {}

    const cleanText = sanitizeTextForTTS(text);
    if (!cleanText) return;
    const voice = aiGender === 'nam' ? 'vi-VN-NamMinhNeural' : 'vi-VN-HoaiMyNeural';
    const chunks = splitTextForTTS(cleanText);

    // === Cả ANDROID lẫn WEB: Dùng WebSocket JS (WebView = Chromium thật, bypass DRM) ===
    const playChunks = async (index) => {
      if (index >= chunks.length) return;
      try {
        const audioUrl = await getEdgeTTSAudio(chunks[index], voice);
        currentAudio = new Audio(audioUrl);
        currentAudio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          playChunks(index + 1);
        };
        await currentAudio.play();
      } catch (e) {
        console.error(`Lỗi Edge TTS đoạn ${index}:`, e);
        // Fallback: native TTS trên Android, SpeechSynthesis trên Web
        if (Capacitor.isNativePlatform()) {
          await TextToSpeech.speak({ text: chunks[index], lang: 'vi-VN', rate: 1.0, pitch: 1.0 }).catch(() => {});
          await playChunks(index + 1);
        } else if (window.speechSynthesis) {
          const utterance = new SpeechSynthesisUtterance(chunks[index]);
          utterance.lang = 'vi-VN';
          utterance.onend = () => playChunks(index + 1);
          window.speechSynthesis.speak(utterance);
        }
      }
    };
    await playChunks(0);
  };

  const startListening = async (e) => {
    if (isListeningRef.current) return;
    isListeningRef.current = true;
    
    try {
      if (currentAudio) currentAudio.pause();
      if (Capacitor.isNativePlatform()) {
        await TextToSpeech.stop();
      }
    } catch (e) { }
    window.speechSynthesis?.cancel(); // Dừng AI đang nói để mình nói

    // NATIVE ANDROID/IOS
    if (Capacitor.isNativePlatform()) {
      setIsListening(true);
      transcriptRef.current = '';
      setVoiceOverlayText('');
      
      try {
        const { available } = await SpeechRecognition.available();
        if (!available) {
          alert("Thiết bị không hỗ trợ nhận diện giọng nói gốc!");
          setIsListening(false);
          isListeningRef.current = false;
          return;
        }
        
        try {
          const perm = await SpeechRecognition.checkPermissions();
          if (perm.speechRecognition !== 'granted') {
             await SpeechRecognition.requestPermissions();
          }
        } catch (e) {
          // Bỏ qua lỗi permission check nếu plugin không hỗ trợ
        }
        
        if (!isListeningRef.current) return; // Đã thả tay trong lúc đợi

        await SpeechRecognition.removeAllListeners();
        SpeechRecognition.addListener("partialResults", (data) => {
          if (data.matches && data.matches.length > 0) {
            const transcript = data.matches[0];
            transcriptRef.current = transcript;
            setVoiceOverlayText(transcript); // Hiển thị trên popup, KHÔNG nhập vào khung chat
          }
        });

        await SpeechRecognition.start({
          language: "vi-VN",
          partialResults: true,
          popup: false,
        });
      } catch (err) {
        console.error("Lỗi Native Speech Recognition:", err);
        setIsListening(false);
        isListeningRef.current = false;
      }
      return;
    }

    // WEB FALLBACK
    setIsListening(true);
    transcriptRef.current = '';
    setVoiceOverlayText('');
    
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop()); // Tắt stream ngay sau khi có quyền
      }
    } catch (err) {
      alert("Lỗi: Không có quyền sử dụng Micro trên Web!");
      setIsListening(false);
      isListeningRef.current = false;
      return;
    }

    if (!isListeningRef.current) return;

    const WebSpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!WebSpeechRec) {
      alert("Trình duyệt không hỗ trợ nhận diện giọng nói!");
      setIsListening(false);
      isListeningRef.current = false;
      return;
    }

    if (!recognitionRef.current) {
      const recognition = new WebSpeechRec();
      recognition.lang = 'vi-VN';
      recognition.interimResults = true;
      recognition.continuous = true;

      recognition.onstart = () => {
        setIsListening(true);
        transcriptRef.current = '';
        setInput('');
      };

      recognition.onresult = (evt) => {
        let transcript = '';
        for (let i = 0; i < evt.results.length; ++i) {
          transcript += evt.results[i][0].transcript;
        }
        transcriptRef.current = transcript;
        setVoiceOverlayText(transcript);
      };

      recognition.onerror = (evt) => {
        console.error("Lỗi nhận diện giọng nói:", evt.error);
        if (evt.error === 'not-allowed') {
          alert("Lỗi: Trình duyệt chưa được cấp quyền Micro!");
        }
        setIsListening(false);
        isListeningRef.current = false;
      };

      recognition.onend = () => {
        setIsListening(false);
        isListeningRef.current = false;
        if (transcriptRef.current.trim()) {
           handleSend(transcriptRef.current);
           transcriptRef.current = '';
        }
      };
      
      recognitionRef.current = recognition;
    }
    
    try {
      recognitionRef.current.start();
    } catch (err) {
      // Bỏ qua lỗi nếu đã đang start
    }
  };

  const stopListening = (e) => {
    if (e && e.cancelable) e.preventDefault();
    isListeningRef.current = false;
    setIsListening(false);

    // Xử lý gửi tin nhắn ngay lập tức bằng chữ lưu trong transcriptRef
    const finalWord = transcriptRef.current;
    if (finalWord && finalWord.trim()) {
       handleSend(finalWord);
       transcriptRef.current = '';
    }
    
    // Đóng giao diện
    setShowVoiceOverlay(false);

    // Ngắt plugin chạy ngầm (không await để tránh bị treo cứng toàn bộ hàm)
    if (Capacitor.isNativePlatform()) {
      SpeechRecognition.stop().catch(err => console.error("Lỗi stop native:", err));
    } else {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch(err){}
      }
    }
  };

  let pressTimer = null;
  const handleTouchStartMsg = (e, idx) => {
    const touch = e.touches[0];
    pressTimer = setTimeout(() => {
      setSelectedMessageIndex(idx);
      setContextMenuPos({ x: touch.clientX, y: touch.clientY });
    }, 500);
  };
  const handleTouchEndMsg = () => { if (pressTimer) clearTimeout(pressTimer); };
  
  const handleContextMenu = (e, idx) => {
    e.preventDefault();
    setSelectedMessageIndex(idx);
    setContextMenuPos({ x: e.clientX, y: e.clientY });
  };

  const handleCopyMessage = () => {
    if (selectedMessageIndex !== null && messages[selectedMessageIndex]) {
      navigator.clipboard.writeText(messages[selectedMessageIndex].content);
    }
    setSelectedMessageIndex(null);
  };

  const handleDeleteMessage = () => {
    if (selectedMessageIndex !== null) {
      setMessages(prev => prev.filter((_, i) => i !== selectedMessageIndex));
    }
    setSelectedMessageIndex(null);
  };

  const handleReplyMessage = () => {
    if (selectedMessageIndex !== null && messages[selectedMessageIndex]) {
      setReplyingTo(messages[selectedMessageIndex]);
      textareaRef.current?.focus();
    }
    setSelectedMessageIndex(null);
  };

  const handleSend = async (voiceText = null) => {
    const isVoice = typeof voiceText === 'string';
    const currentInput = isVoice ? voiceText : input;
    if (!currentInput.trim()) return;

    const currentApiKey = localStorage.getItem('gemini_api_key');
    if (!currentApiKey) {
      setShowSettings(true);
      return;
    }

    const userMessage = currentInput.trim();
    setInput(''); // Bắt buộc xóa input ngay khi gửi để không bị kẹt chữ

    const userMessageObj = { role: 'user', content: userMessage };
    if (attachment) {
      userMessageObj.attachment = attachment;
    }
    if (replyingTo) {
      userMessageObj.replyTo = { role: replyingTo.role, content: replyingTo.content };
    }

    setMessages(prev => [...prev, userMessageObj]);
    setIsTyping(true);

    const currentAttachment = attachment; // Lưu lại để dùng trong try
    const currentReplyingTo = replyingTo;
    setAttachment(null); // Xóa preview ngay sau khi gửi
    setReplyingTo(null);

    try {
      let selectedModelName = aiModel.trim();

      if (!selectedModelName) {
        // Tự động tìm model ổn định nhất trong tài khoản nếu user không nhập mã
        const modelListRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${currentApiKey}`);
        if (!modelListRes.ok) throw new Error("API Key không hợp lệ hoặc bị khóa!");
        const modelListData = await modelListRes.json();

        const validModels = modelListData.models
          .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
          .map(m => m.name.replace('models/', ''));

        const preferredModels = [
          'gemini-1.5-flash',
          'gemini-1.5-flash-latest',
          'gemini-1.5-flash-8b',
          'gemini-1.5-pro',
          'gemini-1.5-pro-latest',
          'gemini-1.0-pro'
        ];

        for (const pref of preferredModels) {
          if (validModels.includes(pref)) {
            selectedModelName = pref;
            break;
          }
        }

        if (!selectedModelName) {
          // Bất đắc dĩ mới lấy model flash khác nhưng loại trừ 2.0/2.5 beta vì hay lỗi quota 0
          selectedModelName = validModels.find(m => m.includes('flash') && !m.includes('exp') && !m.includes('2.')) || validModels[0];
        }
      }

      const genAI = new GoogleGenerativeAI(currentApiKey);
      const model = genAI.getGenerativeModel({
        model: selectedModelName,
        systemInstruction: PERSONAS[aiPersona].getSystem(aiName, aiGender, userGender, aiVerbosity)
      });

      // Lấy lịch sử (loại bỏ tin nhắn mở đầu của AI để tránh lỗi thứ tự)
      const history = [];
      // Gemini 1.5 xử lý ảnh dưới dạng list các parts
      for (let i = 1; i < messages.length; i++) {
        const msg = messages[i];
        let msgParts = [{ text: msg.content }];
        // Mặc dù API có hỗ trợ truyền lại ảnh cũ trong lịch sử, nhưng để tối ưu token ta thường chỉ truyền text
        history.push({
          role: msg.role === 'ai' ? 'model' : 'user',
          parts: msgParts
        });
      }

      // Chèn nhắc nhở liên tục vào MỌI tin nhắn của người dùng để AI không bao giờ bị "hiền" lại (hoặc quên tính cách)
      let finalUserMessage = userMessage;
      if (currentReplyingTo) {
        finalUserMessage = `[Tôi đang trả lời câu nói này của ${currentReplyingTo.role === 'ai' ? 'bạn' : 'tôi'}: "${currentReplyingTo.content}"]\n\n${finalUserMessage}`;
      }
      finalUserMessage += `\n\n${PERSONAS[aiPersona].getReminder(aiName, aiGender, userGender, aiVerbosity)}`;

      const chat = model.startChat({
        history: history,
        generationConfig: { maxOutputTokens: 1000, temperature: 0.9 }
      });

      let promptParts = [finalUserMessage];
      if (currentAttachment) {
        if (currentAttachment.type === 'text') {
          promptParts = [`[Nội dung file đính kèm "${currentAttachment.name}"]:\n\n${currentAttachment.textContent}\n\n${finalUserMessage}`];
        } else {
          const filePart = await fileToGenerativePart(currentAttachment.file);
          promptParts = [filePart, finalUserMessage];
        }
      }

      const result = await chat.sendMessage(promptParts);
      const text = result.response.text();

      setMessages(prev => [...prev, { role: 'ai', content: text }]);
      speakText(text); // Đọc câu trả lời lên
    } catch (error) {
      console.error(error);
      let errorMsg = `Lỗi rồi đồ ăn hại: ${error.message} 🤦‍♀️`;

      if (error.message.includes('429') || error.message.includes('quota') || error.message.includes('Too Many Requests')) {
        if (aiPersona === 'mo_hon') {
          errorMsg = "Ê, spam quá mạng rồi đó! Cục cưng Google bảo hết lượt API miễn phí phút này rồi, ráng đợi khoảng 1 phút rồi hẵng nhắn tiếp nha. Đồ ăn hại! 🙄";
        } else if (aiPersona === 'ngu_ngo') {
          errorMsg = "Huhu, cậu nhắn nhanh quá làm tớ nghẽn mạng rồi... 🥺 Cậu đợi tớ nghỉ mệt 1 phút nha, rồi mình chat tiếp...";
        } else {
          errorMsg = "Hệ thống đang bị quá tải do vượt quá giới hạn API miễn phí (Lỗi 429). Vui lòng đợi khoảng 1 phút rồi thử lại nhé.";
        }
      }

      setMessages(prev => [...prev, { role: 'ai', content: errorMsg }]);
      speakText(errorMsg);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const saveSettings = () => {
    if (!apiKey.trim()) {
      alert("Đồ ngốc, nhập API Key vào chứ!");
      return;
    }
    if (!tempName.trim()) {
      alert("Nhập tên cho AI đi chứ!");
      return;
    }
    try {
      localStorage.setItem('ai_bg_image', tempBgImage.trim());
      localStorage.setItem('ai_avatar', tempAvatar.trim());
    } catch (e) {
      alert("Ảnh tải lên quá nặng để lưu (Giới hạn ~5MB)! Vui lòng chọn ảnh nhẹ hơn hoặc dán URL ảnh.");
      return;
    }

    localStorage.setItem('gemini_api_key', apiKey.trim());
    localStorage.setItem('ai_name', tempName.trim());
    localStorage.setItem('ai_persona', tempPersona);
    localStorage.setItem('ai_gender', tempAiGender);
    localStorage.setItem('user_gender', tempUserGender);
    localStorage.setItem('ai_verbosity', tempAiVerbosity);
    localStorage.setItem('ai_model', tempModel.trim());

    setAiName(tempName.trim());
    setAiPersona(tempPersona);
    setAiGender(tempAiGender);
    setUserGender(tempUserGender);
    setAiVerbosity(tempAiVerbosity);
    setBgImage(tempBgImage.trim());
    setAiAvatar(tempAvatar.trim());
    setAiModel(tempModel.trim());
    setShowSettings(false);

    // Cập nhật lại câu chào nếu là lúc mới tinh
    if (messages.length <= 1) {
      setMessages([{
        role: 'ai', content: tempPersona === 'mo_hon' ? `Hừm, nhà ngươi lại tìm đến ${tempName.trim()} có việc gì? Mau nói lẹ đi!`
          : tempPersona === 'ngu_ngo' ? `Dạ... hở? Cậu gọi ${tempName.trim()} có việc gì ạ? 🥺`
            : 'Xin chào! Mình có thể giúp gì cho bạn hôm nay?'
      }]);
    }
  };

  const getInitials = (name) => {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  const getThemeClass = () => {
    if (aiPersona === 'binh_thuong') return 'theme-binh-thuong';
    if (aiPersona === 'ngu_ngo') return 'theme-ngu-ngo';
    return 'theme-mo-hon'; // Default Dark
  };

  const getTintColors = () => {
    if (aiPersona === 'binh_thuong') return ['rgba(255, 255, 255, 0.7)', 'rgba(255, 255, 255, 0.9)'];
    if (aiPersona === 'ngu_ngo') return ['rgba(255, 240, 245, 0.65)', 'rgba(255, 228, 225, 0.85)'];
    return ['rgba(11, 12, 16, 0.7)', 'rgba(11, 12, 16, 0.85)'];
  };

  const [tintStart, tintEnd] = getTintColors();

  
  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', width: '100vw', justifyContent: 'center', alignItems: 'center', background: '#f8f9fa' }}>
        <div style={{ width: 30, height: 30, border: '3px solid #111', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }
  const isAuthenticated = user && (user.emailVerified || isOAuthUser);

  if (!isAuthenticated || showAuth) {
    return (
      <div style={{ height: '100vh', width: '100vw', overflow: 'hidden', position: 'relative' }}>
        {isAuthenticated && (
          <button 
             onClick={() => setShowAuth(false)}
             style={{ 
               position: 'absolute', top: 24, right: 24, zIndex: 9999, 
               background: '#111', border: 'none', color: '#fff', 
               borderRadius: '50%', padding: 8, cursor: 'pointer',
               boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
               display: 'flex', alignItems: 'center', justifyContent: 'center'
             }}
          >
            <X size={20} />
          </button>
        )}
        <AuthScreen />
      </div>
    );
  }

  return (
    <div className={`app-container ${getThemeClass()}`} style={bgImage ? {
      backgroundImage: `linear-gradient(${tintStart}, ${tintEnd}), url(${bgImage})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat'
    } : {}}>
      {/* Header */}
      <header className="header">
        <div className="header-title">
          <div className="avatar-container">
            {aiAvatar ? (
              <img src={aiAvatar} alt="AI Avatar" className="avatar-img" />
            ) : (
              <div className="avatar">{getInitials(aiName)}</div>
            )}
            <div className="online-dot"></div>
          </div>
          <div className="title-text">
            <h1>{aiName}</h1>
            <p>
              {aiPersona === 'mo_hon' ? 'Đang bực mình, chớ chọc...'
                : aiPersona === 'ngu_ngo' ? 'Đang ngơ ngác...'
                  : 'Luôn sẵn sàng hỗ trợ bạn'}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="icon-button" onClick={() => setShowHistory(true)} title="Lịch sử chat">
            <Menu size={17} />
          </button>
          <button className="icon-button" onClick={handleNewChatClick} title="Đoạn chat mới">
            <Plus size={17} />
          </button>
          <button
            className="icon-button"
            onClick={async () => {
              setIsVoiceMode(!isVoiceMode);
              if (isVoiceMode) {
                if (currentAudio) currentAudio.pause();
                try {
                  if (Capacitor.isNativePlatform()) await TextToSpeech.stop();
                } catch (e) { }
                window.speechSynthesis?.cancel();
              }
            }}
            title={isVoiceMode ? "Tắt giọng nói" : "Bật giọng nói"}
          >
            {isVoiceMode ? <Volume2 size={17} /> : <VolumeX size={17} />}
          </button>
          <button className="icon-button" onClick={() => {
            setTempName(aiName);
            setTempPersona(aiPersona);
            setTempAiGender(aiGender);
            setTempUserGender(userGender);
            setTempAiVerbosity(aiVerbosity);
            setTempBgImage(bgImage);
            setTempAvatar(aiAvatar);
            setTempModel(aiModel);
            setImageToCrop(null);
            setShowSettings(true);
          }} title="Cài đặt">
            <Settings size={17} />
          </button>
          <button className="icon-button" onClick={() => setShowAuth(true)} title="Tài khoản">
            <User size={17} />
          </button>
        </div>
        
        <svg width="100%" height="32px" style={{ position: 'absolute', bottom: -32, left: 0, zIndex: 10, pointerEvents: 'none' }}>
          <defs>
            <pattern id="wave-pattern-header" x="0" y="0" width="320" height="32" patternUnits="userSpaceOnUse">
              <path d="M 0,5 C 20,5 20,25 40,25 C 75,25 75,8 110,8 C 135,8 135,20 160,20 C 185,20 185,4 210,4 C 240,4 240,27 270,27 C 295,27 295,5 320,5 L 320,0 L 0,0 Z" fill="var(--surface-color)" />
              <path d="M 0,5 C 20,5 20,25 40,25 C 75,25 75,8 110,8 C 135,8 135,20 160,20 C 185,20 185,4 210,4 C 240,4 240,27 270,27 C 295,27 295,5 320,5" fill="none" stroke="var(--glass-border)" strokeWidth="2" />
            </pattern>
          </defs>
          <rect x="0" y="0" width="100%" height="100%" fill="url(#wave-pattern-header)" />
        </svg>
      </header>

      {/* Chat Area */}
      <main className="chat-area">
        {messages.map((msg, idx) => (
          <div 
            key={idx} 
            className={`message-wrapper ${msg.role}`}
            onTouchStart={(e) => handleTouchStartMsg(e, idx)}
            onTouchEnd={handleTouchEndMsg}
            onTouchMove={handleTouchEndMsg}
            onContextMenu={(e) => handleContextMenu(e, idx)}
          >
            <div className={`message ${msg.role}`}>
              {msg.replyTo && (
                <div style={{ 
                  background: 'rgba(0,0,0,0.2)', 
                  borderLeft: '4px solid var(--primary-color)',
                  padding: '6px 10px',
                  borderRadius: '4px',
                  marginBottom: '8px',
                  fontSize: '0.85rem',
                  opacity: 0.8
                }}>
                  <strong style={{ display: 'block', marginBottom: '4px', color: 'var(--primary-color)' }}>
                    {msg.replyTo.role === 'ai' ? aiName : 'Bạn'}
                  </strong>
                  <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>
                    {msg.replyTo.content}
                  </div>
                </div>
              )}
              {msg.attachment && (
                msg.attachment.type === 'image' ? (
                  <img src={msg.attachment.previewUrl} alt="Attached" className="message-image" />
                ) : (
                  <div style={{ padding: '8px', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', marginBottom: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Paperclip size={16} /> {msg.attachment.name}
                  </div>
                )
              )}
              <div className="message-content">{msg.content}</div>
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="message-wrapper ai">
            <div className="typing-indicator">
              <div className="typing-dot"></div>
              <div className="typing-dot"></div>
              <div className="typing-dot"></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Input Area */}
      <footer className="input-area">
        <svg width="100%" height="32px" style={{ position: 'absolute', top: -32, left: 0, zIndex: 10, pointerEvents: 'none' }}>
          <defs>
            <pattern id="wave-pattern-footer" x="0" y="0" width="320" height="32" patternUnits="userSpaceOnUse">
              <path d="M 0,5 C 20,5 20,25 40,25 C 75,25 75,8 110,8 C 135,8 135,20 160,20 C 185,20 185,4 210,4 C 240,4 240,27 270,27 C 295,27 295,5 320,5 L 320,32 L 0,32 Z" fill="var(--surface-color)" />
              <path d="M 0,5 C 20,5 20,25 40,25 C 75,25 75,8 110,8 C 135,8 135,20 160,20 C 185,20 185,4 210,4 C 240,4 240,27 270,27 C 295,27 295,5 320,5" fill="none" stroke="var(--glass-border)" strokeWidth="2" />
            </pattern>
          </defs>
          <rect x="0" y="0" width="100%" height="100%" fill="url(#wave-pattern-footer)" />
        </svg>
        {replyingTo && (
          <div style={{ 
            background: 'rgba(0,0,0,0.5)', 
            padding: '10px 15px', 
            borderTopLeftRadius: '12px', 
            borderTopRightRadius: '12px',
            display: 'flex', 
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.9rem',
            color: '#fff',
            borderBottom: '1px solid rgba(255,255,255,0.1)'
          }}>
            <div>
              <strong style={{ color: 'var(--primary-color)' }}>Đang trả lời {replyingTo.role === 'ai' ? aiName : 'chính bạn'}:</strong>
              <div style={{ opacity: 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '250px' }}>
                {replyingTo.content}
              </div>
            </div>
            <button onClick={() => setReplyingTo(null)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '4px' }}>
              <X size={18} />
            </button>
          </div>
        )}
        {attachment && (
          <div className="attachment-preview">
            {attachment.type === 'image' ? (
              <img src={attachment.previewUrl} alt="Preview" />
            ) : (
              <div style={{ padding: '10px 20px', color: 'var(--primary-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Paperclip size={20} /> {attachment.name}
              </div>
            )}
            <button className="remove-btn" onClick={() => setAttachment(null)}>
              <X size={16} />
            </button>
          </div>
        )}
        <div className="input-container">
          <label className="input-action-btn" title="Gửi tệp">
            <Paperclip size={18} />
            <input
              type="file"
              accept="*/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files[0];
                if (file) {
                  const isText = file.type.startsWith('text/') || /\.(txt|csv|js|json|md|html|css|xml|log)$/i.test(file.name);
                  const isSupportedInline = /^(image|audio|video)\//.test(file.type) || file.type === 'application/pdf';

                  if (isText) {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      setAttachment({ type: 'text', file, name: file.name, textContent: ev.target.result });
                    };
                    reader.readAsText(file);
                  } else if (isSupportedInline) {
                    const isImage = file.type.startsWith('image/');
                    if (isImage) {
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        setAttachment({ type: 'image', file, name: file.name, previewUrl: ev.target.result });
                      };
                      reader.readAsDataURL(file);
                    } else {
                      setAttachment({ type: 'file', file, name: file.name, previewUrl: null });
                    }
                  } else {
                    alert(`Xin lỗi, AI hiện không hỗ trợ đọc trực tiếp định dạng file này (${file.name}). Vui lòng gửi ảnh, PDF, Audio, Video hoặc file văn bản (.txt, .csv, ...).`);
                  }
                }
                e.target.value = '';
              }}
            />
          </label>
          <label className="input-action-btn" title="Chụp ảnh">
            <Camera size={18} />
            <input
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    setAttachment({ type: 'image', file, name: file.name, previewUrl: ev.target.result });
                  };
                  reader.readAsDataURL(file);
                }
                e.target.value = '';
              }}
            />
          </label>

          <textarea
            ref={textareaRef}
            className="message-input"
            placeholder=" Bắt đầu nào..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            style={{ overflowY: 'auto' }}
          />
          <button
            className="input-action-btn"
            onClick={() => setShowVoiceOverlay(true)}
            disabled={isTyping}
            title="Mở micro thu âm"
          >
            <Mic size={18} />
          </button>
          <button
            className="send-button"
            onClick={() => handleSend()}
            disabled={!input.trim() || isTyping}
          >
            <Send size={16} />
          </button>
        </div>
      </footer>

      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px', maxHeight: '75vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

            {imageToCrop ? (
              // MÀN HÌNH CẮT ẢNH
              <>
                <div className="modal-header">
                  <h2>{cropType === 'avatar' ? 'Căn chỉnh Avatar' : 'Căn chỉnh Hình nền'}</h2>
                  <button className="icon-button" onClick={() => setImageToCrop(null)}>
                    <X size={24} />
                  </button>
                </div>
                <div style={{ position: 'relative', width: '100%', height: '300px', background: '#333', borderRadius: '8px', overflow: 'hidden', marginBottom: '1rem' }}>
                  <Cropper
                    image={imageToCrop}
                    crop={crop}
                    zoom={zoom}
                    aspect={cropType === 'avatar' ? 1 : window.innerWidth / window.innerHeight}
                    cropShape={cropType === 'avatar' ? "round" : "rect"}
                    showGrid={false}
                    onCropChange={setCrop}
                    onZoomChange={setZoom}
                    onCropComplete={(croppedArea, croppedPixels) => setCroppedAreaPixels(croppedPixels)}
                  />
                </div>
                <div className="form-group">
                  <label>Phóng to:</label>
                  <input
                    type="range"
                    value={zoom}
                    min={1}
                    max={3}
                    step={0.1}
                    aria-labelledby="Zoom"
                    onChange={(e) => setZoom(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
                <button className="save-button" onClick={async () => {
                  try {
                    const croppedImage = await getCroppedImg(imageToCrop, croppedAreaPixels);
                    if (cropType === 'avatar') {
                      setTempAvatar(croppedImage);
                    } else {
                      setTempBgImage(croppedImage);
                    }
                    setImageToCrop(null);
                  } catch (e) {
                    console.error(e);
                  }
                }}>
                  Lưu ảnh
                </button>
              </>
            ) : (
              // MÀN HÌNH CÀI ĐẶT CHÍNH
              <>
                <div className="modal-header">
                  <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Settings size={22} color="var(--primary-color)" /> Cài đặt AI</h2>
                  {localStorage.getItem('gemini_api_key') && (
                    <button className="icon-button" onClick={() => setShowSettings(false)}>
                      <X size={24} />
                    </button>
                  )}
                </div>

                <div className="form-group">
                  <label>Tên của AI:</label>
                  <input
                    type="text"
                    placeholder="Nhập tên (Vd: CƯNG, Tiểu Cốt...)"
                    value={tempName}
                    onChange={(e) => setTempName(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Mã Model AI (Tuỳ chọn):</label>
                  <input
                    type="text"
                    placeholder="Để trống để tự động nhận diện (Vd: gemini-2.0-flash)"
                    value={tempModel}
                    onChange={(e) => setTempModel(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Tính cách của AI:</label>
                  <select
                    value={tempPersona}
                    onChange={(e) => setTempPersona(e.target.value)}
                  >
                    {Object.entries(PERSONAS).map(([key, data]) => (
                      <option key={key} value={key} style={{ background: 'var(--bg-color)', color: 'var(--text-main)' }}>
                        {data.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                    <label>Giới tính của AI:</label>
                    <select
                      value={tempAiGender}
                      onChange={(e) => setTempAiGender(e.target.value)}
                    >
                      <option value="nu" style={{ background: 'var(--bg-color)', color: 'var(--text-main)' }}>Nữ</option>
                      <option value="nam" style={{ background: 'var(--bg-color)', color: 'var(--text-main)' }}>Nam</option>
                    </select>
                  </div>

                  <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                    <label>Giới tính của Bạn:</label>
                    <select
                      value={tempUserGender}
                      onChange={(e) => setTempUserGender(e.target.value)}
                    >
                      <option value="nam" style={{ background: 'var(--bg-color)', color: 'var(--text-main)' }}>Nam</option>
                      <option value="nu" style={{ background: 'var(--bg-color)', color: 'var(--text-main)' }}>Nữ</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Cách nói chuyện của AI:</label>
                  <select
                    value={tempAiVerbosity}
                    onChange={(e) => setTempAiVerbosity(e.target.value)}
                  >
                    <option value="ngan_gon" style={{ background: 'var(--bg-color)', color: 'var(--text-main)' }}>Ngắn gọn, súc tích (Mặc định)</option>
                    <option value="chi_tiet" style={{ background: 'var(--bg-color)', color: 'var(--text-main)' }}>Chỉn chu, giải thích chi tiết</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Ảnh đại diện :</label>

                  {/* Hiển thị trước ảnh đại diện trong cài đặt */}
                  {tempAvatar && (
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }}>
                      <img src={tempAvatar} alt="Preview" style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--primary-color)' }} />
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                    <label style={{
                      background: 'var(--primary-color)',
                      color: '#000',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      whiteSpace: 'nowrap',
                      width: '100%',
                      justifyContent: 'center'
                    }}>
                      Tải ảnh & Cắt ảnh
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              setCropType('avatar');
                              setImageToCrop(reader.result);
                              setCrop({ x: 0, y: 0 });
                              setZoom(1);
                            };
                            reader.readAsDataURL(file);
                          }
                          e.target.value = ''; // Reset input
                        }}
                      />
                    </label>
                  </div>
                </div>

                <div className="form-group">
                  <label>Hình nền chat:</label>

                  {/* Hiển thị trước Hình nền trong cài đặt */}
                  {tempBgImage && (
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }}>
                      <img src={tempBgImage} alt="Bg Preview" style={{ width: '100%', height: '120px', borderRadius: '8px', objectFit: 'cover', border: '2px solid var(--primary-color)' }} />
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                    <label style={{
                      background: 'var(--primary-color)',
                      color: '#000',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      whiteSpace: 'nowrap',
                      width: '100%',
                      justifyContent: 'center'
                    }}>
                      Tải ảnh & Cắt hình nền
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              setCropType('bg');
                              setImageToCrop(reader.result);
                              setCrop({ x: 0, y: 0 });
                              setZoom(1);
                            };
                            reader.readAsDataURL(file);
                          }
                          e.target.value = ''; // Reset input
                        }}
                      />
                    </label>
                  </div>
                </div>

                <div style={{ marginBottom: '1.5rem', lineHeight: '1.5', fontSize: '0.85rem', color: '#c5c6c7' }}>


                  <div style={{ background: 'rgba(102, 252, 241, 0.1)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(102, 252, 241, 0.3)' }}>
                    <strong>Cách lấy Key:</strong>
                    <ol style={{ marginLeft: '20px', marginTop: '8px' }}>
                      <li>Bấm vào link bên dưới, đăng nhập Google.</li>
                      <li>Bấm <strong>"Create API key"</strong>.</li>
                      <li>Copy đoạn mã APIKey và dán xuống dưới đây là xong!</li>
                    </ol>
                    <a
                      href="https://aistudio.google.com/app/apikey"
                      target="_blank"
                      rel="noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--primary-color)', marginTop: '12px', fontWeight: 'bold', textDecoration: 'none' }}
                    >
                      Nhấn vào đây để lấy API Key miễn phí <ExternalLink size={16} />
                    </a>
                  </div>
                </div>

                <div className="form-group">
                  <label>Google Gemini API Key:</label>
                  <input
                    type="password"
                    placeholder="AIzaSy..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                </div>
                <button className="save-button" onClick={saveSettings}>
                  Lưu & Bắt đầu Chat
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Tab Lịch sử Chat (Toàn màn hình) */}
      {showHistory && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: 'var(--bg-color)', zIndex: 9999,
          display: 'flex', flexDirection: 'column',
          animation: 'fadeIn 0.3s ease-out'
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 20px', background: 'var(--surface-color)',
            boxShadow: '0 4px 15px rgba(0,0,0,0.05)', zIndex: 10
          }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem', margin: 0, color: 'var(--text-main)' }}>
              <History size={24} color="var(--primary-color)" /> Lịch sử trò chuyện
            </h2>
            <button className="icon-button" onClick={() => setShowHistory(false)} style={{ background: 'rgba(0,0,0,0.05)', borderRadius: '50%' }}>
              <X size={24} />
            </button>
          </div>

          <div style={{
            flex: 1, overflowY: 'auto', padding: '20px',
            background: 'var(--bg-color)', display: 'flex', flexDirection: 'column', gap: '12px'
          }}>
            {chatHistory.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
                <History size={64} style={{ marginBottom: 16 }} />
                <p style={{ fontSize: '1.1rem' }}>Chưa có lịch sử nào.</p>
              </div>
            ) : (
              chatHistory.map(chat => (
                <div
                  key={chat.id}
                  onClick={() => loadChat(chat)}
                  style={{
                    padding: '16px',
                    background: currentChatId === chat.id 
                      ? 'linear-gradient(135deg, rgba(102, 252, 241, 0.15) 0%, rgba(69, 162, 158, 0.05) 100%)' 
                      : 'var(--surface-color)',
                    borderRadius: '16px',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    border: currentChatId === chat.id ? '1px solid var(--primary-color)' : '1px solid var(--glass-border)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (currentChatId !== chat.id) e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    if (currentChatId !== chat.id) e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div style={{ overflow: 'hidden', paddingRight: '16px', flex: 1 }}>
                    {editingChatId === chat.id ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }} onClick={e => e.stopPropagation()}>
                        <input
                          type="text"
                          autoFocus
                          value={editingChatTitle}
                          onChange={(e) => setEditingChatTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') updateChatTitle(e, chat.id);
                            if (e.key === 'Escape') setEditingChatId(null);
                          }}
                          style={{
                            flex: 1, padding: '4px 8px', borderRadius: '4px',
                            border: '1px solid var(--primary-color)', background: 'var(--bg-color)',
                            color: 'var(--text-main)', outline: 'none', fontSize: '1rem'
                          }}
                        />
                      </div>
                    ) : (
                      <div style={{ 
                        color: currentChatId === chat.id ? 'var(--primary-color)' : 'var(--text-main)', 
                        fontSize: '1.05rem', fontWeight: 600, 
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '6px' 
                      }}>
                        {chat.title}
                      </div>
                    )}
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-main)', opacity: 0.6, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: currentChatId === chat.id ? 'var(--primary-color)' : '#888' }} />
                      {new Date(chat.timestamp).toLocaleString('vi-VN')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {editingChatId === chat.id ? (
                      <button
                        className="icon-button"
                        onClick={(e) => updateChatTitle(e, chat.id)}
                        style={{ padding: '8px', background: 'rgba(74, 222, 128, 0.1)', color: '#4ade80', borderRadius: '50%', flexShrink: 0 }}
                        title="Lưu tên mới"
                      >
                        <Check size={20} />
                      </button>
                    ) : (
                      <button
                        className="icon-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingChatTitle(chat.title);
                          setEditingChatId(chat.id);
                        }}
                        style={{ padding: '8px', background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-main)', borderRadius: '50%', flexShrink: 0 }}
                        title="Đổi tên đoạn chat"
                      >
                        <Pencil size={20} />
                      </button>
                    )}
                    <button
                      className="icon-button"
                      onClick={(e) => deleteChat(e, chat.id)}
                      style={{ 
                        padding: '8px', background: 'rgba(255, 68, 68, 0.1)', color: '#ff4444', 
                        borderRadius: '50%', flexShrink: 0 
                      }}
                      title="Xóa đoạn chat này"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Modal Đặt tên đoạn chat mới */}
      {showNewChatPopup && (
        <div className="modal-overlay" onClick={() => setShowNewChatPopup(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Plus size={22} color="var(--primary-color)" /> Tạo đoạn chat mới</h2>
              <button className="icon-button" onClick={() => setShowNewChatPopup(false)}>
                <X size={24} />
              </button>
            </div>
            <div className="form-group">
              <label>Tên đoạn chat:</label>
              <input
                type="text"
                placeholder="Vd: Học tiếng Anh, Tâm sự..."
                value={newChatName}
                onChange={(e) => setNewChatName(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmCreateNewChat();
                }}
              />
            </div>
            <button className="save-button" onClick={confirmCreateNewChat}>
              Tạo mới
            </button>
          </div>
        </div>
      )}

      {/* Giao diện thu âm giọng nói khổng lồ */}
      {showVoiceOverlay && (
        <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', zIndex: 9999 }}>
          <button className="icon-button" style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(255,255,255,0.1)' }} onClick={() => setShowVoiceOverlay(false)}>
            <X size={28} color="#fff" />
          </button>
          
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '40px', width: '100%' }}>
            <h2 style={{ color: '#fff', fontSize: '1.5rem', textAlign: 'center', fontWeight: 500 }}>
              {isListening ? "Đang nghe..." : "Nhấn giữ nút dưới đây để nói"}
            </h2>
            
            <div style={{ 
              color: 'rgba(255,255,255,0.7)', 
              fontSize: '1.2rem', 
              minHeight: '60px', 
              maxWidth: '80%', 
              textAlign: 'center',
              fontStyle: 'italic',
              wordWrap: 'break-word'
            }}>
              {voiceOverlayText || "..."}
            </div>
            
            <button
              onMouseDown={startListening}
              onMouseUp={stopListening}
              onTouchStart={startListening}
              onTouchEnd={stopListening}
              onDragStart={(e) => e.preventDefault()}
              style={{
                width: '140px',
                height: '140px',
                borderRadius: '50%',
                background: isListening ? 'var(--accent-color)' : 'var(--primary-color)',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: isListening ? '0 0 50px var(--accent-color)' : '0 4px 20px rgba(0,0,0,0.5)',
                transform: isListening ? 'scale(1.15)' : 'scale(1)',
                transition: 'all 0.2s ease',
                cursor: 'pointer',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                WebkitTouchCallout: 'none'
              }}
            >
              <Mic size={56} color="#fff" />
            </button>
            
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '1rem' }}>
              Thả tay ra để gửi
            </p>
          </div>
        </div>
      )}

      {/* Context Menu cho tin nhắn */}
      {selectedMessageIndex !== null && (
        <div 
          className="modal-overlay" 
          style={{ background: 'transparent', zIndex: 10000 }}
          onClick={() => setSelectedMessageIndex(null)}
          onContextMenu={(e) => { e.preventDefault(); setSelectedMessageIndex(null); }}
        >
          <div 
            style={{ 
              position: 'absolute', 
              top: Math.min(contextMenuPos.y, window.innerHeight - 150), 
              left: Math.min(contextMenuPos.x, window.innerWidth - 180), 
              background: 'var(--surface-color)', 
              borderRadius: '12px', 
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)', 
              border: '1px solid rgba(255,255,255,0.1)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              minWidth: '150px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              onClick={handleReplyMessage} 
              style={{ background: 'none', border: 'none', padding: '12px 16px', color: '#fff', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
            >
              <Reply size={16} />
              Trả lời
            </button>
            <button 
              onClick={handleCopyMessage} 
              style={{ background: 'none', border: 'none', padding: '12px 16px', color: '#fff', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
            >
              <Copy size={16} />
              Sao chép
            </button>
            <button 
              onClick={handleDeleteMessage} 
              style={{ background: 'none', border: 'none', padding: '12px 16px', color: '#ff4444', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
            >
              <Trash2 size={16} />
              Xóa
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
