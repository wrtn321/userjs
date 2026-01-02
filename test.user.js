// ==UserScript==
// @name         capture test
// @namespace    http://tampermonkey.net/
// @version      2.3
// @description  뤼튼 크랙의 채팅 로그를 선택하여 캡쳐하고, 원하는 문장에 형광펜을 적용합니다. (오버레이 엔진)
// @author       뤼붕이 (with Gemini)
// @match        https://crack.wrtn.ai/stories/*/episodes/*
// @grant        GM_addStyle
// @require      https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // ===================================================================================
    // PART 1: 설정 관리 (변경 없음)
    // ===================================================================================
    class ConfigManager {
        static getConfig() { const defaultConfig = { imageFormat: 'jpeg', fileName: '캡쳐_{date}', replaceWords: [], highlighterColor: '#FFD700', highlighterOpacity: 0.5 }; try { const storedConfig = JSON.parse(localStorage.getItem("crackCaptureConfigV4") || "{}"); if (!Array.isArray(storedConfig.replaceWords)) storedConfig.replaceWords = []; return { ...defaultConfig, ...storedConfig }; } catch (e) { return defaultConfig; } }
        static setConfig(config) { localStorage.setItem("crackCaptureConfigV4", JSON.stringify(config)); }
    }

    // ===================================================================================
    // PART 2: UI 생성 및 관리
    // ===================================================================================
    function injectCheckboxes() { /* 이전과 동일 */
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
            if (group.querySelector('.css-1ifxcjt, .css-1g2i6q3')) { group.prepend(container); group.style.display = 'flex'; }
            else { container.style.position = 'absolute'; container.style.right = '5px'; container.style.top = '10px'; group.style.position = 'relative'; group.appendChild(container); }
        });
    }

    async function createButtons() { /* 이전과 동일 */
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
            if (!document.getElementById('highlight-action-button')) {
                const highlightBtn = document.createElement('button');
                highlightBtn.id = 'highlight-action-button';
                highlightBtn.className = 'css-8xk5x8 eh9908w0';
                highlightBtn.style.cssText = "cursor: pointer; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;";
                highlightBtn.title = "선택한 텍스트에 형광펜 적용";
                highlightBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="var(--icon_tertiary)" viewBox="0 0 24 24" width="18" height="18"><path d="M16.2 2.8c.8 0 1.5.3 2.1.9s.9 1.3.9 2.1-.3 1.5-.9 2.1L10 16.2l-4.2-.1.1-4.3L14.1 3.5c.6-.6 1.3-.8 2.1-.7zM4 20h16v-2H4v2z"></path></svg>`;
                highlightBtn.onclick = applyHighlightOverlay;
                chatInputArea.prepend(highlightBtn);
            }
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

    function showSettingsModal() { /* 이전과 동일 */
        if (document.getElementById("capture-settings-modal")) return;
        let localConfig = ConfigManager.getConfig();
        const isDark = document.body.dataset.theme === 'dark';
        const c = { bg: isDark ? '#2c2c2e' : '#ffffff', text: isDark ? '#e0e0e0' : '#333333', border: isDark ? '#444444' : '#cccccc', inputBg: isDark ? '#3a3a3c' : '#f0f0f0', btn: isDark ? '#0a84ff' : '#007aff', delBtn: isDark ? '#ff453a' : '#ff3b30', btnTxt: '#ffffff' };
        const modalHTML = `<div id="capture-settings-modal" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:9999;display:flex;justify-content:center;align-items:center;"><div style="background:${c.bg};color:${c.text};padding:24px;border-radius:12px;width:90%;max-width:600px;display:flex;flex-direction:column;gap:20px;max-height: 90vh; overflow-y: auto;"><div style="display:flex;justify-content:space-between;align-items:center;"><h2 style="margin:0;font-size:1.4em;font-weight:600;">📸 캡쳐 설정</h2><button id="capture-modal-close" style="background:none;border:none;color:${c.text};font-size:1.5em;cursor:pointer;">&times;</button></div><div style="display:flex; gap: 10px; flex-wrap: wrap;"><div style="flex: 1 1 200px;"><label style="display:block; margin-bottom: 8px;">파일 이름:</label><input id="capture-filename" type="text" value="${localConfig.fileName}" style="width:100%;padding:10px;border:1px solid ${c.border};border-radius:6px;background:${c.inputBg};color:${c.text};box-sizing: border-box;"></div><div style="flex: 1 1 200px;"><label style="display:block; margin-bottom: 8px;">이미지 형식:</label><select id="capture-format" style="width:100%;padding:10px;border:1px solid ${c.border};border-radius:6px;background:${c.inputBg};color:${c.text};box-sizing: border-box;"><option value="jpeg" ${localConfig.imageFormat === 'jpeg' ? 'selected' : ''}>JPG</option><option value="png" ${localConfig.imageFormat === 'png' ? 'selected' : ''}>PNG</option><option value="webp" ${localConfig.imageFormat === 'webp' ? 'selected' : ''}>WEBP</option></select></div></div><div><label style="display:block; margin-bottom: 8px;">형광펜 설정:</label><div style="display:flex; gap: 10px; align-items: center; border: 1px solid ${c.border}; border-radius: 6px; padding: 10px;"><input id="highlight-color" type="color" value="${localConfig.highlighterColor}" style="min-width: 40px; height: 30px; border: none; background: transparent; padding: 0;"><input id="highlight-opacity" type="range" min="0" max="100" value="${localConfig.highlighterOpacity * 100}" style="flex: 1;"><span id="highlight-opacity-value" style="font-size: 0.9em; min-width: 40px; text-align: right;">${localConfig.highlighterOpacity * 100}%</span></div></div><div><label style="display:block; margin-bottom: 8px;">단어 변환 규칙:</label><div id="replace-list" style="max-height: 150px; overflow-y: auto; border: 1px solid ${c.border}; border-radius: 6px; padding: 10px; margin-bottom: 10px;"></div><div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;"><input id="find-word" type="text" placeholder="원본 단어" style="flex:1 1 120px; padding:10px; border:1px solid ${c.border}; border-radius:6px; background:${c.inputBg}; color:${c.text}; box-sizing: border-box;"><span style="font-size: 1.2em;">→</span><input id="replace-word" type="text" placeholder="변환할 단어" style="flex:1 1 120px; padding:10px; border:1px solid ${c.border}; border-radius:6px; background:${c.inputBg}; color:${c.text}; box-sizing: border-box;"><button id="add-replace-rule" style="padding:10px; background:${c.btn}; color:${c.btnTxt}; border:none; border-radius:6px; cursor:pointer; min-width: 40px;">+</button></div></div><div style="text-align: right; border-top: 1px solid ${c.border}; padding-top: 20px;"><button id="capture-modal-save" style="padding:10px 20px;background:${c.btn};color:${c.btnTxt};border:none;border-radius:8px;cursor:pointer;font-size:1em;">저장</button></div></div></div>`;
        document.body.insertAdjacentHTML("beforeend", modalHTML);
        document.getElementById('highlight-opacity').addEventListener('input', e => { document.getElementById('highlight-opacity-value').textContent = `${e.target.value}%`; });
        const renderReplaceList = () => { const listDiv = document.getElementById('replace-list'); listDiv.innerHTML = ''; if (localConfig.replaceWords.length === 0) { listDiv.innerHTML = `<span style="opacity: 0.6;">추가된 규칙이 없습니다.</span>`; } localConfig.replaceWords.forEach((rule, index) => { const item = document.createElement('div'); item.style.cssText = `display:flex; justify-content:space-between; align-items:center; padding: 5px; border-radius: 4px;`; item.innerHTML = `<span>${rule.find} → ${rule.replace}</span><button data-index="${index}" class="delete-rule" style="background:${c.delBtn}; color:${c.btnTxt}; border:none; border-radius:4px; cursor:pointer; width: 20px; height: 20px;">×</button>`; listDiv.appendChild(item); }); document.querySelectorAll('.delete-rule').forEach(btn => { btn.onclick = (e) => { localConfig.replaceWords.splice(parseInt(e.target.dataset.index), 1); renderReplaceList(); }; }); };
        document.getElementById('add-replace-rule').onclick = () => { const findInput = document.getElementById('find-word'); const replaceInput = document.getElementById('replace-word'); if (findInput.value.trim()) { localConfig.replaceWords.push({ find: findInput.value, replace: replaceInput.value }); findInput.value = ''; replaceInput.value = ''; renderReplaceList(); } };
        const closeModal = () => document.getElementById("capture-settings-modal")?.remove();
        document.getElementById('capture-modal-close').onclick = closeModal;
        document.getElementById('capture-modal-save').onclick = () => { localConfig.fileName = document.getElementById('capture-filename').value; localConfig.imageFormat = document.getElementById('capture-format').value; localConfig.highlighterColor = document.getElementById('highlight-color').value; localConfig.highlighterOpacity = parseInt(document.getElementById('highlight-opacity').value) / 100; ConfigManager.setConfig(localConfig); alert('설정이 저장되었습니다.'); closeModal(); };
        renderReplaceList();
    }


    // ===================================================================================
    // PART 3: 캡쳐 및 형광펜 로직 (오버레이 방식으로 완전히 재작성)
    // ===================================================================================

    // [추가됨] 형광펜 오버레이를 담을 컨테이너를 생성하고 관리하는 함수
    function getHighlightContainer() {
        let container = document.getElementById('_ccc-highlight-container');
        if (!container) {
            container = document.createElement('div');
            container.id = '_ccc-highlight-container';
            // 컨테이너 스타일: 화면 전체를 덮지만 상호작용은 막지 않음
            container.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 5; pointer-events: none;';
            const chatArea = document.querySelector('.css-18d9jqd, .css-alg45');
            if(chatArea) {
                chatArea.style.position = 'relative'; // 기준점 설정
                chatArea.appendChild(container);
            }
        }
        return container;
    }

    // [추가됨] 오버레이 방식으로 형광펜을 적용하는 함수
    function applyHighlightOverlay() {
        const selection = window.getSelection();
        if (!selection.rangeCount || selection.isCollapsed) return;

        const range = selection.getRangeAt(0);
        const rects = range.getClientRects(); // 선택된 텍스트의 모든 사각형 좌표를 가져옴
        const container = getHighlightContainer();
        const containerRect = container.parentElement.getBoundingClientRect(); // 기준 컨테이너의 좌표
        const scrollTop = container.parentElement.scrollTop; // 스크롤된 높이

        const config = ConfigManager.getConfig();
        const color = config.highlighterColor;
        const r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
        const rgbaColor = `rgba(${r}, ${g}, ${b}, ${config.highlighterOpacity})`;

        for (const rect of rects) {
            const mark = document.createElement('div');
            mark.className = '_ccc-highlighter-overlay';
            mark.style.cssText = `
                position: absolute;
                top: ${rect.top - containerRect.top + scrollTop}px;
                left: ${rect.left - containerRect.left}px;
                width: ${rect.width}px;
                height: ${rect.height}px;
                background-color: ${rgbaColor};
                pointer-events: auto; /* 형광펜 자체는 클릭 가능하도록 */
                cursor: pointer;
                z-index: 1;
            `;
            // 형광펜을 클릭(터치)하면 제거
            mark.addEventListener('click', () => mark.remove());
            mark.addEventListener('touchend', () => mark.remove());
            container.appendChild(mark);
        }
        selection.removeAllRanges();
    }


    async function handleCapture() {
        const allMessages = Array.from(document.querySelectorAll('div[data-message-group-id]'));
        const selectedMessages = allMessages.filter(msg => msg.querySelector('.capture-checkbox:checked'));
        if (selectedMessages.length === 0) { alert('캡쳐할 메시지를 하나 이상 선택해주세요.'); return; }
        const btn = document.getElementById('capture-action-button');
        const originalContent = btn.innerHTML;
        btn.innerHTML = '...';
        btn.disabled = true;

        // 캡쳐 전에 스크롤을 맨 위로 이동시켜 html2canvas의 좌표 오류 가능성을 줄임
        const chatContainer = document.querySelector('.css-18d9jqd, .css-alg45');
        const originalScrollTop = chatContainer ? chatContainer.scrollTop : 0;
        if (chatContainer) chatContainer.scrollTop = 0;

        // 잠시 대기하여 스크롤 이동이 렌더링에 반영되도록 함
        await new Promise(resolve => setTimeout(resolve, 100));

        try {
            const config = ConfigManager.getConfig();
            const captureArea = document.createElement('div');
            captureArea.style.padding = '20px';
            captureArea.style.boxSizing = 'border-box';
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

            // [수정됨] 화면에 보이는 형광펜 오버레이를 복제하여 캡쳐 영역에 추가
            const highlightContainer = document.getElementById('_ccc-highlight-container');
            if (highlightContainer) {
                const highlightClone = highlightContainer.cloneNode(true);
                highlightClone.style.position = 'absolute';
                highlightClone.style.top = '20px'; // captureArea의 padding 값
                highlightClone.style.left = '20px'; // captureArea의 padding 값
                highlightClone.style.pointerEvents = 'none';
                captureArea.style.position = 'relative'; // 복제된 형광펜의 기준점
                captureArea.appendChild(highlightClone);
            }

            if (config.replaceWords.length > 0) { findTextNodes(captureArea).forEach(node => { let text = node.nodeValue; config.replaceWords.forEach(rule => { text = text.replaceAll(rule.find, rule.replace); }); node.nodeValue = text; }); }

            document.body.appendChild(captureArea);
            captureArea.style.position = 'absolute';
            captureArea.style.left = '-9999px';
            captureArea.style.top = '0px';

            const canvas = await html2canvas(captureArea, {
                useCORS: true,
                backgroundColor: bgColor,
                logging: false,
                // 스크롤 관련 옵션 추가
                scrollX: 0,
                scrollY: -window.scrollY
            });

            document.body.removeChild(captureArea);
            downloadImage(canvas.toDataURL(`image/${config.imageFormat}`, 1.0), config.imageFormat);

            // [추가됨] 캡쳐 후 모든 형광펜 오버레이 제거
            if (highlightContainer) highlightContainer.innerHTML = '';

        } catch (error) { console.error('캡쳐 중 오류 발생:', error); alert('캡쳐에 실패했습니다. 콘솔을 확인해주세요.'); }
        finally {
            btn.innerHTML = originalContent;
            btn.disabled = false;
            // 캡쳐 후 원래 스크롤 위치로 복원
            if (chatContainer) chatContainer.scrollTop = originalScrollTop;
        }
    }

    function downloadImage(dataUrl, format) { /* 이전과 동일 */
        let fileName = ConfigManager.getConfig().fileName;
        const now = new Date();
        const year = now.getFullYear(), month = String(now.getMonth() + 1).padStart(2, '0'), day = String(now.getDate()).padStart(2, '0');
        const hour = String(now.getHours()).padStart(2, '0'), minute = String(now.getMinutes()).padStart(2, '0'), second = String(now.getSeconds()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`, timeStr = `${hour}-${minute}`;
        fileName = fileName.replace('{datetime}', `${dateStr}_${timeStr}`).replace('{date}', dateStr).replace('{time}', timeStr).replace('{year}', year).replace('{month}', month).replace('{day}', day).replace('{hour}', hour).replace('{minute}', minute).replace('{second}', second);
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `${fileName}.${format === 'jpeg' ? 'jpg' : format}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function findTextNodes(element) { /* 이전과 동일 */
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
    const observer = new MutationObserver(() => { if (!document.getElementById('capture-settings-button') || !document.getElementById('capture-action-button') || !document.getElementById('highlight-action-button')) { createButtons(); } injectCheckboxes(); getHighlightContainer(); /* 채팅창이 동적으로 변할 때 컨테이너가 유지되도록 */ });
    waitForElement('.css-18d9jqd, .css-alg45').then(chatArea => { getHighlightContainer(); observer.observe(chatArea, { childList: true, subtree: true }); createButtons(); injectCheckboxes(); });

})();
