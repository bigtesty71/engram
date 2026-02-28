// ============================================================
// MemoryKeep ENGRAM — Embeddable Chat Widget
// Drop-in <script> tag for any website
// ============================================================

(function () {
    'use strict';

    // ── State ──
    let sessionId = localStorage.getItem('engram_session_id') || null;
    let isOpen = false;
    let isSending = false;

    // ── API base URL (auto-detect or configure) ──
    const API_BASE = window.ENGRAM_API_BASE || '';

    // ── Toggle widget ──
    window.toggleWidget = function () {
        const win = document.getElementById('widgetWindow');
        const bubble = document.getElementById('widgetBubble');

        isOpen = !isOpen;

        if (isOpen) {
            win.classList.add('open');
            bubble.style.display = 'none';
            document.getElementById('widgetInput').focus();
        } else {
            win.classList.remove('open');
            bubble.style.display = 'flex';
        }
    };

    // ── Open widget programmatically ──
    window.openWidget = function () {
        if (!isOpen) {
            toggleWidget();
        }
    };

    // ── Send message ──
    window.sendMessage = async function () {
        if (isSending) return;

        const input = document.getElementById('widgetInput');
        const message = input.value.trim();
        if (!message) return;

        input.value = '';
        isSending = true;

        const sendBtn = document.getElementById('widgetSend');
        sendBtn.disabled = true;

        // Add user message
        addMessage('user', message);

        // Show typing indicator
        const typingId = showTyping();

        try {
            const res = await fetch(`${API_BASE}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message,
                    sessionId,
                    userId: 'widget-user'
                })
            });

            const data = await res.json();

            // Remove typing indicator
            removeTyping(typingId);

            if (data.response) {
                addMessage('assistant', data.response);

                // Store session ID
                if (data.sessionId) {
                    sessionId = data.sessionId;
                    localStorage.setItem('engram_session_id', sessionId);
                }
            } else if (data.error) {
                addMessage('assistant', `I encountered an issue: ${data.error}. Please try again.`);
            }
        } catch (err) {
            removeTyping(typingId);
            addMessage('assistant', 'I seem to be offline right now. Please make sure the server is running and try again.');
        }

        isSending = false;
        sendBtn.disabled = false;
        input.focus();
    };

    // ── Add message to chat ──
    function addMessage(role, content) {
        const container = document.getElementById('widgetMessages');
        const msgEl = document.createElement('div');
        msgEl.className = `widget-msg ${role}`;

        // Parse simple markdown
        content = content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');

        msgEl.innerHTML = content;
        container.appendChild(msgEl);
        container.scrollTop = container.scrollHeight;
    }

    // ── Show typing indicator ──
    function showTyping() {
        const container = document.getElementById('widgetMessages');
        const typingEl = document.createElement('div');
        const id = 'typing-' + Date.now();
        typingEl.id = id;
        typingEl.className = 'widget-msg typing';
        typingEl.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
        container.appendChild(typingEl);
        container.scrollTop = container.scrollHeight;
        return id;
    }

    // ── Remove typing indicator ──
    function removeTyping(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    // ── Keyboard shortcut: Ctrl+Shift+E to toggle ──
    document.addEventListener('keydown', function (e) {
        if (e.ctrlKey && e.shiftKey && e.key === 'E') {
            e.preventDefault();
            toggleWidget();
        }
    });
})();
