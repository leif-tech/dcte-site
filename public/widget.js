(function() {
  const botId = document.currentScript.getAttribute('data-bot-id');
  const apiUrl = document.currentScript.getAttribute('data-api-url') || 'https://whitelabel-ai-production.up.railway.app';
  if (!botId) return;

  const sessionId = 'session_' + Math.random().toString(36).substr(2, 9);
  let leadCaptured = false;

  // Load Inter font via link tag instead of blocking @import
  const fontLink = document.createElement('link');
  fontLink.rel = 'stylesheet';
  fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
  document.head.appendChild(fontLink);

  const style = document.createElement('style');
  style.textContent = `
    /* Inter font loaded via link tag to avoid render-blocking @import */

    #wlai-bubble { position: fixed; bottom: 28px; right: 28px; width: 60px; height: 60px; border-radius: 50%; background: #0066cc; border: none; cursor: pointer; box-shadow: 0 4px 24px rgba(0,0,0,0.25), 0 0 0 0 rgba(0,102,204,0.4); z-index: 99999; display: flex; align-items: center; justify-content: center; transition: all 0.3s cubic-bezier(0.4,0,0.2,1); animation: wlai-pulse 3s infinite; }
    #wlai-bubble:hover { transform: scale(1.1); box-shadow: 0 6px 32px rgba(0,0,0,0.35); }
    #wlai-bubble svg { width: 26px; height: 26px; fill: white; transition: transform 0.3s; }
    #wlai-bubble.active svg { transform: rotate(90deg); }
    @keyframes wlai-pulse { 0%,100% { box-shadow: 0 4px 24px rgba(0,0,0,0.25), 0 0 0 0 rgba(0,102,204,0.4); } 50% { box-shadow: 0 4px 24px rgba(0,0,0,0.25), 0 0 0 10px rgba(0,102,204,0); } }

    #wlai-window { position: fixed; bottom: 100px; right: 28px; width: 380px; height: 560px; background: #0f0f0f; border-radius: 20px; box-shadow: 0 12px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06); z-index: 99998; flex-direction: column; overflow: hidden; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; opacity: 0; transform: translateY(20px) scale(0.95); pointer-events: none; transition: all 0.35s cubic-bezier(0.4,0,0.2,1); display: flex; }
    #wlai-window.open { opacity: 1; transform: translateY(0) scale(1); pointer-events: all; }

    #wlai-header { padding: 18px 20px; background: linear-gradient(135deg, #0066cc, #0052a3); color: white; display: flex; align-items: center; justify-content: space-between; position: relative; overflow: hidden; }
    #wlai-header::after { content: ''; position: absolute; top: -50%; right: -20%; width: 120px; height: 120px; background: rgba(255,255,255,0.08); border-radius: 50%; }
    #wlai-header-left { display: flex; align-items: center; gap: 12px; z-index: 1; }
    #wlai-header-avatar { width: 38px; height: 38px; border-radius: 12px; background: rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px; backdrop-filter: blur(8px); }
    #wlai-header-info { display: flex; flex-direction: column; }
    #wlai-header-name { font-weight: 700; font-size: 15px; letter-spacing: -0.2px; }
    #wlai-header-sub { font-size: 12px; opacity: 0.8; display: flex; align-items: center; gap: 5px; margin-top: 2px; }
    #wlai-header-sub::before { content: ''; width: 7px; height: 7px; background: #4ade80; border-radius: 50%; display: inline-block; box-shadow: 0 0 6px rgba(74,222,128,0.5); }
    #wlai-close { background: rgba(255,255,255,0.15); border: none; color: white; width: 32px; height: 32px; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.2s; z-index: 1; font-size: 18px; line-height: 1; }
    #wlai-close:hover { background: rgba(255,255,255,0.25); }

    #wlai-messages { flex: 1; overflow-y: auto; padding: 20px 16px; display: flex; flex-direction: column; gap: 6px; scroll-behavior: smooth; }
    #wlai-messages::-webkit-scrollbar { width: 4px; }
    #wlai-messages::-webkit-scrollbar-track { background: transparent; }
    #wlai-messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
    #wlai-messages::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }

    .wlai-msg-row { display: flex; align-items: flex-end; gap: 8px; animation: wlai-fadeIn 0.3s ease; }
    .wlai-msg-row.user { justify-content: flex-end; }
    .wlai-msg-row.bot { justify-content: flex-start; }
    .wlai-bot-icon { width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(135deg, #0066cc, #0052a3); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .wlai-bot-icon svg { width: 14px; height: 14px; fill: white; }

    .wlai-msg { max-width: 78%; padding: 12px 16px; font-size: 13.5px; line-height: 1.65; word-wrap: break-word; }
    .wlai-msg.bot { background: #1a1a1a; color: #e8e8e8; border-radius: 18px 18px 18px 6px; border: 1px solid rgba(255,255,255,0.05); }
    .wlai-msg.user { background: linear-gradient(135deg, #0066cc, #0055b3); color: white; border-radius: 18px 18px 6px 18px; box-shadow: 0 2px 12px rgba(0,102,204,0.25); }

    .wlai-typing-row { display: flex; align-items: flex-end; gap: 8px; animation: wlai-fadeIn 0.3s ease; }
    .wlai-typing { display: flex; gap: 5px; align-items: center; padding: 14px 18px; background: #1a1a1a; border-radius: 18px 18px 18px 6px; border: 1px solid rgba(255,255,255,0.05); }
    .wlai-typing span { width: 7px; height: 7px; background: #555; border-radius: 50%; animation: wlai-bounce 1.4s infinite ease-in-out; }
    .wlai-typing span:nth-child(2) { animation-delay: 0.15s; }
    .wlai-typing span:nth-child(3) { animation-delay: 0.3s; }
    @keyframes wlai-bounce { 0%,60%,100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-8px); opacity: 1; } }
    @keyframes wlai-fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

    #wlai-input-area { padding: 14px 16px; border-top: 1px solid rgba(255,255,255,0.06); display: flex; gap: 10px; align-items: center; background: #0f0f0f; }
    #wlai-input { flex: 1; background: #1a1a1a; border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 12px 16px; color: #f0f0f0; font-size: 13.5px; outline: none; font-family: inherit; transition: border-color 0.2s; }
    #wlai-input::placeholder { color: #555; }
    #wlai-input:focus { border-color: rgba(0,102,204,0.5); }
    #wlai-send { background: #0066cc; border: none; border-radius: 12px; width: 42px; height: 42px; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; flex-shrink: 0; }
    #wlai-send:hover { background: #0055b3; transform: scale(1.05); }
    #wlai-send:active { transform: scale(0.95); }
    #wlai-send svg { width: 18px; height: 18px; fill: white; }

    #wlai-lead-form { padding: 28px 24px; display: flex; flex-direction: column; gap: 12px; flex: 1; justify-content: center; }
    #wlai-lead-form p { color: #888; font-size: 13.5px; margin: 0 0 8px; text-align: center; line-height: 1.5; font-family: inherit; }
    #wlai-lead-form input { background: #1a1a1a; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 13px 16px; color: #f0f0f0; font-size: 13.5px; outline: none; width: 100%; box-sizing: border-box; font-family: inherit; transition: border-color 0.2s; }
    #wlai-lead-form input::placeholder { color: #555; }
    #wlai-lead-form input:focus { border-color: rgba(0,102,204,0.5); }
    #wlai-lead-form button { background: linear-gradient(135deg, #0066cc, #0052a3); border: none; border-radius: 12px; padding: 14px; color: white; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; transition: all 0.2s; box-shadow: 0 2px 12px rgba(0,102,204,0.25); }
    #wlai-lead-form button:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(0,102,204,0.35); }
    #wlai-lead-form button:active { transform: translateY(0); }
    #wlai-lead-form .wlai-skip { background: none; border: none; color: #555; font-size: 12px; cursor: pointer; padding: 8px; text-align: center; font-family: inherit; transition: color 0.2s; }
    #wlai-lead-form .wlai-skip:hover { color: #888; }

    #wlai-powered { text-align: center; padding: 8px; font-size: 10px; color: #333; font-family: inherit; letter-spacing: 0.3px; }

    @media (max-width: 440px) {
      #wlai-window { right: 0; left: 0; bottom: 0; width: 100%; height: 100%; border-radius: 0; }
      #wlai-bubble { bottom: 20px; right: 20px; }
    }
  `;
  document.head.appendChild(style);

  const bubble = document.createElement('button');
  bubble.id = 'wlai-bubble';
  bubble.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>';
  document.body.appendChild(bubble);

  const win = document.createElement('div');
  win.id = 'wlai-window';
  win.innerHTML = `
    <div id="wlai-header">
      <div id="wlai-header-left">
        <div id="wlai-header-avatar">AI</div>
        <div id="wlai-header-info">
          <div id="wlai-header-name">Loading...</div>
          <div id="wlai-header-sub">Online</div>
        </div>
      </div>
      <button id="wlai-close">&times;</button>
    </div>
    <div id="wlai-lead-form">
      <p>Before we start chatting, tell us a bit about yourself</p>
      <input id="wlai-lead-name" placeholder="Your name" />
      <input id="wlai-lead-email" type="email" placeholder="Email address" />
      <input id="wlai-lead-phone" type="tel" placeholder="Phone (optional)" />
      <button id="wlai-lead-submit">Start Chat</button>
      <button class="wlai-skip" id="wlai-lead-skip">Skip, just chat</button>
    </div>
    <div id="wlai-messages" style="display:none;"></div>
    <div id="wlai-input-area" style="display:none;">
      <input id="wlai-input" placeholder="Type a message..." />
      <button id="wlai-send"><svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>
    </div>
    <div id="wlai-powered">Powered by AI</div>
  `;
  document.body.appendChild(win);

  const messages = document.getElementById('wlai-messages');
  const input = document.getElementById('wlai-input');
  const leadForm = document.getElementById('wlai-lead-form');
  const inputArea = document.getElementById('wlai-input-area');
  let botName = 'Assistant';
  let primaryColor = '#0066cc';

  function applyColor(color) {
    primaryColor = color;
    document.getElementById('wlai-bubble').style.background = color;
    document.getElementById('wlai-header').style.background = `linear-gradient(135deg, ${color}, ${darken(color, 20)})`;
    document.getElementById('wlai-send').style.background = color;
    document.getElementById('wlai-lead-submit').style.background = `linear-gradient(135deg, ${color}, ${darken(color, 20)})`;
    // Update CSS custom properties for dynamic elements
    const dynamicStyle = document.getElementById('wlai-dynamic-style') || document.createElement('style');
    dynamicStyle.id = 'wlai-dynamic-style';
    dynamicStyle.textContent = `
      .wlai-msg.user { background: linear-gradient(135deg, ${color}, ${darken(color, 15)}) !important; box-shadow: 0 2px 12px ${color}33 !important; }
      .wlai-bot-icon { background: linear-gradient(135deg, ${color}, ${darken(color, 20)}) !important; }
      #wlai-input:focus { border-color: ${color}80 !important; }
      #wlai-lead-form input:focus { border-color: ${color}80 !important; }
      @keyframes wlai-pulse { 0%,100% { box-shadow: 0 4px 24px rgba(0,0,0,0.25), 0 0 0 0 ${color}66; } 50% { box-shadow: 0 4px 24px rgba(0,0,0,0.25), 0 0 0 10px ${color}00; } }
    `;
    document.head.appendChild(dynamicStyle);
  }

  function darken(hex, percent) {
    const num = parseInt(hex.replace('#',''), 16);
    const r = Math.max(0, (num >> 16) - Math.round(2.55 * percent));
    const g = Math.max(0, ((num >> 8) & 0x00FF) - Math.round(2.55 * percent));
    const b = Math.max(0, (num & 0x0000FF) - Math.round(2.55 * percent));
    return '#' + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1);
  }

  function showChat() {
    leadForm.style.display = 'none';
    messages.style.display = 'flex';
    inputArea.style.display = 'flex';
    leadCaptured = true;
  }

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

  document.getElementById('wlai-lead-skip').addEventListener('click', () => showChat());

  document.getElementById('wlai-close').addEventListener('click', () => {
    win.classList.remove('open');
    bubble.classList.remove('active');
  });

  fetch(`${apiUrl}/api/chat/${botId}/info`)
    .then(r => r.json()).then(data => {
    botName = data.bot_name || 'Assistant';
    document.getElementById('wlai-header-name').textContent = botName;
    document.getElementById('wlai-header-avatar').textContent = botName.charAt(0).toUpperCase();
    applyColor(data.primary_color || '#0066cc');
    if (data.greeting_message) addMessage(data.greeting_message, 'bot');
  }).catch(() => {
    document.getElementById('wlai-header-name').textContent = 'Assistant';
  });

  // Format bot responses
  function formatText(text) {
    text = text.replace(/\*\*/g, '');
    if ((text.match(/\n\s*\n/g) || []).length >= 3) return text;
    var prices = text.match(/[₱P]\d[\d,]+/g) || [];
    if (prices.length < 3) return text;
    var skip = /^(pwede|para|sa|ang|ug|og|kay|kung|pero|lang|ra|na|da|ba|man|pud|pod|sad|hangtod|gikan|each|per|for|and|or|the|is|are|to|in|of|with|from|up|but|not|so|if|at|by|as|on|naa|wala|dili|mao|kini|namo|nila|available|only|also|nga|tag|matag|every|all|this|that|our|your|its|we|you|they|it|has|have|can|will|may|just|more|less|about|around|between|both|which|what|when|how|free|total|price|worth|below|above|under|over|most|best|good|great|cheap|affordable|starting|ranging|range|priced|costs|cost|inclusive|plus|minus|off|discount|kana|kini|mura|pila|diri|dire|adto|didto|ari|ani|ato|imo|imu|among|ilang|tanan|gamay|dako|bag-o|daan|unsa|asa|kanus-a|ngano|pila|kinsa|ako|iya|kami|kita|sila|siya|ikaw)$/i;
    text = text.replace(/([₱P]\d[\d,]+[.,:;]?)\s+(\S+)/g, function(match, price, next) {
      if (skip.test(next)) return match;
      return price + '\n\n' + next;
    });
    return text;
  }

  function addMessage(text, type) {
    const row = document.createElement('div');
    row.className = `wlai-msg-row ${type}`;

    if (type === 'bot') {
      const icon = document.createElement('div');
      icon.className = 'wlai-bot-icon';
      icon.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>';
      row.appendChild(icon);
    }

    const msg = document.createElement('div');
    msg.className = `wlai-msg ${type}`;
    if (type === 'bot') text = formatText(text);
    const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    msg.innerHTML = escaped.replace(/\n/g, '<br>');
    row.appendChild(msg);

    messages.appendChild(row);
    messages.scrollTop = messages.scrollHeight;
  }

  function showTyping() {
    const row = document.createElement('div');
    row.className = 'wlai-typing-row';
    row.id = 'wlai-typing';
    const icon = document.createElement('div');
    icon.className = 'wlai-bot-icon';
    icon.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>';
    row.appendChild(icon);
    const typing = document.createElement('div');
    typing.className = 'wlai-typing';
    typing.innerHTML = '<span></span><span></span><span></span>';
    row.appendChild(typing);
    messages.appendChild(row);
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

  bubble.addEventListener('click', () => {
    win.classList.toggle('open');
    bubble.classList.toggle('active');
  });
  document.getElementById('wlai-send').addEventListener('click', sendMessage);
  input.addEventListener('keypress', e => { if (e.key === 'Enter') sendMessage(); });
})();
