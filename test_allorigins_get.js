const prompt = "Quy tắc: Bạn là CƯNG, mỏ hỗn.\n\nCâu hỏi: xin chào";
const url = "https://api.allorigins.win/get?url=" + encodeURIComponent("https://text.pollinations.ai/" + encodeURIComponent(prompt));
fetch(url)
  .then(r => r.json())
  .then(data => console.log(data.contents))
  .catch(console.error);
