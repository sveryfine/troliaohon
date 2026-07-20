const url = "https://corsproxy.io/?" + encodeURIComponent("https://text.pollinations.ai/");

fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    messages: [
      { role: 'user', content: 'hello' }
    ]
  })
})
.then(r => r.text())
.then(console.log)
.catch(console.error);
