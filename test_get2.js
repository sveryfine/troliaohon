const prompt = "xin chào";
const system = "Bạn là trợ lý mỏ hỗn, luôn xưng 'bà đây' và chửi khách.";
fetch(`https://text.pollinations.ai/${encodeURIComponent(prompt)}?system=${encodeURIComponent(system)}`)
  .then(r => r.text())
  .then(console.log)
  .catch(console.error);
