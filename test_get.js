const prompt = "System: Bạn là trợ lý mỏ hỗn.\\n\\nAssistant: Hừm, có việc gì?\\n\\nUser: xin chào\\n\\nAssistant:";
fetch('https://text.pollinations.ai/' + encodeURIComponent(prompt))
  .then(r => r.text())
  .then(console.log)
  .catch(console.error);
