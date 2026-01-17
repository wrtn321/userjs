// ==UserScript==
// @name         test
// @namespace    http://tampermonkey.net/
// @version      2.42
// @description  뤼튼 크랙의 채팅 로그를 선택하여 캡쳐 / 마크다운-8px
// @author       뤼붕이 (코드 블록 조정 by Gemini)
// @match        https://crack.wrtn.ai/stories/*/episodes/*
// @downloadURL  https://github.com/wrtn321/userjs/raw/refs/heads/main/test.user.js
// @updateURL    https://github.com/wrtn321/userjs/raw/refs/heads/main/test.user.js
// @grant        GM_addStyle
// @require      https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // ===================================================================================
    // PART 1: 설정 관리 (분할 캡쳐 설정 추가)
    // ===================================================================================
    class ConfigManager {
        static getConfig() {
            const defaultConfig = { imageFormat: 'jpeg', fileName: '캡쳐_{date}', hiddenKeywords: [], highQualityCapture: false, splitCapture: false }; // splitCapture 기본값 추가
            try {
                const storedConfig = JSON.parse(localStorage.getItem("crackCaptureConfigV5") || "{}");
                if (!Array.isArray(storedConfig.hiddenKeywords)) storedConfig.hiddenKeywords = [];
                return { ...defaultConfig, ...storedConfig };
            } catch (e) { return defaultConfig; }
        }
        static setConfig(config) { localStorage.setItem("crackCaptureConfigV5", JSON.stringify(config)); }
    }


    // ===================================================================================
    // PART 2: UI 생성 및 관리 (분할 캡쳐 체크박스 추가)
    // ===================================================================================

    function injectCheckboxes() {
        document.querySelectorAll('div[data-message-group-id]').forEach(group => {
            if (group.querySelector('.capture-checkbox-container')) return;

            const container = document.createElement('div');
            container.className = 'capture-checkbox-container';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'capture-checkbox';
            checkbox.style.cssText = 'width: 18px; height: 18px; cursor: pointer;';
            container.appendChild(checkbox);

            container.style.position = 'absolute';
            container.style.right = '8px';
            container.style.top = '8px';
            container.style.zIndex = '10';

            group.style.position = 'relative';
            group.prepend(container);
        });
    }


    async function createButtons() {
        const menuContainer = await waitForElement('.py-4.overflow-y-auto.scrollbar > div.px-2:first-of-type');
        if (menuContainer && !document.getElementById('capture-settings-button')) {
            const settingsBtn = document.createElement('div');
            settingsBtn.id = 'capture-settings-button';
            settingsBtn.className = 'px-2.5 h-4 box-content py-[18px]';
            settingsBtn.innerHTML = `<button class="w-full flex h-4 items-center justify-between typo-110-16-med space-x-2 [&amp;_svg]:fill-icon_tertiary ring-offset-4 ring-offset-sidebar" style="cursor: pointer;"><span class="flex space-x-2 items-center"><span style="font-size: 16px;">📸</span><span class="whitespace-nowrap overflow-hidden text-ellipsis typo-text-sm_leading-none_medium">캡쳐 설정</span></span></button>`;
            settingsBtn.onclick = showSettingsModal;
            menuContainer.appendChild(settingsBtn);
        }

        const chatInputArea = await waitForElement('.flex.items-center.space-x-2');
        if (chatInputArea && !document.getElementById('capture-action-button')) {
            const captureBtn = document.createElement('button');
            captureBtn.id = 'capture-action-button';
            captureBtn.className = 'relative inline-flex items-center gap-1 rounded-full text-sm font-medium leading-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:fill-current min-w-7 border border-border bg-card text-gray-1 hover:bg-secondary p-0 size-7 justify-center';
            captureBtn.title = "선택한 대화 캡쳐";
            captureBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="var(--icon_tertiary)" viewBox="0 0 24 24" width="18" height="18"><path d="M9.4 11.3h5.2v-1.6H9.4zM22 6.3v13.4c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6.3c0-1.1.9-2 2-2h3l2-2h6l2 2h3c1.1 0 2 .9 2 2zM12 18.3c2.8 0 5-2.2 5-5s-2.2-5-5-5-5 2.2-5 5 2.2 5 5 5zm0-8.4c1.9 0 3.4 1.5 3.4 3.4s-1.5 3.4-3.4 3.4S8.6 15 8.6 13s1.5-3.1 3.4-3.1z"></path></svg>`;
            captureBtn.onclick = handleCapture;
            chatInputArea.prepend(captureBtn);
        }
    }

    function showSettingsModal() {
        if (document.getElementById("capture-settings-modal")) return;
        let localConfig = ConfigManager.getConfig();
        const isDark = document.body.dataset.theme === 'dark';
        const c = { bg: isDark ? '#2c2c2e' : '#ffffff', text: isDark ? '#e0e0e0' : '#333333', border: isDark ? '#444444' : '#cccccc', inputBg: isDark ? '#3a3a3c' : '#f0f0f0', btn: isDark ? '#0a84ff' : '#007aff', delBtn: isDark ? '#ff453a' : '#ff3b30', btnTxt: '#ffffff' };
        // ========================= ★★★ 분할 캡쳐 UI 추가 ★★★ =========================
        const modalHTML = `<div id="capture-settings-modal" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:9999;display:flex;justify-content:center;align-items:center;"><div style="background:${c.bg};color:${c.text};padding:24px;border-radius:12px;width:90%;max-width:600px;display:flex;flex-direction:column;gap:20px;max-height: 90vh;"><div style="display:flex;justify-content:space-between;align-items:center;"><h2 style="margin:0;font-size:1.4em;font-weight:600;">📸 캡쳐 설정</h2><button id="capture-modal-close" style="background:none;border:none;color:${c.text};font-size:1.5em;cursor:pointer;">&times;</button></div><div style="display:flex; gap: 10px; flex-wrap: wrap;"><div style="flex: 1 1 200px;"><label style="display:block; margin-bottom: 8px;">파일 이름:</label><input id="capture-filename" type="text" value="${localConfig.fileName}" style="width:100%;padding:10px;border:1px solid ${c.border};border-radius:6px;background:${c.inputBg};color:${c.text};box-sizing: border-box;"></div><div style="flex: 1 1 200px;"><label style="display:block; margin-bottom: 8px;">이미지 형식:</label><select id="capture-format" style="width:100%;padding:10px;border:1px solid ${c.border};border-radius:6px;background:${c.inputBg};color:${c.text};box-sizing: border-box;"><option value="jpeg" ${localConfig.imageFormat === 'jpeg' ? 'selected' : ''}>JPG</option><option value="png" ${localConfig.imageFormat === 'png' ? 'selected' : ''}>PNG</option><option value="webp" ${localConfig.imageFormat === 'webp' ? 'selected' : ''}>WEBP</option></select></div></div><div style="display: flex; gap: 20px; align-items: center; padding-bottom: 10px; border-bottom: 1px solid ${c.border};"><div style="display: flex; align-items: center;"><input type="checkbox" id="capture-high-quality" style="width: 16px; height: 16px; margin-right: 8px;"><label for="capture-high-quality" style="cursor: pointer; user-select: none;">고화질(용량증가)</label></div><div style="display: flex; align-items: center;"><input type="checkbox" id="capture-split-mode" style="width: 16px; height: 16px; margin-right: 8px;"><label for="capture-split-mode" style="cursor: pointer; user-select: none;">분할 캡쳐</label></div></div><div><label style="display:block; margin-bottom: 8px;">단어 숨김 규칙:</label><div id="hidden-keyword-list" style="max-height: 150px; overflow-y: auto; border: 1px solid ${c.border}; border-radius: 6px; padding: 10px; margin-bottom: 10px;"></div><div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;"><input id="hidden-keyword-input" type="text" placeholder="숨길 키워드 등록" style="flex:1; padding:10px; border:1px solid ${c.border}; border-radius:6px; background:${c.inputBg}; color:${c.text}; box-sizing: border-box;"><button id="add-hidden-keyword" style="padding:10px; background:${c.btn}; color:${c.btnTxt}; border:none; border-radius:6px; cursor:pointer; min-width: 40px;">+</button></div></div><div style="text-align: right; border-top: 1px solid ${c.border}; padding-top: 20px;"><button id="capture-modal-save" style="padding:10px 20px;background:${c.btn};color:${c.btnTxt};border:none;border-radius:8px;cursor:pointer;font-size:1em;">저장</button></div></div></div>`;
        document.body.insertAdjacentHTML("beforeend", modalHTML);
        document.getElementById('capture-high-quality').checked = !!localConfig.highQualityCapture;
        document.getElementById('capture-split-mode').checked = !!localConfig.splitCapture; // 분할 캡쳐 체크박스 상태 로드
        // ==============================================================================

        const renderHiddenKeywordList = () => { const listDiv = document.getElementById('hidden-keyword-list'); listDiv.innerHTML = ''; if (localConfig.hiddenKeywords.length === 0) { listDiv.innerHTML = `<span style="opacity: 0.6;">등록된 키워드가 없습니다.</span>`; } localConfig.hiddenKeywords.forEach((keyword, index) => { const item = document.createElement('div'); item.style.cssText = `display:flex; justify-content:space-between; align-items:center; padding: 5px; border-radius: 4px;`; item.innerHTML = `<span>${keyword}</span><button data-index="${index}" class="delete-keyword" style="background:${c.delBtn}; color:${c.btnTxt}; border:none; border-radius:4px; cursor:pointer; width: 20px; height: 20px;">×</button>`; listDiv.appendChild(item); }); document.querySelectorAll('.delete-keyword').forEach(btn => { btn.onclick = (e) => { localConfig.hiddenKeywords.splice(parseInt(e.target.dataset.index), 1); renderHiddenKeywordList(); }; }); };
        document.getElementById('add-hidden-keyword').onclick = () => { const keywordInput = document.getElementById('hidden-keyword-input'); if (keywordInput.value.trim()) { localConfig.hiddenKeywords.push(keywordInput.value.trim()); keywordInput.value = ''; renderHiddenKeywordList(); } };
        const closeModal = () => document.getElementById("capture-settings-modal")?.remove();
        document.getElementById('capture-modal-close').onclick = closeModal;
        document.getElementById('capture-modal-save').onclick = () => {
            localConfig.fileName = document.getElementById('capture-filename').value;
            localConfig.imageFormat = document.getElementById('capture-format').value;
            localConfig.highQualityCapture = document.getElementById('capture-high-quality').checked;
            localConfig.splitCapture = document.getElementById('capture-split-mode').checked; // 분할 캡쳐 설정 저장
            ConfigManager.setConfig(localConfig);
            alert('설정이 저장되었습니다.');
            closeModal();
        };
        renderHiddenKeywordList();
    }


    // ===================================================================================
    // PART 3: 캡쳐 로직 (★★★ 분할 캡쳐 로직 추가 ★★★)
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
            if (regex.test(node.nodeValue)) {
                const parent = node.parentNode;
                const fragment = document.createDocumentFragment();
                let lastIndex = 0;
                node.nodeValue.replace(regex, (match, offset) => {
                    fragment.appendChild(document.createTextNode(node.nodeValue.slice(lastIndex, offset)));
                    const span = document.createElement('span');
                    span.style.color = 'transparent';
                    span.textContent = match;
                    fragment.appendChild(span);
                    lastIndex = offset + match.length;
                });
                fragment.appendChild(document.createTextNode(node.nodeValue.slice(lastIndex)));
                parent.replaceChild(fragment, node);
            }
        });
    }

// '캡쳐 실행' 버튼을 눌렀을 때 실행되는 메인 캡쳐 함수
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
            const bgColor = window.getComputedStyle(document.body).backgroundColor;
            const PADDING_VALUE = 20; // 좌우 및 위쪽 여백 값

            const canvasOptions = {
                useCORS: true,
                backgroundColor: bgColor,
                logging: false,
                scrollY: -window.scrollY,
                windowHeight: window.innerHeight,
                scale: config.highQualityCapture ? 2 : 1
            };

            // ========================= ★★★ 분할 캡쳐 모드 로직 ★★★ =========================
            if (config.splitCapture) {
                // 분할 캡쳐 모드 ON: 메시지를 하나씩 캡쳐
                for (const [index, msg] of selectedMessages.entries()) {
                    const captureArea = document.createElement('div');

                    const messageContentArea = document.querySelector('div[data-message-group-id]');
                    if (messageContentArea) {
                        captureArea.style.width = `${messageContentArea.clientWidth + (PADDING_VALUE * 2)}px`;
                    } else {
                        const chatContainer = document.querySelector('div.stick-to-bottom');
                        if (chatContainer) {
                           captureArea.style.width = `${chatContainer.clientWidth + (PADDING_VALUE * 2)}px`;
                        }
                    }

                    // [변경됨] padding 값을 '위 20px, 좌우 20px, 아래 0px'으로 수정합니다.
                    captureArea.style.padding = `${PADDING_VALUE}px ${PADDING_VALUE}px 0px ${PADDING_VALUE}px`;
                    captureArea.style.boxSizing = 'border-box';
                    captureArea.style.backgroundColor = bgColor;

                    const clone = processMessageClone(msg);
                    captureArea.appendChild(clone);

                    if (config.hiddenKeywords && config.hiddenKeywords.length > 0) {
                        hideKeywordsInElement(captureArea, config.hiddenKeywords);
                    }

                    document.body.appendChild(captureArea);
                    captureArea.style.position = 'absolute';
                    captureArea.style.left = '-9999px';
                    captureArea.style.top = '0px';

                    const canvas = await html2canvas(captureArea, canvasOptions);
                    const suffix = `_${String(index + 1).padStart(2, '0')}`;
                    downloadImage(canvas.toDataURL(`image/${config.imageFormat}`, 1.0), config.imageFormat, suffix);
                    document.body.removeChild(captureArea);
                }

            } else {
                // 분할 캡쳐 모드 OFF: 기존 방식대로 모든 메시지를 합쳐서 캡쳐
                const captureArea = document.createElement('div');
                const messageContentArea = document.querySelector('div[data-message-group-id]');
                if (messageContentArea) {
                    captureArea.style.width = `${messageContentArea.clientWidth + (PADDING_VALUE * 2)}px`;
                } else {
                    const chatContainer = document.querySelector('div.stick-to-bottom');
                    if (chatContainer) {
                        captureArea.style.width = `${chatContainer.clientWidth + (PADDING_VALUE * 2)}px`;
                    }
                }

                // [변경됨] padding 값을 '위 20px, 좌우 20px, 아래 0px'으로 수정합니다.
                captureArea.style.padding = `${PADDING_VALUE}px ${PADDING_VALUE}px 0px ${PADDING_VALUE}px`;
                captureArea.style.boxSizing = 'border-box';
                captureArea.style.backgroundColor = bgColor;

                selectedMessages.reverse().forEach(msg => {
                    const clone = processMessageClone(msg);
                    if (!clone.querySelector('.css-1ifxcjt, .css-1g2i6q3')) {
                       // [변경됨] 메시지 사이의 아래쪽 여백(margin-bottom)을 다시 '20px'으로 복구합니다.
                       clone.style.marginBottom = '20px';
                    }
                    captureArea.appendChild(clone);
                });

                if (config.hiddenKeywords && config.hiddenKeywords.length > 0) {
                    hideKeywordsInElement(captureArea, config.hiddenKeywords);
                }

                document.body.appendChild(captureArea);
                captureArea.style.position = 'absolute';
                captureArea.style.left = '-9999px';
                captureArea.style.top = '0px';

                const canvas = await html2canvas(captureArea, canvasOptions);
                document.body.removeChild(captureArea);
                downloadImage(canvas.toDataURL(`image/${config.imageFormat}`, 1.0), config.imageFormat);
            }
            // ==============================================================================

        } catch (error) {
            console.error('캡쳐 중 오류 발생:', error);
            alert('캡쳐에 실패했습니다. 콘솔을 확인해주세요.');
        } finally {
            btn.innerHTML = originalContent;
            btn.disabled = false;
        }
    }

// 메시지 복제 및 전처리 로직을 별도 함수로 분리 (재사용을 위해)
function processMessageClone(msgElement) {
    const clone = msgElement.cloneNode(true);
    clone.querySelector('.capture-checkbox-container')?.remove();

    const profileHeader = clone.querySelector('.css-15vhhhd');
    if (profileHeader) {
        profileHeader.remove();
    }

    // 1. html2canvas 렌더링 오류를 막기 위해 코드 블록을 먼저 재구성합니다. (이전과 동일)
    clone.querySelectorAll('pre.shiki').forEach(codeBlock => {
        const plainText = codeBlock.innerText;
        const newPre = document.createElement('pre');
        newPre.textContent = plainText;
        const originalStyle = window.getComputedStyle(codeBlock);
        newPre.style.backgroundColor = '#242321';
        newPre.style.color = '#e1e4e8';
        newPre.style.fontSize = '.875rem';
        newPre.style.fontFamily = '"IBMPlexMono-Regular", "IBM Plex Mono", "Pretendendard", "Apple SD Gothic Neo", -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif';
        newPre.style.padding = originalStyle.padding;
        newPre.style.margin = originalStyle.margin;
        newPre.style.borderRadius = originalStyle.borderRadius;
        newPre.style.lineHeight = originalStyle.lineHeight;
        newPre.style.whiteSpace = 'pre-wrap';
        newPre.style.wordBreak = 'break-word';
        codeBlock.parentNode.replaceChild(newPre, codeBlock);
    });

    // [수정됨] 2. 모든 텍스트를 찾아 조건 없이 -8px 올립니다.
    const textContainer = clone.querySelector('.wrtn-markdown');
    if (textContainer) {
        // [제거됨] 마크다운 셀렉터가 더 이상 필요 없습니다.

        const walker = document.createTreeWalker(textContainer, NodeFilter.SHOW_TEXT, null, false);
        let node;
        const nodesToProcess = [];
        while (node = walker.nextNode()) {
            if (node.nodeValue.trim() !== '') {
                nodesToProcess.push(node);
            }
        }

        nodesToProcess.forEach(textNode => {
            const parent = textNode.parentNode;

            // [제거됨] 마크다운인지 검사하는 로직이 필요 없습니다.
            // [제거됨] shiftValue 변수도 필요 없습니다.

            const span = document.createElement('span');
            span.style.position = 'relative';
            span.style.top = '-8px'; // 값으로 바로 적용
            span.textContent = textNode.nodeValue;

            parent.replaceChild(span, textNode);
        });
    }

    return clone;
}


    // ===================================================================================
    // PART 4: 유틸리티 함수 및 스크립트 초기화 (파일명 접미사 추가)
    // ===================================================================================
    function downloadImage(dataUrl, format, fileNameSuffix = '') { // fileNameSuffix 인자 추가
        let fileName = ConfigManager.getConfig().fileName;
        const now = new Date();
        const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
        fileName = fileName.replace('{datetime}', `${dateStr}_${timeStr}`).replace('{date}', dateStr).replace('{time}', timeStr);

        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `${fileName}${fileNameSuffix}.${format}`; // 접미사 추가
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function waitForElement(selector) {
        return new Promise(resolve => {
            const interval = setInterval(() => {
                const element = document.querySelector(selector);
                if (element) {
                    clearInterval(interval);
                    resolve(element);
                }
            }, 100);
        });
    }

    let chatObserver = null;
    function initializeScript() {
        if (chatObserver) {
            chatObserver.disconnect();
        }
        chatObserver = new MutationObserver(() => {
            if (!document.getElementById('capture-settings-button') || !document.getElementById('capture-action-button')) {
                createButtons();
            }
            injectCheckboxes();
        });
        waitForElement('div.stick-to-bottom').then(chatArea => {
            chatObserver.observe(chatArea, { childList: true, subtree: true });
            createButtons();
            injectCheckboxes();
        });
    }

    let lastUrl = location.href;
    const navigationObserver = new MutationObserver(() => {
        const currentUrl = location.href;
        if (currentUrl !== lastUrl) {
            lastUrl = currentUrl;
            console.log("페이지 이동 감지. 캡쳐 스크립트를 다시 실행합니다.");
            initializeScript();
        }
    });
    navigationObserver.observe(document.body, { childList: true, subtree: true });
    initializeScript();

})();
