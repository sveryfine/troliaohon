fetch('https://api.airforce/v1/models')
  .then(r => r.json())
  .then(data => console.log(data.data.filter(m => m.free !== false).map(m => m.id)))
  .catch(console.error);
