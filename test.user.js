// ==UserScript==
// @name         test
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  뤼튼 크랙의 채팅 로그를 선택하여 캡쳐 (형광펜 기능 추가)
// @author       뤼붕이
// @match        https://crack.wrtn.ai/stories/*/episodes/*
// @grant        GM_addStyle
// @require      https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // [추가됨] 형광펜 스타일 정의 (다크/라이트 모드 대응)
    GM_addStyle(`
        mark.custom-highlight {
            background-color: #fcf474 !important;
            color: #000 !important;
        }
        [data-theme='dark'] mark.custom-highlight {
            background-color: #ffd43b !important;
            color: #333 !important;
        }
    `);

    // ===================================================================================
    // PART 1: 설정 관리
    // ===================================================================================
    class ConfigManager {
        static getConfig() {
            const defaultConfig = { imageFormat: 'png', fileName: '캡쳐_{date}', replaceWords: [] };
            try {
                const storedConfig = JSON.parse(localStorage.getItem("crackCaptureConfigV3") || "{}");
                if (!Array.isArray(storedConfig.replaceWords)) storedConfig.replaceWords = [];
                return { ...defaultConfig, ...storedConfig };
            } catch (e) { return defaultConfig; }
        }
        static setConfig(config) { localStorage.setItem("crackCaptureConfigV3", JSON.stringify(config)); }
    }

    // ===================================================================================
    // PART 2: UI 생성 및 관리
    // ===================================================================================
    function injectCheckboxes() {
        document.querySelectorAll('div[data-message-group-id]').forEach(group => {
            if (group.querySelector('.capture-checkbox-container')) return;
            const container = document.createElement('div');
            container.className = 'capture-checkbox-container';
            container.style.cssText = 'display: flex; align-items: center; justify-content: center; z-index: 10;'; // cursor: pointer 제거
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'capture-checkbox';
            checkbox.style.cssText = 'width: 18px; height: 18px; cursor: pointer;';
            container.appendChild(checkbox);

            if (group.querySelector('.css-1ifxcjt, .css-1g2i6q3')) { // 채팅형
                 group.prepend(container);
                 group.style.display = 'flex';
            } else { // 소설형
                container.style.position = 'absolute';
                container.style.right = '0px';
                container.style.top = '0px';
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
        if (chatInputArea && !document.getElementById('capture-action-button')) {
            // [수정됨] 버튼들을 감싸는 컨테이너 추가
            const buttonWrapper = document.createElement('div');
            buttonWrapper.style.cssText = "display: flex; flex-direction: column; gap: 4px; align-items: center;";

            // 캡쳐 버튼
            const captureBtn = document.createElement('button');
            captureBtn.id = 'capture-action-button';
            captureBtn.className = 'css-8xk5x8 eh9908w0';
            captureBtn.style.cssText = "cursor: pointer; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;";
            captureBtn.title = "선택한 대화 캡쳐";
            captureBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="var(--icon_tertiary)" viewBox="0 0 24 24" width="18" height="18"><path d="M9.4 11.3h5.2v-1.6H9.4zM22 6.3v13.4c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6.3c0-1.1.9-2 2-2h3l2-2h6l2 2h3c1.1 0 2 .9 2 2zM12 18.3c2.8 0 5-2.2 5-5s-2.2-5-5-5-5 2.2-5 5 2.2 5 5 5zm0-8.4c1.9 0 3.4 1.5 3.4 3.4s-1.5 3.4-3.4 3.4S8.6 15 8.6 13s1.5-3.1 3.4-3.1z"></path></svg>`;
            captureBtn.onclick = handleCapture;

            // [추가됨] 형광펜 버튼
            const highlightBtn = document.createElement('button');
            highlightBtn.id = 'highlight-action-button';
            highlightBtn.className = 'css-8xk5x8 eh9908w0';
            highlightBtn.style.cssText = "cursor: pointer; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;";
            highlightBtn.title = "선택한 텍스트에 형광펜 적용";
            highlightBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="var(--icon_tertiary)" viewBox="0 0 24 24" width="18" height="18"><path d="M19.045 7.401c.378-.378.586-.88.586-1.414s-.208-1.036-.586-1.414l-1.586-1.586c-.756-.756-2.075-.752-2.825-.003L6.024 11.194l-3.6 6.36c-.24.42-.26.92-.05 1.36.21.44.6.73 1.08.79l6.36-3.6 8.186-8.199zm-1.414-1.414L19.217 4.4l-1.586 1.586-1.586-1.586L16.217 4.4l1.414 1.414zM11 13.414l-6.36 3.6.86-1.52 1.52-.86 3.6-6.36 1.586 1.586-1.206 1.206z"></path></svg>`;
            highlightBtn.onclick = applyHighlight;

            // [추가됨] 형광펜 제거 버튼
            const clearHighlightBtn = document.createElement('button');
            clearHighlightBtn.id = 'clear-highlight-button';
            clearHighlightBtn.className = 'css-8xk5x8 eh9908w0';
            clearHighlightBtn.style.cssText = "cursor: pointer; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;";
            clearHighlightBtn.title = "모든 형광펜 제거";
            clearHighlightBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="var(--icon_tertiary)" viewBox="0 0 24 24" width="18" height="18"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.3 14.3c.39.39.39 1.02 0 1.41-.39.39-1.02.39-1.41 0L12 13.41l-2.89 2.89c-.39.39-1.02.39-1.41 0-.39-.39-.39-1.02 0-1.41L10.59 12 7.7 9.11c-.39-.39-.39-1.02 0-1.41.39-.39 1.02-.39 1.41 0L12 10.59l2.89-2.89c.39-.39 1.02-.39 1.41 0 .39.39.39 1.02 0 1.41L13.41 12l2.89 2.3z"></path></svg>`;
            clearHighlightBtn.onclick = clearAllHighlights;

            buttonWrapper.appendChild(highlightBtn);
            buttonWrapper.appendChild(clearHighlightBtn);
            buttonWrapper.appendChild(captureBtn);

            chatInputArea.prepend(buttonWrapper);
        }
    }

    function showSettingsModal() {
        if (document.getElementById("capture-settings-modal")) return;
        let localConfig = ConfigManager.getConfig();
        const isDark = document.body.dataset.theme === 'dark';
        const c = { bg: isDark ? '#2c2c2e' : '#ffffff', text: isDark ? '#e0e0e0' : '#333333', border: isDark ? '#444444' : '#cccccc', inputBg: isDark ? '#3a3a3c' : '#f0f0f0', btn: isDark ? '#0a84ff' : '#007aff', delBtn: isDark ? '#ff453a' : '#ff3b30', btnTxt: '#ffffff' };
        const modalHTML = `<div id="capture-settings-modal" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:9999;display:flex;justify-content:center;align-items:center;"><div style="background:${c.bg};color:${c.text};padding:24px;border-radius:12px;width:90%;max-width:600px;display:flex;flex-direction:column;gap:20px;max-height: 90vh;"><div style="display:flex;justify-content:space-between;align-items:center;"><h2 style="margin:0;font-size:1.4em;font-weight:600;">📸 캡쳐 설정</h2><button id="capture-modal-close" style="background:none;border:none;color:${c.text};font-size:1.5em;cursor:pointer;">&times;</button></div><div style="display:flex; gap: 10px; flex-wrap: wrap;"><div style="flex: 1 1 200px;"><label style="display:block; margin-bottom: 8px;">파일 이름:</label><input id="capture-filename" type="text" value="${localConfig.fileName}" style="width:100%;padding:10px;border:1px solid ${c.border};border-radius:6px;background:${c.inputBg};color:${c.text};box-sizing: border-box;"></div><div style="flex: 1 1 200px;"><label style="display:block; margin-bottom: 8px;">이미지 형식:</label><select id="capture-format" style="width:100%;padding:10px;border:1px solid ${c.border};border-radius:6px;background:${c.inputBg};color:${c.text};box-sizing: border-box;"><option value="png" ${localConfig.imageFormat === 'png' ? 'selected' : ''}>PNG</option><option value="jpeg" ${localConfig.imageFormat === 'jpeg' ? 'selected' : ''}>JPG</option><option value="webp" ${localConfig.imageFormat === 'webp' ? 'selected' : ''}>WEBP</option></select></div></div><div><label style="display:block; margin-bottom: 8px;">단어 변환 규칙:</label><div id="replace-list" style="max-height: 150px; overflow-y: auto; border: 1px solid ${c.border}; border-radius: 6px; padding: 10px; margin-bottom: 10px;"></div><div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;"><input id="find-word" type="text" placeholder="원본 단어" style="flex:1 1 120px; padding:10px; border:1px solid ${c.border}; border-radius:6px; background:${c.inputBg}; color:${c.text}; box-sizing: border-box;"><span style="font-size: 1.2em;">→</span><input id="replace-word" type="text" placeholder="변환할 단어" style="flex:1 1 120px; padding:10px; border:1px solid ${c.border}; border-radius:6px; background:${c.inputBg}; color:${c.text}; box-sizing: border-box;"><button id="add-replace-rule" style="padding:10px; background:${c.btn}; color:${c.btnTxt}; border:none; border-radius:6px; cursor:pointer; min-width: 40px;">+</button></div></div><div style="text-align: right; border-top: 1px solid ${c.border}; padding-top: 20px;"><button id="capture-modal-save" style="padding:10px 20px;background:${c.btn};color:${c.btnTxt};border:none;border-radius:8px;cursor:pointer;font-size:1em;">저장</button></div></div></div>`;
        document.body.insertAdjacentHTML("beforeend", modalHTML);
        const renderReplaceList = () => { const listDiv = document.getElementById('replace-list'); listDiv.innerHTML = ''; if (localConfig.replaceWords.length === 0) { listDiv.innerHTML = `<span style="opacity: 0.6;">추가된 규칙이 없습니다.</span>`; } localConfig.replaceWords.forEach((rule, index) => { const item = document.createElement('div'); item.style.cssText = `display:flex; justify-content:space-between; align-items:center; padding: 5px; border-radius: 4px;`; item.innerHTML = `<span>${rule.find} → ${rule.replace}</span><button data-index="${index}" class="delete-rule" style="background:${c.delBtn}; color:${c.btnTxt}; border:none; border-radius:4px; cursor:pointer; width: 20px; height: 20px;">×</button>`; listDiv.appendChild(item); }); document.querySelectorAll('.delete-rule').forEach(btn => { btn.onclick = (e) => { localConfig.replaceWords.splice(parseInt(e.target.dataset.index), 1); renderReplaceList(); }; }); };
        document.getElementById('add-replace-rule').onclick = () => { const findInput = document.getElementById('find-word'); const replaceInput = document.getElementById('replace-word'); if (findInput.value.trim()) { localConfig.replaceWords.push({ find: findInput.value, replace: replaceInput.value }); findInput.value = ''; replaceInput.value = ''; renderReplaceList(); } };
        const closeModal = () => document.getElementById("capture-settings-modal")?.remove();
        document.getElementById('capture-modal-close').onclick = closeModal;
        document.getElementById('capture-modal-save').onclick = () => { localConfig.fileName = document.getElementById('capture-filename').value; localConfig.imageFormat = document.getElementById('capture-format').value; ConfigManager.setConfig(localConfig); alert('설정이 저장되었습니다.'); closeModal(); };
        renderReplaceList();
    }

    // ===================================================================================
    // PART 3: 캡쳐 및 형광펜 로직
    // ===================================================================================

    // [추가됨] 형광펜 적용 함수
    function applyHighlight() {
        const selection = window.getSelection();
        if (!selection.rangeCount || selection.isCollapsed) return; // 선택된 텍스트가 없으면 중단

        const range = selection.getRangeAt(0);
        const highlighter = document.createElement('mark');
        highlighter.className = 'custom-highlight';

        try {
            // 선택된 내용을 mark 태그로 감쌈
            range.surroundContents(highlighter);
        } catch(e) {
            console.error("형광펜 적용 오류:", e);
            alert("태그 경계를 넘어서는 복잡한 선택은 형광펜으로 만들 수 없습니다. 문단 안에서 다시 시도해주세요.");
        } finally {
            selection.removeAllRanges(); // 처리 후 선택 해제
        }
    }

    // [추가됨] 형광펜 모두 제거 함수
    function clearAllHighlights() {
        document.querySelectorAll('mark.custom-highlight').forEach(mark => {
            const parent = mark.parentNode;
            while (mark.firstChild) {
                parent.insertBefore(mark.firstChild, mark);
            }
            parent.removeChild(mark);
            parent.normalize(); // 분리된 텍스트 노드를 병합하여 깔끔하게 만듬
        });
    }

    async function handleCapture() {
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
                    clone.style.marginBottom = '20px';
                }
                captureArea.appendChild(clone);
            });

            // [추가됨] 코드 블록 스타일 강제 재설정
            captureArea.querySelectorAll('pre, code').forEach(el => {
                el.style.color = 'inherit';
                el.style.backgroundColor = 'rgba(0,0,0,0.1)';
                el.style.whiteSpace = 'pre-wrap';
                el.style.wordBreak = 'break-all';
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
        const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
        fileName = fileName.replace('{datetime}', `${dateStr}_${timeStr}`).replace('{date}', dateStr).replace('{time}', timeStr);
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `${fileName}.${format}`;
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
    const observer = new MutationObserver(() => { if (!document.getElementById('capture-settings-button') || !document.getElementById('capture-action-button')) { createButtons(); } injectCheckboxes(); });
    waitForElement('.css-18d9jqd, .css-alg45').then(chatArea => { observer.observe(chatArea, { childList: true, subtree: true }); createButtons(); injectCheckboxes(); });

})();
