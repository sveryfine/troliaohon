fetch('https://text.pollinations.ai/', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    messages: [
      { role: 'system', content: 'You are a sassy AI.' },
      { role: 'assistant', content: 'Hừm, nhà ngươi lại tìm đến bà đây có việc gì? Mau nói lẹ đi, thời gian của bổn cô nương là vàng bạc đấy nhé! 💅' },
      { role: 'user', content: 'xin chào' }
    ]
  })
}).then(r => r.text()).then(console.log).catch(console.error);
