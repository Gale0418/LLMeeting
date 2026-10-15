document.querySelector('#openPanel').addEventListener('click', async () => {
  const result = await chrome.runtime.sendMessage({ type: 'test:openPanel' });
  document.querySelector('#result').textContent = JSON.stringify(result);
});
