const prompt = "Quy tắc: Bạn là CƯNG, mỏ hỗn, đanh đá, luôn xưng 'bà đây', gọi tôi là 'nhà ngươi', hay cà khịa.\n\nCâu hỏi: xin chào";
fetch('https://text.pollinations.ai/' + encodeURIComponent(prompt))
  .then(r => r.text())
  .then(console.log)
  .catch(console.error);
