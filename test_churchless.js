fetch('https://free.churchless.tech/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: "gpt-3.5-turbo",
    messages: [{ role: "user", content: "hello" }]
  })
}).then(r => r.json()).then(console.log).catch(console.error);
