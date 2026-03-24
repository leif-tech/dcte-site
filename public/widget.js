(function() {
  const botId = document.currentScript.getAttribute('data-bot-id');
  const apiUrl = document.currentScript.getAttribute('data-api-url') || 'https://whitelabel-ai-production.up.railway.app';
  if (!botId) return;

  // Generate session ID
  const sessionId = 'session_' + Math.random().toString(36).substr(2, 9);
  let leadCaptured = false;

  // Inject styles
  const style = document.createElement('style');
  style.textContent = `
    #wlai-bubble { position: fixed; bottom: 24px; right: 24px; width: 56px; height: 56px; border-radius: 50%; background: #0066cc; border: none; cursor: pointer; box-shadow: 0 4px 20px rgba(0,0,0,0.3); z-index: 99999; display: flex; align-items: center; justify-content: center; transition: transform 0.2s; }
    #wlai-bubble:hover { transform: scale(1.1); }
    #wlai-bubble svg { width: 24px; height: 24px; fill: white; }
    #wlai-window { position: fixed; bottom: 96px; right: 24px; width: 360px; height: 520px; background: #111; border-radius: 16px; box-shadow: 0 8px 40px rgba(0,0,0,0.4); z-index: 99998; display: none; flex-direction: column; overflow: hidden; font-family: -apple-system, sans-serif; }
    #wlai-window.open { display: flex; }
    #wlai-header { padding: 16px; background: #0066cc; color: white; display: flex; align-items: center; gap: 10px; }
    #wlai-header-name { font-weight: 700; font-size: 15px; }
    #wlai-header-sub { font-size: 12px; opacity: 0.8; }
    #wlai-messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
    .wlai-msg { max-width: 80%; padding: 10px 14px; border-radius: 12px; font-size: 14px; line-height: 1.5; }
    .wlai-msg.bot { background: #222; color: #eee; align-self: flex-start; border-bottom-left-radius: 4px; }
    .wlai-msg.user { background: #0066cc; color: white; align-self: flex-end; border-bottom-right-radius: 4px; }
    .wlai-typing { display: flex; gap: 4px; align-items: center; padding: 10px 14px; background: #222; border-radius: 12px; border-bottom-left-radius: 4px; align-self: flex-start; }
    .wlai-typing span { width: 6px; height: 6px; background: #888; border-radius: 50%; animation: wlai-bounce 1.2s infinite; }
    .wlai-typing span:nth-child(2) { animation-delay: 0.2s; }
    .wlai-typing span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes wlai-bounce { 0%,60%,100% { transform: translateY(0); } 30% { transform: translateY(-6px); } }
    #wlai-input-area { padding: 12px; border-top: 1px solid #222; display: flex; gap: 8px; }
    #wlai-input { flex: 1; background: #222; border: none; border-radius: 8px; padding: 10px 14px; color: white; font-size: 14px; outline: none; }
    #wlai-input::placeholder { color: #666; }
    #wlai-send { background: #0066cc; border: none; border-radius: 8px; padding: 10px 14px; color: white; cursor: pointer; font-size: 14px; }
    #wlai-send:hover { background: #0052a3; }
    #wlai-lead-form { padding: 20px; display: flex; flex-direction: column; gap: 10px; }
    #wlai-lead-form input { background: #222; border: 1px solid #333; border-radius: 8px; padding: 10px 14px; color: white; font-size: 14px; outline: none; width: 100%; box-sizing: border-box; }
    #wlai-lead-form input::placeholder { color: #666; }
    #wlai-lead-form input:focus { border-color: #0066cc; }
    #wlai-lead-form button { background: #0066cc; border: none; border-radius: 8px; padding: 12px; color: white; font-size: 14px; font-weight: 600; cursor: pointer; }
    #wlai-lead-form button:hover { background: #0052a3; }
    #wlai-lead-form .wlai-skip { background: none; border: none; color: #666; font-size: 12px; cursor: pointer; padding: 8px; text-align: center; }
    #wlai-lead-form .wlai-skip:hover { color: #999; }
    #wlai-lead-form p { color: #999; font-size: 13px; margin: 0 0 4px; text-align: center; }
  `;
  document.head.appendChild(style);

  // Create bubble
  const bubble = document.createElement('button');
  bubble.id = 'wlai-bubble';
  bubble.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>';
  document.body.appendChild(bubble);

  // Create window
  const win = document.createElement('div');
  win.id = 'wlai-window';
  win.innerHTML = `
    <div id="wlai-header">
      <div>
        <div id="wlai-header-name">Loading...</div>
        <div id="wlai-header-sub">AI Assistant</div>
      </div>
    </div>
    <div id="wlai-lead-form">
      <p>Before we start, tell us a bit about yourself:</p>
      <input id="wlai-lead-name" placeholder="Your name" />
      <input id="wlai-lead-email" type="email" placeholder="Email address" />
      <input id="wlai-lead-phone" type="tel" placeholder="Phone (optional)" />
      <button id="wlai-lead-submit">Start Chat</button>
      <button class="wlai-skip" id="wlai-lead-skip">Skip, just chat</button>
    </div>
    <div id="wlai-messages" style="display:none;"></div>
    <div id="wlai-input-area" style="display:none;">
      <input id="wlai-input" placeholder="Type a message..." />
      <button id="wlai-send">Send</button>
    </div>
  `;
  document.body.appendChild(win);

  const messages = document.getElementById('wlai-messages');
  const input = document.getElementById('wlai-input');
  const leadForm = document.getElementById('wlai-lead-form');
  const inputArea = document.getElementById('wlai-input-area');
  let botName = 'Assistant';
  let primaryColor = '#0066cc';

  function showChat() {
    leadForm.style.display = 'none';
    messages.style.display = 'flex';
    inputArea.style.display = 'flex';
    leadCaptured = true;
  }

  // Lead form submit
  document.getElementById('wlai-lead-submit').addEventListener('click', async () => {
    const name = document.getElementById('wlai-lead-name').value.trim();
    const email = document.getElementById('wlai-lead-email').value.trim();
    const phone = document.getElementById('wlai-lead-phone').value.trim();

    if (!name && !email) {
      document.getElementById('wlai-lead-name').style.borderColor = '#f44';
      return;
    }

    try {
      await fetch(`${apiUrl}/api/leads/${botId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, session_id: sessionId })
      });
    } catch {}

    showChat();
  });

  // Skip lead form
  document.getElementById('wlai-lead-skip').addEventListener('click', () => {
    showChat();
  });

  // Load bot info
  fetch(`${apiUrl}/api/chat/${botId}/info`)
    .then(r => r.json()).then(data => {
    botName = data.bot_name || 'Assistant';
    primaryColor = data.primary_color || '#0066cc';
    document.getElementById('wlai-header-name').textContent = botName;
    document.getElementById('wlai-header').style.background = primaryColor;
    document.getElementById('wlai-bubble').style.background = primaryColor;
    document.getElementById('wlai-send').style.background = primaryColor;
    document.getElementById('wlai-lead-submit').style.background = primaryColor;
    if (data.greeting_message) addMessage(data.greeting_message, 'bot');
  }).catch(() => {
    document.getElementById('wlai-header-name').textContent = 'Assistant';
  });

  function addMessage(text, type) {
    const msg = document.createElement('div');
    msg.className = `wlai-msg ${type}`;
    msg.textContent = text;
    messages.appendChild(msg);
    messages.scrollTop = messages.scrollHeight;
  }

  function showTyping() {
    const typing = document.createElement('div');
    typing.className = 'wlai-typing';
    typing.id = 'wlai-typing';
    typing.innerHTML = '<span></span><span></span><span></span>';
    messages.appendChild(typing);
    messages.scrollTop = messages.scrollHeight;
  }

  function hideTyping() {
    const typing = document.getElementById('wlai-typing');
    if (typing) typing.remove();
  }

  async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    addMessage(text, 'user');
    showTyping();
    try {
      const res = await fetch(`${apiUrl}/api/chat/${botId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, session_id: sessionId })
      });
      const data = await res.json();
      hideTyping();
      addMessage(data.reply, 'bot');
    } catch {
      hideTyping();
      addMessage('Sorry, something went wrong. Please try again.', 'bot');
    }
  }

  bubble.addEventListener('click', () => win.classList.toggle('open'));
  document.getElementById('wlai-send').addEventListener('click', sendMessage);
  input.addEventListener('keypress', e => { if (e.key === 'Enter') sendMessage(); });
})();
