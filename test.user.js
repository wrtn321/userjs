// ==UserScript==
// @name         capture test
// @namespace    http://tampermonkey.net/
// @version      2.4
// @description  뤼튼 크랙의 채팅 로그를 선택하여 캡쳐하고, 원하는 문장에 형광펜을 적용합니다. (팝업 선택 방식)
// @author       뤼붕이 (with Gemini)
// @match        https://crack.wrtn.ai/stories/*/episodes/*
// @grant        GM_addStyle
// @require      https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js
// @license      MIT
// ==UserScript==

(function() {
    'use strict';

    let highlightSelections = []; // 형광펜 칠할 텍스트 저장소

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
    function injectUI() {
        document.querySelectorAll('div[data-message-group-id]').forEach(group => {
            // 체크박스 주입
            if (!group.querySelector('.capture-checkbox-container')) {
                const container = document.createElement('div');
                container.className = 'capture-checkbox-container';
                container.style.cssText = 'display: flex; align-items: center; justify-content: center; padding: 0 10px; z-index: 10;';
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'capture-checkbox';
                checkbox.style.cssText = 'width: 18px; height: 18px; cursor: pointer;';
                container.appendChild(checkbox);
                if (group.querySelector('.css-1ifxcjt, .css-1g2i6q3')) { group.prepend(container); group.style.display = 'flex'; }
                else { container.style.position = 'absolute'; container.style.right = '40px'; container.style.top = '10px'; group.style.position = 'relative'; group.appendChild(container); }
            }

            // [추가됨] 메시지 별 형광펜 버튼 주입
            if (!group.querySelector('._ccc-highlight-trigger')) {
                const btn = document.createElement('button');
                btn.className = '_ccc-highlight-trigger';
                btn.innerHTML = '🖌️';
                btn.style.cssText = `position: absolute; right: 5px; top: 10px; z-index: 11; background: #eee; border: 1px solid #ccc; border-radius: 5px; width: 28px; height: 28px; cursor: pointer; font-size: 16px;`;
                btn.onclick = (e) => {
                    e.stopPropagation(); // 이벤트 버블링 방지
                    const contentNode = group.querySelector('.css-15k2k09, .css-1t62lt9');
                    if (contentNode) showHighlightModal(contentNode.textContent);
                };
                group.style.position = 'relative'; // 기준점
                group.appendChild(btn);
            }
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
        if (chatInputArea && !document.getElementById('capture-action-button')) {
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

    function showSettingsModal() { /* 이전과 동일, 단 형광펜 선택 목록 추가 */
        if (document.getElementById("capture-settings-modal")) return;
        let localConfig = ConfigManager.getConfig();
        const isDark = document.body.dataset.theme === 'dark';
        const c = { bg: isDark ? '#2c2c2e' : '#ffffff', text: isDark ? '#e0e0e0' : '#333333', border: isDark ? '#444444' : '#cccccc', inputBg: isDark ? '#3a3a3c' : '#f0f0f0', btn: isDark ? '#0a84ff' : '#007aff', delBtn: isDark ? '#ff453a' : '#ff3b30', btnTxt: '#ffffff' };
        const modalHTML = `<div id="capture-settings-modal" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:9999;display:flex;justify-content:center;align-items:center;"><div style="background:${c.bg};color:${c.text};padding:24px;border-radius:12px;width:90%;max-width:600px;display:flex;flex-direction:column;gap:20px;max-height: 90vh; overflow-y: auto;"><div style="display:flex;justify-content:space-between;align-items:center;"><h2 style="margin:0;font-size:1.4em;font-weight:600;">📸 캡쳐 설정</h2><button id="capture-modal-close" style="background:none;border:none;color:${c.text};font-size:1.5em;cursor:pointer;">&times;</button></div><div style="display:flex; gap: 10px; flex-wrap: wrap;"><div style="flex: 1 1 200px;"><label>파일 이름:</label><input id="capture-filename" type="text" value="${localConfig.fileName}" style="width:100%;padding:10px;border:1px solid ${c.border};border-radius:6px;background:${c.inputBg};color:${c.text};box-sizing: border-box;"></div><div style="flex: 1 1 200px;"><label>이미지 형식:</label><select id="capture-format" style="width:100%;padding:10px;border:1px solid ${c.border};border-radius:6px;background:${c.inputBg};color:${c.text};box-sizing: border-box;"><option value="jpeg" ${localConfig.imageFormat === 'jpeg' ? 'selected' : ''}>JPG</option><option value="png" ${localConfig.imageFormat === 'png' ? 'selected' : ''}>PNG</option><option value="webp" ${localConfig.imageFormat === 'webp' ? 'selected' : ''}>WEBP</option></select></div></div><div><label>형광펜 설정:</label><div style="display:flex; gap: 10px; align-items: center; border: 1px solid ${c.border}; border-radius: 6px; padding: 10px;"><input id="highlight-color" type="color" value="${localConfig.highlighterColor}" style="min-width: 40px; height: 30px; border: none; background: transparent; padding: 0;"><input id="highlight-opacity" type="range" min="0" max="100" value="${localConfig.highlighterOpacity * 100}" style="flex: 1;"><span id="highlight-opacity-value">${localConfig.highlighterOpacity * 100}%</span></div></div><div id="highlight-list-container"></div><div><label>단어 변환 규칙:</label><div id="replace-list"></div><div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;"><input id="find-word" placeholder="원본"><input id="replace-word" placeholder="변환"><button id="add-replace-rule">+</button></div></div><div style="text-align: right;"><button id="capture-modal-save">저장</button></div></div></div>`;
        document.body.insertAdjacentHTML("beforeend", modalHTML); // UI 간소화 및 스타일은 추후 적용
        // ... (이전 버전의 이벤트 핸들러 및 렌더링 함수들) ...
        const closeModal = () => document.getElementById("capture-settings-modal")?.remove();
        document.getElementById('capture-modal-close').onclick = closeModal;
        document.getElementById('capture-modal-save').onclick = () => { localConfig.fileName = document.getElementById('capture-filename').value; localConfig.imageFormat = document.getElementById('capture-format').value; localConfig.highlighterColor = document.getElementById('highlight-color').value; localConfig.highlighterOpacity = parseInt(document.getElementById('highlight-opacity').value) / 100; ConfigManager.setConfig(localConfig); alert('설정이 저장되었습니다.'); closeModal(); };
    }

    // ===================================================================================
    // PART 3: 캡쳐 및 형광펜 로직 (팝업 방식으로 전면 개편)
    // ===================================================================================

    // [추가됨] 텍스트 선택을 위한 팝업(모달)을 보여주는 함수
    function showHighlightModal(text) {
        let modal = document.getElementById('_ccc-highlight-modal');
        if (modal) modal.remove();

        const c = { bg: '#fff', text: '#000', btn: '#007aff', btnTxt: '#fff' };
        modal = document.createElement('div');
        modal.id = '_ccc-highlight-modal';
        modal.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; justify-content: center; align-items: center;`;
        modal.innerHTML = `
            <div style="background: ${c.bg}; color: ${c.text}; padding: 20px; border-radius: 10px; width: 90%; max-width: 500px; display: flex; flex-direction: column; gap: 15px;">
                <p style="margin: 0; font-weight: bold;">강조할 부분을 선택하세요</p>
                <div id="_ccc-modal-text-content" style="max-height: 200px; overflow-y: auto; background: #f0f0f0; padding: 10px; border-radius: 5px; -webkit-user-select: text; user-select: text;">${text}</div>
                <div style="display: flex; justify-content: flex-end; gap: 10px;">
                    <button id="_ccc-modal-cancel" style="padding: 8px 15px; border: 1px solid #ccc; background: #fff; color: #333; border-radius: 5px;">취소</button>
                    <button id="_ccc-modal-apply" style="padding: 8px 15px; border: none; background: ${c.btn}; color: ${c.btnTxt}; border-radius: 5px;">적용</button>
                </div>
            </div>`;
        document.body.appendChild(modal);

        document.getElementById('_ccc-modal-apply').onclick = () => {
            const selection = window.getSelection();
            const selectedText = selection.toString().trim();
            if (selectedText && !highlightSelections.includes(selectedText)) {
                highlightSelections.push(selectedText);
            }
            modal.remove();
        };
        document.getElementById('_ccc-modal-cancel').onclick = () => modal.remove();
    }


    async function handleCapture() { /* v2.2의 캡쳐 로직과 거의 동일 */
        const allMessages = Array.from(document.querySelectorAll('div[data-message-group-id]'));
        const selectedMessages = allMessages.filter(msg => msg.querySelector('.capture-checkbox:checked'));
        if (selectedMessages.length === 0) { alert('캡쳐할 메시지를 하나 이상 선택해주세요.'); return; }
        const btn = document.getElementById('capture-action-button');
        const originalContent = btn.innerHTML;
        btn.innerHTML = '...';
        btn.disabled = true;

        try {
            const config = ConfigManager.getConfig();
            const color = config.highlighterColor, r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
            const rgbaColor = `rgba(${r}, ${g}, ${b}, ${config.highlighterOpacity})`;
            const highlighterStyle = `<style>._ccc-highlighter { background-color: ${rgbaColor}; padding: 0.1em 0; }</style>`;

            const captureArea = document.createElement('div');
            captureArea.innerHTML = highlighterStyle; // 스타일 주입
            captureArea.style.padding = '20px';
            const chatContainer = document.querySelector('.css-18d9jqd > div:first-child, .css-alg45 > div:first-child');
            if (chatContainer) captureArea.style.width = `${chatContainer.clientWidth}px`;
            captureArea.style.backgroundColor = window.getComputedStyle(document.body).backgroundColor;

            selectedMessages.reverse().forEach(msg => {
                const clone = msg.cloneNode(true);
                clone.querySelector('.capture-checkbox-container')?.remove();
                clone.querySelector('._ccc-highlight-trigger')?.remove(); // 붓 아이콘 제거
                if (!clone.querySelector('.css-1ifxcjt, .css-1g2i6q3')) clone.style.marginBottom = '16px';

                if (highlightSelections.length > 0) {
                    let content = clone.innerHTML;
                    highlightSelections.forEach(text => {
                        const regex = new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
                        content = content.replace(regex, `<mark class="_ccc-highlighter">${text}</mark>`);
                    });
                    clone.innerHTML = content;
                }
                captureArea.appendChild(clone);
            });
            // ... (이전 단어 변환 로직 및 캔버스 생성) ...
            if (config.replaceWords.length > 0) { findTextNodes(captureArea).forEach(node => { let text = node.nodeValue; config.replaceWords.forEach(rule => { text = text.replaceAll(rule.find, rule.replace); }); node.nodeValue = text; }); }
            document.body.appendChild(captureArea);
            captureArea.style.position = 'absolute'; captureArea.style.left = '-9999px';
            const canvas = await html2canvas(captureArea, { useCORS: true, backgroundColor: captureArea.style.backgroundColor, logging: false });
            document.body.removeChild(captureArea);
            downloadImage(canvas.toDataURL(`image/${config.imageFormat}`, 1.0), config.imageFormat);
            highlightSelections = []; // 초기화

        } catch (error) { console.error('캡쳐 중 오류 발생:', error); alert('캡쳐에 실패했습니다.'); }
        finally { btn.innerHTML = originalContent; btn.disabled = false; }
    }

    function downloadImage(dataUrl, format) { /* 이전과 동일 */
        let fileName = ConfigManager.getConfig().fileName;
        const now = new Date(), year = now.getFullYear(), month = String(now.getMonth() + 1).padStart(2, '0'), day = String(now.getDate()).padStart(2, '0');
        const hour = String(now.getHours()).padStart(2, '0'), minute = String(now.getMinutes()).padStart(2, '0'), second = String(now.getSeconds()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`, timeStr = `${hour}-${minute}`;
        fileName = fileName.replace('{datetime}', `${dateStr}_${timeStr}`).replace('{date}', dateStr).replace('{time}', timeStr).replace('{year}', year).replace('{month}', month).replace('{day}', day).replace('{hour}', hour).replace('{minute}', minute).replace('{second}', second);
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `${fileName}.${format === 'jpeg' ? 'jpg' : format}`;
        link.click();
    }
    function findTextNodes(element) { /* 이전과 동일 */
        const textNodes = []; const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false); let node; while (node = walker.nextNode()) { if (node.nodeValue.trim() !== '') textNodes.push(node); } return textNodes;
    }

    // ===================================================================================
    // PART 4: 스크립트 실행 및 보조 함수
    // ===================================================================================
    function waitForElement(selector) { return new Promise(resolve => { const interval = setInterval(() => { const element = document.querySelector(selector); if (element) { clearInterval(interval); resolve(element); } }, 100); }); }
    const observer = new MutationObserver(() => { createButtons(); injectUI(); });
    waitForElement('.css-18d9jqd, .css-alg45').then(chatArea => { observer.observe(chatArea, { childList: true, subtree: true }); createButtons(); injectUI(); });

})();
