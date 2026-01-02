// ==UserScript==
// @name         capture test
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  뤼튼 크랙의 채팅 로그를 선택하여 캡쳐하고, 원하는 문장에 형광펜을 적용합니다.
// @author       뤼붕이
// @match        https://crack.wrtn.ai/stories/*/episodes/*
// @downloadURL    https://github.com/wrtn321/userjs/raw/refs/heads/main/chatcapture.user.js
// @updateURL    https://github.com/wrtn321/userjs/raw/refs/heads/main/chatcapture.user.js
// @grant        GM_addStyle
// @require      https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js
// @license      MIT
// ==UserScript==

(function() {
    'use strict';

    // ===================================================================================
    // PART 1: 설정 관리
    // ===================================================================================
    class ConfigManager {
        static getConfig() {
            const defaultConfig = {
                // [수정됨] 기본값을 jpeg로 변경하고 형광펜 설정을 추가합니다.
                imageFormat: 'jpeg',
                fileName: '캡쳐_{date}',
                replaceWords: [],
                highlighterColor: '#FFD700', // 기본 형광펜 색상 (골드)
                highlighterOpacity: 0.5      // 기본 형광펜 투명도 (50%)
            };
            try {
                const storedConfig = JSON.parse(localStorage.getItem("crackCaptureConfigV4") || "{}");
                if (!Array.isArray(storedConfig.replaceWords)) storedConfig.replaceWords = [];
                return { ...defaultConfig, ...storedConfig };
            } catch (e) { return defaultConfig; }
        }
        static setConfig(config) {
            localStorage.setItem("crackCaptureConfigV4", JSON.stringify(config));
        }
    }

    // ===================================================================================
    // PART 2: UI 생성 및 관리
    // ===================================================================================
    function injectCheckboxes() {
        document.querySelectorAll('div[data-message-group-id]').forEach(group => {
            if (group.querySelector('.capture-checkbox-container')) return;
            const container = document.createElement('div');
            container.className = 'capture-checkbox-container';
            container.style.cssText = 'display: flex; align-items: center; justify-content: center; padding: 0 10px; z-index: 10;';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'capture-checkbox';
            checkbox.style.cssText = 'width: 18px; height: 18px; cursor: pointer;';
            container.appendChild(checkbox);
            if (group.querySelector('.css-1ifxcjt, .css-1g2i6q3')) {
                 group.prepend(container);
                 group.style.display = 'flex';
            } else {
                container.style.position = 'absolute';
                container.style.right = '5px';
                container.style.top = '10px';
                group.style.position = 'relative';
                group.appendChild(container);
            }
        });
    }

    async function createButtons() {
        const menuContainer = await waitForElement('.css-uxwch2');
        if (menuContainer && !document.getElementById('capture-settings-button')) {
            const settingsBtn = document.createElement('div');
            settingsBtn.id = 'capture-settings-button';
            settingsBtn.className = 'css-1dib65l';
            settingsBtn.style.cssText = "display: flex; cursor: pointer; padding: 10px;";
            settingsBtn.innerHTML = `<p class="css-1xke5yy"><span style="padding-right: 6px;">📸</span>캡쳐 설정</p>`;
            settingsBtn.onclick = showSettingsModal;
            menuContainer.appendChild(settingsBtn);
        }
        const chatInputArea = await waitForElement('.css-fhxiwe');
        if (chatInputArea) {
            // [추가됨] 형광펜 버튼
            if (!document.getElementById('highlight-action-button')) {
                const highlightBtn = document.createElement('button');
                highlightBtn.id = 'highlight-action-button';
                highlightBtn.className = 'css-8xk5x8 eh9908w0';
                highlightBtn.style.cssText = "cursor: pointer; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;";
                highlightBtn.title = "선택한 텍스트에 형광펜 적용/제거";
                highlightBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="var(--icon_tertiary)" viewBox="0 0 24 24" width="18" height="18"><path d="M16.2 2.8c.8 0 1.5.3 2.1.9s.9 1.3.9 2.1-.3 1.5-.9 2.1L10 16.2l-4.2-.1.1-4.3L14.1 3.5c.6-.6 1.3-.8 2.1-.7zM4 20h16v-2H4v2z"></path></svg>`;
                highlightBtn.onclick = applyOrRemoveHighlight;
                chatInputArea.prepend(highlightBtn);
            }
            // 캡쳐 버튼
            if (!document.getElementById('capture-action-button')) {
                const captureBtn = document.createElement('button');
                captureBtn.id = 'capture-action-button';
                captureBtn.className = 'css-8xk5x8 eh9908w0';
                captureBtn.style.cssText = "cursor: pointer; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;";
                captureBtn.title = "선택한 대화 캡쳐";
                captureBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="var(--icon_tertiary)" viewBox="0 0 24 24" width="18" height="18"><path d="M9.4 11.3h5.2v-1.6H9.4zM22 6.3v13.4c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6.3c0-1.1.9-2 2-2h3l2-2h6l2 2h3c1.1 0 2 .9 2 2zM12 18.3c2.8 0 5-2.2 5-5s-2.2-5-5-5-5 2.2-5 5 2.2 5 5 5zm0-8.4c1.9 0 3.4 1.5 3.4 3.4s-1.5 3.4-3.4 3.4S8.6 15 8.6 13s1.5-3.1 3.4-3.1z"></path></svg>`;
                captureBtn.onclick = handleCapture;
                chatInputArea.prepend(captureBtn);
            }
        }
    }

    function showSettingsModal() {
        if (document.getElementById("capture-settings-modal")) return;
        let localConfig = ConfigManager.getConfig();
        const isDark = document.body.dataset.theme === 'dark';
        const c = { bg: isDark ? '#2c2c2e' : '#ffffff', text: isDark ? '#e0e0e0' : '#333333', border: isDark ? '#444444' : '#cccccc', inputBg: isDark ? '#3a3a3c' : '#f0f0f0', btn: isDark ? '#0a84ff' : '#007aff', delBtn: isDark ? '#ff453a' : '#ff3b30', btnTxt: '#ffffff' };
        const modalHTML = `
            <div id="capture-settings-modal" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:9999;display:flex;justify-content:center;align-items:center;">
                <div style="background:${c.bg};color:${c.text};padding:24px;border-radius:12px;width:90%;max-width:600px;display:flex;flex-direction:column;gap:20px;max-height: 90vh; overflow-y: auto;">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <h2 style="margin:0;font-size:1.4em;font-weight:600;">📸 캡쳐 설정</h2>
                        <button id="capture-modal-close" style="background:none;border:none;color:${c.text};font-size:1.5em;cursor:pointer;">&times;</button>
                    </div>
                    <div style="display:flex; gap: 10px; flex-wrap: wrap;">
                        <div style="flex: 1 1 200px;"><label style="display:block; margin-bottom: 8px;">파일 이름:</label><input id="capture-filename" type="text" value="${localConfig.fileName}" style="width:100%;padding:10px;border:1px solid ${c.border};border-radius:6px;background:${c.inputBg};color:${c.text};box-sizing: border-box;"></div>
                        <div style="flex: 1 1 200px;"><label style="display:block; margin-bottom: 8px;">이미지 형식:</label>
                           <select id="capture-format" style="width:100%;padding:10px;border:1px solid ${c.border};border-radius:6px;background:${c.inputBg};color:${c.text};box-sizing: border-box;">
                                <option value="jpeg" ${localConfig.imageFormat === 'jpeg' ? 'selected' : ''}>JPG</option>
                                <option value="png" ${localConfig.imageFormat === 'png' ? 'selected' : ''}>PNG</option>
                                <option value="webp" ${localConfig.imageFormat === 'webp' ? 'selected' : ''}>WEBP</option>
                            </select>
                        </div>
                    </div>
                    <!-- [추가됨] 형광펜 설정 UI -->
                    <div>
                        <label style="display:block; margin-bottom: 8px;">형광펜 설정:</label>
                        <div style="display:flex; gap: 10px; align-items: center; border: 1px solid ${c.border}; border-radius: 6px; padding: 10px;">
                            <input id="highlight-color" type="color" value="${localConfig.highlighterColor}" style="min-width: 40px; height: 30px; border: none; background: transparent; padding: 0;">
                            <input id="highlight-opacity" type="range" min="0" max="100" value="${localConfig.highlighterOpacity * 100}" style="flex: 1;">
                            <span id="highlight-opacity-value" style="font-size: 0.9em; min-width: 40px; text-align: right;">${localConfig.highlighterOpacity * 100}%</span>
                        </div>
                    </div>
                    <div>
                        <label style="display:block; margin-bottom: 8px;">단어 변환 규칙:</label>
                        <div id="replace-list" style="max-height: 150px; overflow-y: auto; border: 1px solid ${c.border}; border-radius: 6px; padding: 10px; margin-bottom: 10px;"></div>
                        <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;"><input id="find-word" type="text" placeholder="원본 단어" style="flex:1 1 120px; padding:10px; border:1px solid ${c.border}; border-radius:6px; background:${c.inputBg}; color:${c.text}; box-sizing: border-box;"><span style="font-size: 1.2em;">→</span><input id="replace-word" type="text" placeholder="변환할 단어" style="flex:1 1 120px; padding:10px; border:1px solid ${c.border}; border-radius:6px; background:${c.inputBg}; color:${c.text}; box-sizing: border-box;"><button id="add-replace-rule" style="padding:10px; background:${c.btn}; color:${c.btnTxt}; border:none; border-radius:6px; cursor:pointer; min-width: 40px;">+</button></div>
                    </div>
                    <div style="text-align: right; border-top: 1px solid ${c.border}; padding-top: 20px;"><button id="capture-modal-save" style="padding:10px 20px;background:${c.btn};color:${c.btnTxt};border:none;border-radius:8px;cursor:pointer;font-size:1em;">저장</button></div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML("beforeend", modalHTML);
        document.getElementById('highlight-opacity').addEventListener('input', e => { document.getElementById('highlight-opacity-value').textContent = `${e.target.value}%`; });
        const renderReplaceList = () => { const listDiv = document.getElementById('replace-list'); listDiv.innerHTML = ''; if (localConfig.replaceWords.length === 0) { listDiv.innerHTML = `<span style="opacity: 0.6;">추가된 규칙이 없습니다.</span>`; } localConfig.replaceWords.forEach((rule, index) => { const item = document.createElement('div'); item.style.cssText = `display:flex; justify-content:space-between; align-items:center; padding: 5px; border-radius: 4px;`; item.innerHTML = `<span>${rule.find} → ${rule.replace}</span><button data-index="${index}" class="delete-rule" style="background:${c.delBtn}; color:${c.btnTxt}; border:none; border-radius:4px; cursor:pointer; width: 20px; height: 20px;">×</button>`; listDiv.appendChild(item); }); document.querySelectorAll('.delete-rule').forEach(btn => { btn.onclick = (e) => { localConfig.replaceWords.splice(parseInt(e.target.dataset.index), 1); renderReplaceList(); }; }); };
        document.getElementById('add-replace-rule').onclick = () => { const findInput = document.getElementById('find-word'); const replaceInput = document.getElementById('replace-word'); if (findInput.value.trim()) { localConfig.replaceWords.push({ find: findInput.value, replace: replaceInput.value }); findInput.value = ''; replaceInput.value = ''; renderReplaceList(); } };
        const closeModal = () => document.getElementById("capture-settings-modal")?.remove();
        document.getElementById('capture-modal-close').onclick = closeModal;
        document.getElementById('capture-modal-save').onclick = () => {
            localConfig.fileName = document.getElementById('capture-filename').value;
            localConfig.imageFormat = document.getElementById('capture-format').value;
            localConfig.highlighterColor = document.getElementById('highlight-color').value;
            localConfig.highlighterOpacity = parseInt(document.getElementById('highlight-opacity').value) / 100;
            ConfigManager.setConfig(localConfig);
            updateHighlighterStyle(); // 저장 시 형광펜 스타일 즉시 업데이트
            alert('설정이 저장되었습니다.');
            closeModal();
        };
        renderReplaceList();
    }


    // ===================================================================================
    // PART 3: 캡쳐 및 형광펜 로직
    // ===================================================================================

    // [추가됨] 형광펜 스타일을 동적으로 적용/업데이트하는 함수
    function updateHighlighterStyle() {
        let styleElement = document.getElementById('_ccc-highlighter-style');
        if (!styleElement) {
            styleElement = document.createElement('style');
            styleElement.id = '_ccc-highlighter-style';
            document.head.appendChild(styleElement);
        }
        const config = ConfigManager.getConfig();
        const color = config.highlighterColor;
        // HEX 색상을 RGB로 변환하여 투명도(alpha) 적용
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        const rgbaColor = `rgba(${r}, ${g}, ${b}, ${config.highlighterOpacity})`;

        // 스타일 정의
        styleElement.textContent = `
            ._ccc-highlighter {
                background-color: ${rgbaColor};
                padding: 0.1em 0;
            }
        `;
    }

    // [추가됨] 텍스트 선택 영역에 형광펜을 적용하거나 제거하는 함수
    function applyOrRemoveHighlight() {
        const selection = window.getSelection();
        if (!selection.rangeCount || selection.isCollapsed) return; // 선택된 텍스트가 없으면 종료

        const range = selection.getRangeAt(0);
        const highlighterNode = range.startContainer.parentElement.closest('._ccc-highlighter');

        if (highlighterNode && selection.toString().trim() === highlighterNode.textContent.trim()) {
            // 이미 형광펜이 적용된 경우 -> 제거 (unwrap)
            const parent = highlighterNode.parentNode;
            while(highlighterNode.firstChild) {
                parent.insertBefore(highlighterNode.firstChild, highlighterNode);
            }
            parent.removeChild(highlighterNode);
        } else {
            // 형광펜이 적용되지 않은 경우 -> 적용
            const mark = document.createElement('mark');
            mark.className = '_ccc-highlighter';
            try {
                range.surroundContents(mark);
            } catch (e) {
                console.warn("여러 문단에 걸친 선택은 형광펜 적용이 어려울 수 있습니다.", e);
                alert("여러 문단에 걸쳐 있거나 복잡한 텍스트는 형광펜으로 표시할 수 없습니다.");
            }
        }
        selection.removeAllRanges(); // 적용 후 선택 해제
    }

    async function handleCapture() {
        // 이 함수는 기존 로직을 거의 그대로 사용합니다.
        const allMessages = Array.from(document.querySelectorAll('div[data-message-group-id]'));
        const selectedMessages = allMessages.filter(msg => msg.querySelector('.capture-checkbox:checked'));
        if (selectedMessages.length === 0) { alert('캡쳐할 메시지를 하나 이상 선택해주세요.'); return; }
        const btn = document.getElementById('capture-action-button');
        const originalContent = btn.innerHTML;
        btn.innerHTML = '...';
        btn.disabled = true;
        try {
            const config = ConfigManager.getConfig();
            const captureArea = document.createElement('div');
            captureArea.style.padding = '20px';
            captureArea.style.boxSizing = 'border-box';
            const chatContainer = document.querySelector('.css-18d9jqd > div:first-child, .css-alg45 > div:first-child');
            if (chatContainer) captureArea.style.width = `${chatContainer.clientWidth}px`;
            const bgColor = window.getComputedStyle(document.body).backgroundColor;
            captureArea.style.backgroundColor = bgColor;
            selectedMessages.reverse().forEach(msg => {
                const clone = msg.cloneNode(true);
                clone.querySelector('.capture-checkbox-container')?.remove();
                if (!clone.querySelector('.css-1ifxcjt, .css-1g2i6q3')) {
                    clone.style.marginBottom = '16px';
                }
                captureArea.appendChild(clone);
            });
            if (config.replaceWords.length > 0) { findTextNodes(captureArea).forEach(node => { let text = node.nodeValue; config.replaceWords.forEach(rule => { text = text.replaceAll(rule.find, rule.replace); }); node.nodeValue = text; }); }
            document.body.appendChild(captureArea);
            captureArea.style.position = 'absolute';
            captureArea.style.left = '-9999px';
            captureArea.style.top = '0px';
            const canvas = await html2canvas(captureArea, { useCORS: true, backgroundColor: bgColor, logging: false });
            document.body.removeChild(captureArea);
            downloadImage(canvas.toDataURL(`image/${config.imageFormat}`, 1.0), config.imageFormat);
        } catch (error) { console.error('캡쳐 중 오류 발생:', error); alert('캡쳐에 실패했습니다. 콘솔을 확인해주세요.'); } finally { btn.innerHTML = originalContent; btn.disabled = false; }
    }

    function downloadImage(dataUrl, format) {
        let fileName = ConfigManager.getConfig().fileName;
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hour = String(now.getHours()).padStart(2, '0');
        const minute = String(now.getMinutes()).padStart(2, '0');
        const second = String(now.getSeconds()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        const timeStr = `${hour}-${minute}`;
        fileName = fileName.replace('{datetime}', `${dateStr}_${timeStr}`).replace('{date}', dateStr).replace('{time}', timeStr).replace('{year}', year).replace('{month}', month).replace('{day}', day).replace('{hour}', hour).replace('{minute}', minute).replace('{second}', second);
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `${fileName}.${format === 'jpeg' ? 'jpg' : format}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function findTextNodes(element) {
        const textNodes = [];
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while (node = walker.nextNode()) { if (node.nodeValue.trim() !== '') textNodes.push(node); }
        return textNodes;
    }

    // ===================================================================================
    // PART 4: 스크립트 실행 및 보조 함수
    // ===================================================================================
    function waitForElement(selector) { return new Promise(resolve => { const interval = setInterval(() => { const element = document.querySelector(selector); if (element) { clearInterval(interval); resolve(element); } }, 100); }); }
    const observer = new MutationObserver(() => {
        // 버튼들이 모두 있는지 확인하고 없으면 다시 생성
        if (!document.getElementById('capture-settings-button') || !document.getElementById('capture-action-button') || !document.getElementById('highlight-action-button')) {
            createButtons();
        }
        injectCheckboxes();
    });

    waitForElement('.css-18d9jqd, .css-alg45').then(chatArea => {
        updateHighlighterStyle(); // 스크립트 시작 시 저장된 형광펜 스타일 적용
        observer.observe(chatArea, { childList: true, subtree: true });
        createButtons();
        injectCheckboxes();
    });

})();
