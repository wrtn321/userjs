// ==UserScript==
// @name         test
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  뤼튼 크랙의 채팅 로그를 선택하여 캡쳐
// @author       뤼붕이
// @match        https://crack.wrtn.ai/stories/*/episodes/*
// @grant        GM_addStyle
// @require      https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    let isHighlighterMode = false;

    // ===================================================================================
    // PART 1: 설정 관리
    // ===================================================================================
    class ConfigManager {
        static getConfig() {
            const defaultConfig = {
                imageFormat: 'jpeg',
                fileName: '캡쳐_{date}',
                hiddenKeywords: [],
                highQualityCapture: false,
                highlighterColor: '#FFFF00', // 기본값: 노란색
                highlighterOpacity: 0.5       // 기본값: 50% 투명도
            };
            try {
                const storedConfig = JSON.parse(localStorage.getItem("crackCaptureConfigV5") || "{}");
                if (!Array.isArray(storedConfig.hiddenKeywords)) storedConfig.hiddenKeywords = [];
                return { ...defaultConfig, ...storedConfig };
            } catch (e) { return defaultConfig; }
        }
        static setConfig(config) { localStorage.setItem("crackCaptureConfigV5", JSON.stringify(config)); }
    }

    // ===================================================================================
    // PART 2: UI 생성 및 관리
    // ===================================================================================
    function createFloatingUI() {
        if (document.getElementById('capture-fab-container')) return;

        GM_addStyle(`
            #capture-fab-container { position: fixed; bottom: 25px; right: 25px; z-index: 9999; display: flex; flex-direction: column; align-items: flex-end; gap: 12px; }
            .fab-action-button { width: 140px; padding: 10px 16px; border-radius: 20px; border: none; cursor: pointer; background-color: #333; color: white; box-shadow: 0 4px 8px rgba(0,0,0,0.2); font-size: 15px; text-align: left; display: flex; align-items: center; gap: 10px; transform: scale(0.9) translateY(10px); opacity: 0; transition: transform 0.2s ease-out, opacity 0.2s ease-out; visibility: hidden; }
            #capture-fab-actions.visible .fab-action-button { transform: scale(1) translateY(0); opacity: 1; visibility: visible; }
            #capture-fab-toggle { width: 56px; height: 56px; border-radius: 50%; border: none; cursor: pointer; background-color: #007aff; color: white; box-shadow: 0 4px 8px rgba(0,0,0,0.3); font-size: 28px; display: flex; justify-content: center; align-items: center; transition: transform 0.2s ease, background-color 0.2s ease; }
            #capture-fab-toggle:hover { transform: scale(1.05); }
            body[data-theme='dark'] .fab-action-button { background-color: #4d4d4d; }
            /* 형광펜 활성화 스타일 */
            body.highlighter-active { cursor: crosshair; }
            #highlighter-btn.active { background-color: #ff453a; }
        `);

        const fabContainer = document.createElement('div');
        fabContainer.id = 'capture-fab-container';
        const actionsContainer = document.createElement('div');
        actionsContainer.id = 'capture-fab-actions';
        actionsContainer.style.cssText = 'display: flex; flex-direction: column; align-items: flex-end; gap: 12px;';

        const buttons = [
            { id: 'camera-btn', text: '📸 카메라', action: handleCapture },
            { id: 'highlighter-btn', text: '🖍️ 형광펜', action: toggleHighlighterMode },
            { id: 'settings-btn', text: '⚙️ 설정', action: showSettingsModal }
        ];

        buttons.forEach(btnInfo => {
            const button = document.createElement('button');
            button.id = btnInfo.id;
            button.className = 'fab-action-button';
            button.innerHTML = `<span>${btnInfo.text}</span>`;
            button.onclick = btnInfo.action;
            actionsContainer.appendChild(button);
        });

        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'capture-fab-toggle';
        toggleBtn.textContent = '🛠️';
        toggleBtn.title = '캡쳐 도구 열기';
        toggleBtn.onclick = () => {
            actionsContainer.classList.toggle('visible');
            toggleBtn.textContent = actionsContainer.classList.contains('visible') ? '✕' : '🛠️';
        };

        fabContainer.appendChild(actionsContainer);
        fabContainer.appendChild(toggleBtn);
        document.body.appendChild(fabContainer);
    }

    function injectCheckboxes() {
        document.querySelectorAll('div[data-message-group-id]').forEach(group => {
            if (group.querySelector('.capture-checkbox-container')) return;
            const container = document.createElement('div');
            container.className = 'capture-checkbox-container';
            container.style.cssText = 'display: flex; align-items: center; justify-content: center; z-index: 10;';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'capture-checkbox';
            checkbox.style.cssText = 'width: 18px; height: 18px; cursor: pointer;';
            container.appendChild(checkbox);

            if (group.querySelector('.css-1ifxcjt, .css-1g2i6q3')) {
                 group.prepend(container);
                 group.style.display = 'flex';
            } else {
                container.style.position = 'absolute'; container.style.right = '0px'; container.style.top = '0px';
                group.style.position = 'relative'; group.appendChild(container);
            }
        });
    }

    function showSettingsModal() {
        if (document.getElementById("capture-settings-modal")) return;
        let localConfig = ConfigManager.getConfig();
        const isDark = document.body.dataset.theme === 'dark';
        const c = { bg: isDark ? '#2c2c2e' : '#ffffff', text: isDark ? '#e0e0e0' : '#333333', border: isDark ? '#444444' : '#cccccc', inputBg: isDark ? '#3a3a3c' : '#f0f0f0', btn: isDark ? '#0a84ff' : '#007aff', delBtn: isDark ? '#ff453a' : '#ff3b30', btnTxt: '#ffffff' };
        const modalHTML = `<div id="capture-settings-modal" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:10000;display:flex;justify-content:center;align-items:center;"><div style="background:${c.bg};color:${c.text};padding:24px;border-radius:12px;width:90%;max-width:600px;display:flex;flex-direction:column;gap:20px;max-height: 90vh; overflow-y: auto;"><div style="display:flex;justify-content:space-between;align-items:center;"><h2 style="margin:0;font-size:1.4em;font-weight:600;">📸 캡쳐 설정</h2><button id="capture-modal-close" style="background:none;border:none;color:${c.text};font-size:1.5em;cursor:pointer;">&times;</button></div><div style="display:flex; gap: 10px; flex-wrap: wrap;"><div style="flex: 1 1 200px;"><label style="display:block; margin-bottom: 8px;">파일 이름:</label><input id="capture-filename" type="text" value="${localConfig.fileName}" style="width:100%;padding:10px;border:1px solid ${c.border};border-radius:6px;background:${c.inputBg};color:${c.text};box-sizing: border-box;"></div><div style="flex: 1 1 200px;"><label style="display:block; margin-bottom: 8px;">이미지 형식:</label><select id="capture-format" style="width:100%;padding:10px;border:1px solid ${c.border};border-radius:6px;background:${c.inputBg};color:${c.text};box-sizing: border-box;"><option value="jpeg" ${localConfig.imageFormat === 'jpeg' ? 'selected' : ''}>JPG</option><option value="png" ${localConfig.imageFormat === 'png' ? 'selected' : ''}>PNG</option><option value="webp" ${localConfig.imageFormat === 'webp' ? 'selected' : ''}>WEBP</option></select></div></div><div style="display: flex; align-items: center; padding-bottom: 10px;"><input type="checkbox" id="capture-high-quality" style="width: 16px; height: 16px; margin-right: 8px;"><label for="capture-high-quality" style="cursor: pointer; user-select: none;">고화질(용량증가)</label></div><div style="border-top: 1px solid ${c.border}; padding-top: 15px;"><label style="display:block; margin-bottom: 8px;">형광펜 색상/투명도:</label><div style="display:flex; align-items:center; gap:10px;"><input type="color" id="highlighter-color" value="${localConfig.highlighterColor}" style="padding:0; border:none; background:none; width:40px; height:30px; cursor:pointer;"><input type="range" id="highlighter-opacity" min="0.1" max="1" step="0.1" value="${localConfig.highlighterOpacity}" style="flex:1; accent-color: ${c.btn};"><span id="opacity-value" style="font-size:0.9em; min-width:30px;">${localConfig.highlighterOpacity}</span></div></div><div><label style="display:block; margin-bottom: 8px; margin-top:15px;">단어 숨김 규칙:</label><div id="hidden-keyword-list" style="max-height: 150px; overflow-y: auto; border: 1px solid ${c.border}; border-radius: 6px; padding: 10px; margin-bottom: 10px;"></div><div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;"><input id="hidden-keyword-input" type="text" placeholder="숨길 키워드 등록" style="flex:1; padding:10px; border:1px solid ${c.border}; border-radius:6px; background:${c.inputBg}; color:${c.text}; box-sizing: border-box;"><button id="add-hidden-keyword" style="padding:10px; background:${c.btn}; color:${c.btnTxt}; border:none; border-radius:6px; cursor:pointer; min-width: 40px;">+</button></div></div><div style="text-align: right; border-top: 1px solid ${c.border}; padding-top: 20px;"><button id="capture-modal-save" style="padding:10px 20px;background:${c.btn};color:${c.btnTxt};border:none;border-radius:8px;cursor:pointer;font-size:1em;">저장</button></div></div></div>`;
        document.body.insertAdjacentHTML("beforeend", modalHTML);
        document.getElementById('capture-high-quality').checked = !!localConfig.highQualityCapture;
        document.getElementById('highlighter-opacity').oninput = e => document.getElementById('opacity-value').textContent = e.target.value;

        const renderHiddenKeywordList = () => { const listDiv = document.getElementById('hidden-keyword-list'); listDiv.innerHTML = ''; if (localConfig.hiddenKeywords.length === 0) { listDiv.innerHTML = `<span style="opacity: 0.6;">등록된 키워드가 없습니다.</span>`; } localConfig.hiddenKeywords.forEach((keyword, index) => { const item = document.createElement('div'); item.style.cssText = `display:flex; justify-content:space-between; align-items:center; padding: 5px; border-radius: 4px;`; item.innerHTML = `<span>${keyword}</span><button data-index="${index}" class="delete-keyword" style="background:${c.delBtn}; color:${c.btnTxt}; border:none; border-radius:4px; cursor:pointer; width: 20px; height: 20px;">×</button>`; listDiv.appendChild(item); }); document.querySelectorAll('.delete-keyword').forEach(btn => { btn.onclick = (e) => { localConfig.hiddenKeywords.splice(parseInt(e.target.dataset.index), 1); renderHiddenKeywordList(); }; }); };
        document.getElementById('add-hidden-keyword').onclick = () => { const keywordInput = document.getElementById('hidden-keyword-input'); if (keywordInput.value.trim()) { localConfig.hiddenKeywords.push(keywordInput.value.trim()); keywordInput.value = ''; renderHiddenKeywordList(); } };
        const closeModal = () => document.getElementById("capture-settings-modal")?.remove();
        document.getElementById('capture-modal-close').onclick = closeModal;
        document.getElementById('capture-modal-save').onclick = () => {
            localConfig.fileName = document.getElementById('capture-filename').value;
            localConfig.imageFormat = document.getElementById('capture-format').value;
            localConfig.highQualityCapture = document.getElementById('capture-high-quality').checked;
            localConfig.highlighterColor = document.getElementById('highlighter-color').value;
            localConfig.highlighterOpacity = document.getElementById('highlighter-opacity').value;
            ConfigManager.setConfig(localConfig);
            alert('설정이 저장되었습니다.');
            closeModal();
        };
        renderHiddenKeywordList();
    }

    // ===================================================================================
    // PART 3: 캡쳐 로직
    // ===================================================================================
    function hideKeywordsInElement(element, keywords) {
        if (!element || !keywords || keywords.length === 0) return;
        const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(keywords.map(escapeRegExp).join('|'), 'g');
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
        let node;
        const nodesToProcess = [];
        while (node = walker.nextNode()) { nodesToProcess.push(node); }
        nodesToProcess.forEach(node => {
            if (regex.test(node.nodeValue) && node.parentNode.className !== 'custom-highlight') {
                const parent = node.parentNode; const fragment = document.createDocumentFragment(); let lastIndex = 0;
                node.nodeValue.replace(regex, (match, offset) => {
                    fragment.appendChild(document.createTextNode(node.nodeValue.slice(lastIndex, offset)));
                    const span = document.createElement('span'); span.style.color = 'transparent'; span.textContent = match;
                    fragment.appendChild(span); lastIndex = offset + match.length;
                });
                fragment.appendChild(document.createTextNode(node.nodeValue.slice(lastIndex)));
                parent.replaceChild(fragment, node);
            }
        });
    }

    async function handleCapture() {
        const allMessages = Array.from(document.querySelectorAll('div[data-message-group-id]'));
        const selectedMessages = allMessages.filter(msg => msg.querySelector('.capture-checkbox:checked'));
        if (selectedMessages.length === 0) { alert('캡쳐할 메시지를 하나 이상 선택해주세요.'); return; }
        const btn = document.getElementById('camera-btn');
        const originalContent = btn.innerHTML;
        btn.innerHTML = '...'; btn.disabled = true;

        try {
            const config = ConfigManager.getConfig();
            const captureArea = document.createElement('div');
            const PADDING_VALUE = 20;
            captureArea.style.padding = `${PADDING_VALUE}px`; captureArea.style.boxSizing = 'border-box';
            const chatContainer = document.querySelector('.css-18d9jqd, .css-alg45');
            if (chatContainer) captureArea.style.width = `${chatContainer.clientWidth + (PADDING_VALUE * 2)}px`;

            const bgColor = window.getComputedStyle(document.body).backgroundColor;
            captureArea.style.backgroundColor = bgColor;

            selectedMessages.reverse().forEach(msg => {
                const clone = msg.cloneNode(true);
                clone.querySelector('.capture-checkbox-container')?.remove();
                clone.querySelectorAll('pre.shiki').forEach(codeBlock => {
                    const plainText = codeBlock.innerText; const newPre = document.createElement('pre'); newPre.textContent = plainText;
                    const originalStyle = window.getComputedStyle(codeBlock);
                    Object.assign(newPre.style, { backgroundColor: '#242321', color: '#e1e4e8', fontSize: '.875rem', fontFamily: '"IBMPlexMono-Regular", "IBM Plex Mono", "Pretendard", "Apple SD Gothic Neo", -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif', padding: originalStyle.padding, margin: originalStyle.margin, borderRadius: originalStyle.borderRadius, lineHeight: originalStyle.lineHeight, whiteSpace: 'pre-wrap', wordBreak: 'break-word' });
                    codeBlock.parentNode.replaceChild(newPre, codeBlock);
                });
                if (!clone.querySelector('.css-1ifxcjt, .css-1g2i6q3')) clone.style.marginBottom = '20px';
                captureArea.appendChild(clone);
            });

            if (config.hiddenKeywords && config.hiddenKeywords.length > 0) {
                hideKeywordsInElement(captureArea, config.hiddenKeywords);
            }

            document.body.appendChild(captureArea);
            captureArea.style.position = 'absolute'; captureArea.style.left = '-9999px'; captureArea.style.top = '0px';

            const canvasOptions = { useCORS: true, backgroundColor: bgColor, logging: false };
            if (config.highQualityCapture) canvasOptions.scale = 2;
            const canvas = await html2canvas(captureArea, canvasOptions);

            document.body.removeChild(captureArea);
            downloadImage(canvas.toDataURL(`image/${config.imageFormat}`, 1.0), config.imageFormat);
        } catch (error) { console.error('캡쳐 중 오류 발생:', error); alert('캡쳐에 실패했습니다. 콘솔을 확인해주세요.'); } finally { btn.innerHTML = originalContent; btn.disabled = false; }
    }

    // ===================================================================================
    // PART 4: 다운로드 및 보조 함수
    // ===================================================================================
    function downloadImage(dataUrl, format) {
        let fileName = ConfigManager.getConfig().fileName;
        const now = new Date();
        const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
        fileName = fileName.replace('{datetime}', `${dateStr}_${timeStr}`).replace('{date}', dateStr).replace('{time}', timeStr);
        const link = document.createElement('a');
        link.href = dataUrl; link.download = `${fileName}.${format}`;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    }

    function waitForElement(selector) {
        return new Promise(resolve => {
            const interval = setInterval(() => {
                const element = document.querySelector(selector);
                if (element) { clearInterval(interval); resolve(element); }
            }, 100);
        });
    }

    function hexToRgba(hex, opacity) {
        let c;
        if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
            c = hex.substring(1).split('');
            if (c.length == 3) c = [c[0], c[0], c[1], c[1], c[2], c[2]];
            c = '0x' + c.join('');
            return `rgba(${[(c>>16)&255, (c>>8)&255, c&255].join(',')},${opacity})`;
        }
        throw new Error('Bad Hex');
    }

    // ===================================================================================
    // PART 5: 형광펜 기능 로직
    // ===================================================================================
    function handleTextSelection(event) {
        if (!isHighlighterMode) return;
        const selection = window.getSelection();
        if (!selection.rangeCount || selection.isCollapsed) return;

        const range = selection.getRangeAt(0);
        // 이미 하이라이트된 텍스트 내에서 또 하이라이트 하는 것을 방지
        if (range.startContainer.parentElement.classList.contains('custom-highlight') ||
            range.endContainer.parentElement.classList.contains('custom-highlight')) {
            selection.removeAllRanges();
            return;
        }

        const config = ConfigManager.getConfig();
        const highlightSpan = document.createElement('span');
        highlightSpan.className = 'custom-highlight';
        highlightSpan.style.backgroundColor = hexToRgba(config.highlighterColor, config.highlighterOpacity);

        try {
            range.surroundContents(highlightSpan);
        } catch (e) {
            console.warn("선택 영역을 감싸는 데 실패했습니다. 복잡한 노드 경계를 포함할 수 없습니다.", e);
        }
        selection.removeAllRanges();
    }

    function toggleHighlighterMode() {
        isHighlighterMode = !isHighlighterMode;
        const chatArea = document.querySelector('.css-18d9jqd, .css-alg45');
        const highlighterBtn = document.getElementById('highlighter-btn');

        document.body.classList.toggle('highlighter-active', isHighlighterMode);
        highlighterBtn.classList.toggle('active', isHighlighterMode);

        if (isHighlighterMode) {
            chatArea.addEventListener('mouseup', handleTextSelection);
            highlighterBtn.querySelector('span').textContent = '🖍️ 형광펜 (활성)';
        } else {
            chatArea.removeEventListener('mouseup', handleTextSelection);
            highlighterBtn.querySelector('span').textContent = '🖍️ 형광펜';
        }
    }

    // ===================================================================================
    // PART 6: 스크립트 실행
    // ===================================================================================
    const observer = new MutationObserver(() => {
        injectCheckboxes();
    });

    waitForElement('.css-18d9jqd, .css-alg45').then(chatArea => {
        observer.observe(chatArea, { childList: true, subtree: true });
        createFloatingUI();
        injectCheckboxes();
    });

})();
