// ==UserScript==
// @name         Max Encrypted
// @namespace    http://tampermonkey.net/
// @version      1.3.0
// @description  Шифровка чата Max
// @author       ArturKaktus
// @match        https://web.max.ru/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=max.ru
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_notification
// @run-at       document-end
// @updateURL    https://github.com/ArturKaktus/Max-Encrypted-tm/raw/refs/heads/main/userscript/max-encrypted.user.js
// @downloadURL  https://github.com/ArturKaktus/Max-Encrypted-tm/raw/refs/heads/main/userscript/max-encrypted.user.js
// ==/UserScript==

(function() {
    'use strict';

    // ========== КОНФИГУРАЦИЯ ==========
    const CONFIG = {
        SELECTORS: {
            INPUT: 'div.contenteditable.svelte-1k31az8[contenteditable=""]',
            SEND_BUTTON: 'button[aria-label="Отправить сообщение"]',
            MESSAGE_META: '.meta.svelte-13lobfv',
            MESSAGE_TEXT: 'span.text.svelte-1htnb3l',
            BUTTON_CONTAINER: '.btn.svelte-nwz8cp'
        },
        STORAGE_KEY: 'encryptionKey',
        NOTIFICATION_TIMEOUT: 2000
    };

    // ========== ЛОГГЕР ==========
    const Logger = {
        log: (...args) => console.log('%c🔐', 'color: #4CAF50; font-weight: bold;', ...args),
        success: (...args) => console.log('%c✅', 'color: green; font-weight: bold;', ...args)
    };

    // ========== КРИПТОГРАФИЯ ==========
    const Crypto = {
        async encrypt(text, key) {
            const encoder = new TextEncoder();
            const data = encoder.encode(text);
            const keyData = this._prepareKey(key);

            const cryptoKey = await crypto.subtle.importKey(
                'raw', keyData, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
            );

            const iv = crypto.getRandomValues(new Uint8Array(12));
            const encrypted = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv, tagLength: 128 }, cryptoKey, data
            );

            const result = new Uint8Array(iv.length + encrypted.byteLength);
            result.set(iv, 0);
            result.set(new Uint8Array(encrypted), iv.length);

            return btoa(String.fromCharCode(...result));
        },

        async decrypt(encryptedData, key) {
            try {
                const data = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
                const iv = data.slice(0, 12);
                const encrypted = data.slice(12);

                const keyData = this._prepareKey(key);
                const cryptoKey = await crypto.subtle.importKey(
                    'raw', keyData, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
                );

                const decrypted = await crypto.subtle.decrypt(
                    { name: 'AES-GCM', iv, tagLength: 128 },
                    cryptoKey,
                    encrypted
                );

                return new TextDecoder().decode(decrypted);
            } catch {
                return null;
            }
        },

        _prepareKey(key) {
            const keyData = new Uint8Array(32);
            const keyBytes = new TextEncoder().encode(key);
            for (let i = 0; i < 32; i++) {
                keyData[i] = i < keyBytes.length ? keyBytes[i] : 0;
            }
            return keyData;
        }
    };

    // ========== РАБОТА С DOM ==========
    const DOM = {
    input: () => document.querySelector('div.contenteditable.svelte-1k31az8[contenteditable=""]'),
    sendButton: () => document.querySelector('button[aria-label="Отправить сообщение"]'),

    getInputText() {
        const input = this.input();
        if (!input) return '';

        // Сначала ищем span с текстом (самый надежный способ)
        const span = input.querySelector('span[data-lexical-text="true"]');
        if (span && span.textContent) {
            return span.textContent;
        }

        // Если span не нашли, ищем параграф
        const p = input.querySelector('p.paragraph');
        if (p && p.textContent) {
            return p.textContent;
        }

        // Если ничего не нашли, берем весь текст
        return input.textContent || '';
    },

    replaceText(newText) {
        const input = this.input();
        if (!input) return false;

        input.focus();
        document.execCommand('selectAll', false, null);
        setTimeout(() => document.execCommand('insertText', false, newText), 50);
        return true;
    },

    findContainer() {
        const btn = this.sendButton();
        return btn?.closest('.btn.svelte-nwz8cp');
    }
};
    // ========== УПРАВЛЕНИЕ КЛЮЧОМ ==========
    const KeyManager = {
        _key: GM_getValue(CONFIG.STORAGE_KEY, null),

        get() { return this._key; },

        set(key) {
            this._key = key;
            GM_setValue(CONFIG.STORAGE_KEY, key);
            UI.updateAll();
        },

        clear() {
            this._key = null;
            GM_setValue(CONFIG.STORAGE_KEY, null);
            UI.updateAll();
        }
    };

    // ========== ИНТЕРФЕЙС ==========
    const UI = {
        init() {
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
                .encrypt-btn.key-set { background: #4CAF50; }
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
                .decrypt-btn-added:disabled { opacity: 0.5; cursor: not-allowed; }
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
        },

        updateAll() {
            this.updateEncryptButton();
            this.updateDecryptButtons();
            this.updateStatusBadge();
        },

        updateEncryptButton() {
            const btn = document.querySelector('.encrypt-btn');
            if (!btn) return;

            const hasKey = !!KeyManager.get();
            btn.classList.toggle('key-set', hasKey);
            btn.style.background = hasKey ? '#4CAF50' : '#f44336';
            btn.title = hasKey ? '🔐 Зашифровать' : '❌ Нет ключа';
            btn.disabled = false;
        },

        updateDecryptButtons() {
            document.querySelectorAll('.decrypt-btn-added').forEach(btn => {
                btn.disabled = !KeyManager.get();
            });
        },

        updateStatusBadge() {
            const status = document.getElementById('encrypt-status');
            if (!status) return;

            const hasKey = !!KeyManager.get();
            status.style.background = hasKey ? '#4CAF50' : '#f44336';
            status.innerHTML = hasKey ? '🔐 Ключ есть' : '🔓 Ключа нет';
        },

        createPanel() {
            if (document.getElementById('max-encrypted-panel')) return;

            const panel = document.createElement('div');
            panel.id = 'max-encrypted-panel';
            const hasKey = KeyManager.get();

            panel.innerHTML = `
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                    <span style="font-weight: bold;">🔐 Max Encrypted</span>
                    <button id="close-panel" style="background: none; border: none; color: white; cursor: pointer;">✕</button>
                </div>
                <input id="encrypt-key" placeholder="Ключ" value="${hasKey || ''}" style="width:100%; padding:6px; margin-bottom:8px; background:#2d2d2d; color:white; border:1px solid #333; border-radius:4px;">
                <div style="background:#2d2d2d; padding:6px; border-radius:4px; margin-bottom:8px; border-left:3px solid ${hasKey ? '#4CAF50' : '#f44336'};">
                    ${hasKey ? `🔑 Текущий ключ: ${hasKey}` : '❌ Ключ не установлен'}
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
                    KeyManager.set(newKey);
                    panel.remove();
                    GM_notification({ text: 'Ключ сохранен', timeout: CONFIG.NOTIFICATION_TIMEOUT });
                }
            };
            document.getElementById('clear-key').onclick = () => {
                KeyManager.clear();
                document.getElementById('encrypt-key').value = '';
                panel.remove();
                GM_notification({ text: 'Ключ удален', timeout: CONFIG.NOTIFICATION_TIMEOUT });
            };
        },

        async addEncryptButton() {
            const container = DOM.findContainer();
            if (!container || container.querySelector('.encrypt-btn')) return;

            const btn = document.createElement('button');
            btn.className = 'encrypt-btn';
            btn.innerHTML = '🔐';

            btn.onclick = async () => {
                const key = KeyManager.get();
                if (!key) {
                    alert('Сначала установите ключ (⚙️)');
                    return;
                }

                const text = DOM.getInputText().trim();
                if (!text) {
                    alert('Введите текст');
                    return;
                }

                if (text.startsWith('🔒[')) {
                    alert('Уже зашифровано');
                    return;
                }

                try {
                    btn.innerHTML = '⏳';
                    btn.disabled = true;

                    const encrypted = await Crypto.encrypt(text, key);
                    DOM.replaceText(`🔒[${encrypted}]`);

                    btn.innerHTML = '✅';
                    setTimeout(() => {
                        btn.innerHTML = '🔐';
                        this.updateEncryptButton();
                    }, 1000);

                } catch (error) {
                    console.error(error);
                    btn.innerHTML = '❌';
                    setTimeout(() => {
                        btn.innerHTML = '🔐';
                        this.updateEncryptButton();
                    }, 1000);
                }
            };

            container.insertBefore(btn, DOM.sendButton());
            this.updateEncryptButton();
        },

        addDecryptButtons() {
            document.querySelectorAll('.message').forEach(msg => {
                if (msg.querySelector('.decrypt-btn-added')) return;

                const meta = msg.querySelector(CONFIG.SELECTORS.MESSAGE_META);
                const textSpan = msg.querySelector(CONFIG.SELECTORS.MESSAGE_TEXT);
                if (!meta || !textSpan) return;

                const text = textSpan.textContent || '';
                if (!text.includes('🔒[')) return;

                const btn = document.createElement('button');
                btn.className = 'decrypt-btn-added';
                btn.innerHTML = '🔓';
                btn.disabled = !KeyManager.get();

                btn.onclick = async (e) => {
                    e.stopPropagation();

                    const key = KeyManager.get();
                    if (!key) {
                        alert('Сначала установите ключ');
                        return;
                    }

                    btn.innerHTML = '⏳';
                    btn.disabled = true;

                    const match = text.match(/🔒\[(.*?)\]/);
                    if (match) {
                        const decrypted = await Crypto.decrypt(match[1], key);
                        if (decrypted) {
                            textSpan.textContent = `🔓 ${decrypted}`;
                            btn.remove();
                        } else {
                            btn.innerHTML = '❌';
                            setTimeout(() => btn.innerHTML = '🔓', 2000);
                        }
                    }
                    btn.disabled = false;
                };

                meta.appendChild(btn);
            });
        },

        addToggleButton() {
            if (document.getElementById('max-encrypted-toggle')) return;

            const btn = document.createElement('button');
            btn.id = 'max-encrypted-toggle';
            btn.innerHTML = '⚙️';
            btn.style.cssText = `
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
            btn.onclick = () => this.createPanel();
            document.body.appendChild(btn);
        }
    };

    // ========== НАБЛЮДЕНИЕ ЗА СМЕНОЙ ЧАТА ==========
    const Observer = {
        _lastUrl: location.href,
        _chatObserver: null,

        init() {
            // Наблюдение за URL
            new MutationObserver(() => {
                if (location.href !== this._lastUrl) {
                    this._lastUrl = location.href;
                    Logger.log('🔄 Чат изменен');
                    setTimeout(() => {
                        UI.addEncryptButton();
                        UI.addDecryptButtons();
                        setTimeout(UI.updateEncryptButton, 100);
                    }, 1000);
                }
            }).observe(document.querySelector('title'), { childList: true, subtree: true });

            // Наблюдение за DOM
            this._chatObserver = new MutationObserver(() => {
                if (!document.querySelector('.encrypt-btn') && DOM.sendButton()) {
                    Logger.log('🔄 Восстанавливаем кнопку');
                    UI.addEncryptButton();
                    setTimeout(UI.updateEncryptButton, 100);
                }
                UI.addDecryptButtons();
            });

            this._chatObserver.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class']
            });
        }
    };

    // ========== ИНИЦИАЛИЗАЦИЯ ==========
    function init() {
        Logger.log('='.repeat(40));
        Logger.log('🔐 Max Encrypted v2.0');
        Logger.log('='.repeat(40));

        UI.init();

        setTimeout(() => {
            if (DOM.input() && DOM.sendButton()) {
                UI.addToggleButton();
                UI.addEncryptButton();
                UI.addDecryptButtons();
                Observer.init();

                const status = document.createElement('div');
                status.id = 'encrypt-status';
                UI.updateStatusBadge();
                document.body.appendChild(status);
            }
        }, 2000);
    }

    init();
})();