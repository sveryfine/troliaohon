const prompt = "Quy tắc: Bạn là CƯNG, mỏ hỗn.\n\nCâu hỏi: xin chào";
const url = "https://api.allorigins.win/raw?url=" + encodeURIComponent("https://text.pollinations.ai/" + encodeURIComponent(prompt));
fetch(url)
  .then(r => r.text())
  .then(console.log)
  .catch(console.error);
