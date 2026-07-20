const url = "https://corsproxy.io/?" + encodeURIComponent("https://text.pollinations.ai/hello");
fetch(url, {
  headers: {
    'Origin': 'http://localhost:5173',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5'
  }
}).then(r => console.log('Status:', r.status)).catch(console.error);
