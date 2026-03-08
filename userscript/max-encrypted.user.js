// ==UserScript==
// @name         Max Encrypted
// @namespace    http://tampermonkey.net/
// @version      1.1.0
// @description  Шифровка чата
// @author       ArturKaktus
// @match        https://web.max.ru/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=max.ru
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_notification
// @run-at       document-end
// @updateURL    https://github.com/ArturKaktus/Okko-logo-remover-tm/raw/refs/heads/main/userscript/max-encrypted.user.js
// @downloadURL  https://github.com/ArturKaktus/Okko-logo-remover-tm/raw/refs/heads/main/userscript/max-encrypted.user.js
// ==/UserScript==

(function() {
    'use strict';

    const Logger = {
        log: (...args) => console.log('%c🔐', 'color: #4CAF50; font-weight: bold;', ...args),
        success: (...args) => console.log('%c✅', 'color: green; font-weight: bold;', ...args)
    };

    // ========== КРИПТОГРАФИЯ ==========
    async function encryptMessage(text, key) {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);

        const keyData = new Uint8Array(32);
        const keyEncoder = new TextEncoder();
        const keyBytes = keyEncoder.encode(key);
        for (let i = 0; i < 32; i++) {
            keyData[i] = i < keyBytes.length ? keyBytes[i] : 0;
        }

        const cryptoKey = await crypto.subtle.importKey(
            'raw', keyData, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
        );

        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv, tagLength: 128 }, cryptoKey, data
        );

        const result = new Uint8Array(iv.length + encrypted.byteLength);
        result.set(iv, 0);
        result.set(new Uint8Array(encrypted), iv.length);

        let binary = '';
        for (let i = 0; i < result.length; i++) {
            binary += String.fromCharCode(result[i]);
        }

        return btoa(binary);
    }

    async function decryptMessage(encryptedData, key) {
        try {
            const data = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
            const iv = data.slice(0, 12);
            const encrypted = data.slice(12);

            const keyData = new Uint8Array(32);
            const keyEncoder = new TextEncoder();
            const keyBytes = keyEncoder.encode(key);
            for (let i = 0; i < 32; i++) {
                keyData[i] = i < keyBytes.length ? keyBytes[i] : 0;
            }

            const cryptoKey = await crypto.subtle.importKey(
                'raw', keyData, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
            );

            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv, tagLength: 128 },
                cryptoKey,
                encrypted
            );

            const decoder = new TextDecoder();
            return decoder.decode(decrypted);
        } catch (error) {
            return null;
        }
    }

    // ========== РАБОТА С DOM ==========
    function findInputField() {
        return document.querySelector('div.contenteditable.svelte-1k31az8[contenteditable=""]');
    }

    function findSendButton() {
        return document.querySelector('button[aria-label="Отправить сообщение"]');
    }

    function getInputText() {
        const input = findInputField();
        if (!input) return '';
        const span = input.querySelector('span[data-lexical-text="true"]');
        return span ? span.textContent || '' : input.textContent || '';
    }

    function replaceText(newText) {
        const input = findInputField();
        if (!input) return false;

        input.focus();
        document.execCommand('selectAll', false, null);

        setTimeout(() => {
            document.execCommand('insertText', false, newText);
        }, 50);

        return true;
    }

    // ========== РАБОТА С КЛЮЧОМ ==========
    let currentKey = GM_getValue('encryptionKey', null);

    function setCurrentKey(key) {
        currentKey = key;
        GM_setValue('encryptionKey', key);
    }

    // ========== ИНТЕРФЕЙС ==========
    GM_addStyle(`
        .encrypt-btn {
            margin-right: 8px;
            width: 40px;
            height: 40px;
            border-radius: 8px;
            background: #f44336;
            color: white;
            border: none;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            transition: background 0.2s;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        }
        .encrypt-btn.key-set {
            background: #4CAF50;
        }
        .decrypt-btn-added {
            margin-left: 8px;
            padding: 2px 6px;
            border-radius: 4px;
            background: #4CAF50;
            color: white;
            border: none;
            cursor: pointer;
            font-size: 11px;
            transition: background 0.2s;
        }
        .decrypt-btn-added:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        #max-encrypted-panel {
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 10000;
            background: #1a1a1a;
            color: white;
            padding: 12px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.5);
            font-family: sans-serif;
            min-width: 250px;
        }
        #encrypt-status {
            position: fixed;
            bottom: 10px;
            left: 10px;
            padding: 5px 10px;
            border-radius: 4px;
            font-size: 12px;
            z-index: 10000;
            color: white;
            transition: background 0.3s;
        }
    `);

    function updateEncryptButtonColor() {
        const btn = document.querySelector('.encrypt-btn');
        if (!btn) return;

        if (currentKey) {
            btn.classList.add('key-set');
            btn.style.background = '#4CAF50';
            btn.title = '🔐 Зашифровать текст';
            btn.disabled = false;
        } else {
            btn.classList.remove('key-set');
            btn.style.background = '#f44336';
            btn.title = '❌ Нет ключа';
            btn.disabled = false;
        }
    }

    function updateStatus() {
        const status = document.getElementById('encrypt-status');
        if (status) {
            status.style.background = currentKey ? '#4CAF50' : '#f44336';
            status.innerHTML = currentKey ? '🔐 Ключ есть' : '🔓 Ключа нет';
        }

        document.querySelectorAll('.decrypt-btn-added').forEach(btn => {
            btn.disabled = !currentKey;
        });
    }

    function createControlPanel() {
        if (document.getElementById('max-encrypted-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'max-encrypted-panel';

        panel.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                <span style="font-weight: bold;">🔐 Max Encrypted</span>
                <button id="close-panel" style="background: none; border: none; color: white; cursor: pointer;">✕</button>
            </div>
            <input id="encrypt-key" placeholder="Ключ">
            <div style="background:#2d2d2d; padding:6px; border-radius:4px; margin-bottom:8px; border-left:3px solid ${currentKey ? '#4CAF50' : '#f44336'};" id="key-display">
                ${currentKey ? `🔑 Текущий ключ: ${currentKey}` : '❌ Ключ не установлен'}
            </div>
            <div style="display: flex; gap: 8px;">
                <button id="save-key" style="flex:1; background:#4CAF50; color:white; border:none; padding:6px; border-radius:4px;">Сохранить</button>
                <button id="clear-key" style="flex:1; background:#f44336; color:white; border:none; padding:6px; border-radius:4px;">Очистить</button>
            </div>
        `;

        document.body.appendChild(panel);

        document.getElementById('close-panel').onclick = () => panel.remove();

        document.getElementById('save-key').onclick = () => {
            const newKey = document.getElementById('encrypt-key').value.trim();
            if (newKey) {
                setCurrentKey(newKey);
                document.getElementById('key-display').innerHTML = `🔑 Текущий ключ: ${newKey}`;
                document.getElementById('key-display').style.borderLeftColor = '#4CAF50';
                updateEncryptButtonColor();
                updateStatus();
                GM_notification({ text: 'Ключ сохранен', timeout: 2000 });
            }
        };

        document.getElementById('clear-key').onclick = () => {
            setCurrentKey(null);
            document.getElementById('encrypt-key').value = '';
            document.getElementById('key-display').innerHTML = '❌ Ключ не установлен';
            document.getElementById('key-display').style.borderLeftColor = '#f44336';
            updateEncryptButtonColor();
            updateStatus();
            GM_notification({ text: 'Ключ удален', timeout: 2000 });
        };
    }

    async function addEncryptButton() {
        const sendButton = findSendButton();
        if (!sendButton) return;

        const container = sendButton.closest('.btn.svelte-nwz8cp');
        if (!container) return;

        // Удаляем старую кнопку если есть
        const oldBtn = container.querySelector('.encrypt-btn');
        if (oldBtn) oldBtn.remove();

        const encryptBtn = document.createElement('button');
        encryptBtn.className = 'encrypt-btn';
        encryptBtn.innerHTML = '🔐';

        updateEncryptButtonColor();

        encryptBtn.onclick = async () => {
            if (!currentKey) {
                alert('Сначала установите ключ (⚙️)');
                return;
            }

            const text = getInputText().trim();
            if (!text) {
                alert('Введите текст');
                return;
            }

            if (text.startsWith('🔒[')) {
                alert('Уже зашифровано');
                return;
            }

            try {
                encryptBtn.innerHTML = '⏳';
                encryptBtn.disabled = true;

                const encrypted = await encryptMessage(text, currentKey);
                Logger.success('Текст зашифрован');

                replaceText(`🔒[${encrypted}]`);

                encryptBtn.innerHTML = '✅';
                setTimeout(() => {
                    encryptBtn.innerHTML = '🔐';
                    encryptBtn.disabled = false;
                    updateEncryptButtonColor();
                }, 1000);

            } catch (error) {
                console.error(error);
                encryptBtn.innerHTML = '❌';
                setTimeout(() => {
                    encryptBtn.innerHTML = '🔐';
                    encryptBtn.disabled = false;
                    updateEncryptButtonColor();
                }, 1000);
            }
        };

        container.insertBefore(encryptBtn, sendButton);
        Logger.success('✅ Кнопка добавлена');
    }

    function addDecryptButtons() {
        document.querySelectorAll('.message').forEach(msg => {
            if (msg.querySelector('.decrypt-btn-added')) return;

            const metaDiv = msg.querySelector('.meta.svelte-13lobfv');
            const textSpan = msg.querySelector('span.text.svelte-1htnb3l');
            if (!metaDiv || !textSpan) return;

            const text = textSpan.textContent || '';
            if (!text.includes('🔒[')) return;

            const btn = document.createElement('button');
            btn.className = 'decrypt-btn-added';
            btn.innerHTML = '🔓';
            btn.disabled = !currentKey;

            btn.onclick = async (e) => {
                e.stopPropagation();

                if (!currentKey) {
                    alert('Сначала установите ключ');
                    return;
                }

                btn.innerHTML = '⏳';
                btn.disabled = true;

                const match = text.match(/🔒\[(.*?)\]/);
                if (match) {
                    const decrypted = await decryptMessage(match[1], currentKey);

                    btn.disabled = false;

                    if (decrypted) {
                        textSpan.textContent = `🔓 ${decrypted}`;
                        btn.remove();
                    } else {
                        btn.innerHTML = '❌';
                        setTimeout(() => {
                            btn.innerHTML = '🔓';
                        }, 2000);
                    }
                }
            };

            metaDiv.appendChild(btn);
        });
    }

    function addPanelToggle() {
        if (document.getElementById('max-encrypted-toggle')) return;

        const toggle = document.createElement('button');
        toggle.id = 'max-encrypted-toggle';
        toggle.innerHTML = '⚙️';
        toggle.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 10000;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: #4CAF50;
            color: white;
            border: none;
            cursor: pointer;
            font-size: 20px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        `;
        toggle.onclick = createControlPanel;
        document.body.appendChild(toggle);
    }

    // ========== ОТСЛЕЖИВАНИЕ СМЕНЫ ЧАТА ==========
    let lastUrl = location.href;
    let chatObserver = null;

    function setupChatObserver() {
        // Наблюдаем за изменением URL (смена чата)
        const urlObserver = new MutationObserver(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                Logger.log('🔄 Чат изменен, восстанавливаем кнопку...');

                // Даем время на загрузку нового чата
                setTimeout(() => {
                    addEncryptButton();
                    addDecryptButtons();
                }, 1000);
            }
        });

        urlObserver.observe(document.querySelector('title'), {
            childList: true,
            subtree: true
        });

        // Наблюдаем за появлением новых сообщений и кнопки отправки
        if (chatObserver) chatObserver.disconnect();

        chatObserver = new MutationObserver(() => {
            // Проверяем, есть ли кнопка шифрования
            if (!document.querySelector('.encrypt-btn')) {
                const sendButton = findSendButton();
                if (sendButton) {
                    Logger.log('🔄 Кнопка отправки появилась, восстанавливаем...');
                    addEncryptButton();
                }
            }
            addDecryptButtons();
        });

        chatObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
        });
    }

    // ========== ЗАПУСК ==========
    setTimeout(() => {
        Logger.log('='.repeat(40));
        Logger.log('🔐 Max Encrypted - ФИНАЛ С ОТСЛЕЖИВАНИЕМ');
        Logger.log('='.repeat(40));

        const input = findInputField();
        const sendButton = findSendButton();

        setTimeout(updateEncryptButtonColor, 500);

        if (input && sendButton) {
            addPanelToggle();
            addEncryptButton();
            addDecryptButtons();
            setupChatObserver();

            const statusDiv = document.createElement('div');
            statusDiv.id = 'encrypt-status';
            updateStatus();
            document.body.appendChild(statusDiv);
        }

        Logger.log('='.repeat(40));
    }, 2000);
})();