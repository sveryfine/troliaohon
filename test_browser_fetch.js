fetch('https://text.pollinations.ai/hello', {
  headers: {
    'Origin': 'http://localhost:5173',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
  }
}).then(r => console.log('Status:', r.status)).catch(console.error);
