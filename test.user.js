// ==UserScript==
// @name         test
// @namespace    http://tampermonkey.net/
// @version      2.45
// @description  뤼튼 크랙의 채팅 로그를 선택하여 캡쳐
// @author       뤼붕이
// @match        https://crack.wrtn.ai/stories/*/episodes/*
// @downloadURL  https://raw.githubusercontent.com/wrtn321/userjs/main/test.user.js
// @updateURL    https://raw.githubusercontent.com/wrtn321/userjs/main/test.user.js
// @grant        GM_addStyle
// @require      https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // ===================================================================================
    // PART 1: 설정 관리
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
    // PART 2: UI 생성 및 관리
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
        const modalHTML = `<div id="capture-settings-modal" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:9999;display:flex;justify-content:center;align-items:center;"><div style="background:${c.bg};color:${c.text};padding:24px;border-radius:12px;width:90%;max-width:600px;display:flex;flex-direction:column;gap:20px;max-height: 90vh;"><div style="display:flex;justify-content:space-between;align-items:center;"><h2 style="margin:0;font-size:1.4em;font-weight:600;">📸 캡쳐 설정</h2><button id="capture-modal-close" style="background:none;border:none;color:${c.text};font-size:1.5em;cursor:pointer;">&times;</button></div><div style="display:flex; gap: 10px; flex-wrap: wrap;"><div style="flex: 1 1 200px;"><label style="display:block; margin-bottom: 8px;">파일 이름:</label><input id="capture-filename" type="text" value="${localConfig.fileName}" style="width:100%;padding:10px;border:1px solid ${c.border};border-radius:6px;background:${c.inputBg};color:${c.text};box-sizing: border-box;"></div><div style="flex: 1 1 200px;"><label style="display:block; margin-bottom: 8px;">이미지 형식:</label><select id="capture-format" style="width:100%;padding:10px;border:1px solid ${c.border};border-radius:6px;background:${c.inputBg};color:${c.text};box-sizing: border-box;"><option value="jpeg" ${localConfig.imageFormat === 'jpeg' ? 'selected' : ''}>JPG</option><option value="png" ${localConfig.imageFormat === 'png' ? 'selected' : ''}>PNG</option><option value="webp" ${localConfig.imageFormat === 'webp' ? 'selected' : ''}>WEBP</option></select></div></div><div style="display: flex; gap: 20px; align-items: center; padding-bottom: 10px; border-bottom: 1px solid ${c.border};"><div style="display: flex; align-items: center;"><input type="checkbox" id="capture-high-quality" style="width: 16px; height: 16px; margin-right: 8px;"><label for="capture-high-quality" style="cursor: pointer; user-select: none;">고화질(용량증가)</label></div><div style="display: flex; align-items: center;"><input type="checkbox" id="capture-split-mode" style="width: 16px; height: 16px; margin-right: 8px;"><label for="capture-split-mode" style="cursor: pointer; user-select: none;">분할 캡쳐 (모바일❌)</label></div></div><div><label style="display:block; margin-bottom: 8px;">단어 숨김 규칙:</label><div id="hidden-keyword-list" style="max-height: 150px; overflow-y: auto; border: 1px solid ${c.border}; border-radius: 6px; padding: 10px; margin-bottom: 10px;"></div><div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;"><input id="hidden-keyword-input" type="text" placeholder="숨길 키워드 등록" style="flex:1; padding:10px; border:1px solid ${c.border}; border-radius:6px; background:${c.inputBg}; color:${c.text}; box-sizing: border-box;"><button id="add-hidden-keyword" style="padding:10px; background:${c.btn}; color:${c.btnTxt}; border:none; border-radius:6px; cursor:pointer; min-width: 40px;">+</button></div></div><div style="text-align: right; border-top: 1px solid ${c.border}; padding-top: 20px;"><button id="capture-modal-save" style="padding:10px 20px;background:${c.btn};color:${c.btnTxt};border:none;border-radius:8px;cursor:pointer;font-size:1em;">저장</button></div></div></div>`;
        document.body.insertAdjacentHTML("beforeend", modalHTML);
        document.getElementById('capture-high-quality').checked = !!localConfig.highQualityCapture;
        document.getElementById('capture-split-mode').checked = !!localConfig.splitCapture;

        const renderHiddenKeywordList = () => { const listDiv = document.getElementById('hidden-keyword-list'); listDiv.innerHTML = ''; if (localConfig.hiddenKeywords.length === 0) { listDiv.innerHTML = `<span style="opacity: 0.6;">등록된 키워드가 없습니다.</span>`; } localConfig.hiddenKeywords.forEach((keyword, index) => { const item = document.createElement('div'); item.style.cssText = `display:flex; justify-content:space-between; align-items:center; padding: 5px; border-radius: 4px;`; item.innerHTML = `<span>${keyword}</span><button data-index="${index}" class="delete-keyword" style="background:${c.delBtn}; color:${c.btnTxt}; border:none; border-radius:4px; cursor:pointer; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;">×</button>`; listDiv.appendChild(item); }); document.querySelectorAll('.delete-keyword').forEach(btn => { btn.onclick = (e) => { localConfig.hiddenKeywords.splice(parseInt(e.target.dataset.index), 1); renderHiddenKeywordList(); }; }); };
        document.getElementById('add-hidden-keyword').onclick = () => { const keywordInput = document.getElementById('hidden-keyword-input'); if (keywordInput.value.trim()) { localConfig.hiddenKeywords.push(keywordInput.value.trim()); keywordInput.value = ''; renderHiddenKeywordList(); } };
        const closeModal = () => document.getElementById("capture-settings-modal")?.remove();
        document.getElementById('capture-modal-close').onclick = closeModal;
        document.getElementById('capture-modal-save').onclick = () => {
            localConfig.fileName = document.getElementById('capture-filename').value;
            localConfig.imageFormat = document.getElementById('capture-format').value;
            localConfig.highQualityCapture = document.getElementById('capture-high-quality').checked;
            localConfig.splitCapture = document.getElementById('capture-split-mode').checked;
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

    async function handleCapture() {
        const allMessages = Array.from(document.querySelectorAll('div[data-message-group-id]'));
        const selectedMessages = allMessages.filter(msg => msg.querySelector('.capture-checkbox:checked'));
        if (selectedMessages.length === 0) { alert('캡쳐할 메시지를 하나 이상 선택해주세요.'); return; }

        const btn = document.getElementById('capture-action-button');
        const originalContent = btn.innerHTML;
        btn.innerHTML = '...';
        btn.disabled = true;

        // ========== iOS 감지 로직 추가 ==========
        const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
        // =====================================

        try {
            const config = ConfigManager.getConfig();
            const bgColor = window.getComputedStyle(document.body).backgroundColor;
            const PADDING_VALUE = 20;

            const canvasOptions = {
                useCORS: true,
                backgroundColor: bgColor,
                logging: false,
                scrollY: -window.scrollY,
                windowHeight: window.innerHeight,
                scale: config.highQualityCapture ? 2 : 1
            };

            if (config.splitCapture) {
                // ================== 분할 캡쳐 로직 수정 ==================
                const capturedImages = []; // 캡쳐된 이미지 데이터(URL)를 저장할 배열
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
                    capturedImages.push(canvas.toDataURL(`image/${config.imageFormat}`, 1.0)); // 배열에 이미지 데이터 추가
                    document.body.removeChild(captureArea);
                }

                if (isIOS) {
                    // 순서 변경을 원하지 않으면 이 라인을 삭제하거나 주석 처리하세요.
                    capturedImages.reverse(); // 최신순으로 보려면 이 줄의 주석을 푸세요.
                    showImagePreviewModal(capturedImages); // iOS이면 미리보기 창을 띄움
                } else {
                    // 기존 PC/안드로이드 다운로드 방식
                    capturedImages.forEach((dataUrl, index) => {
                        const suffix = `_${String(index + 1).padStart(2, '0')}`;
                        downloadImage(dataUrl, config.imageFormat, suffix);
                    });
                }
                // ========================================================

            } else {
                // ================== 단일 캡쳐 로직 수정 ==================
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
                captureArea.style.padding = `${PADDING_VALUE}px ${PADDING_VALUE}px 0px ${PADDING_VALUE}px`;
                captureArea.style.boxSizing = 'border-box';
                captureArea.style.backgroundColor = bgColor;

                selectedMessages.reverse().forEach(msg => {
                    const clone = processMessageClone(msg);
                    if (!clone.querySelector('.css-1ifxcjt, .css-1g2i6q3')) {
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
                const dataUrl = canvas.toDataURL(`image/${config.imageFormat}`, 1.0);

                if (isIOS) {
                    showImagePreviewModal([dataUrl]); // iOS이면 미리보기 창을 띄움 (배열 형태로 전달)
                } else {
                    downloadImage(dataUrl, config.imageFormat); // 기존 PC/안드로이드 다운로드 방식
                }
                // ========================================================
            }

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

    // 1. 이미지 SRC를 데이터 URL로 교체하여 캡쳐 오류를 방지 (이어서생성 아이콘)
    const imageDataMap = {
        'https://cdn-image.wrtn.ai/crack/icons/prochat_1_0.webp': 'data:image/webp;base64,UklGRjQFAABXRUJQVlA4WAoAAAAwAAAAXwAAXwAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZWUDhMRQMAAC9fwBcQ18GgbSNJ3r3jz7jdjwRBtk39aXeCI0zbNtr+vzjtFoaMJAmqNxiU97d4g0dog01Y76V4XTgL3aDW6QblZINyurFAtUEttLEwVBopUqRACA1CCC19sOUcNvRDBYYfvZ93MWy5h00G2QKAxm0jpF5Z7zY9kixGsuY4WU9bcrXt///MTgUoT3uK6P8EqP9lw9frzjuLiOhqv3kd4iGJaeeQsG6GAzF4i+S2GYqL/ywyu1RU/GdRoEvl/LUo1KUyeo+Cm1DAX5TtkrToUfxGVnBYYB0E9RaLdEHMH4uFuiBkwHJdENHbgtAFAcFh0S6yRYeFe7YNFr9hSngAB5bgDoGLHA3yr9Z8uGHokX8NUPHhQOcE3ALcCvBkCQUeAxwLwIHKCVgDAFQCPFGHAh9GtwJwoGkkHI+OJfwiCShwDZOVABspkoSHqVsB+ErhGZ6PHqaOp44nqmvzwOAJIjJeAZgHRKxgWleI1bUGuGHAmPfFUWkAMA/4sAce8E4DgFlzpLyWA69gbI72HRkYXyJnm+dZKj3KNxVLnWdZ8Ipmjrwxp0feSlMYZO5zOia8ophzpZzEs7rQFGa24nnNeWFYXWggN7MVQyujWs00MJvZE1WTsyVZzTSI1LNFKSBXl3Iu54eElgTX8xMB+vimQgkvNIhYzU80h57dV0jd5iSy8eOpptGzRYWMLzlfLIh4S3GDzCkncB1THHMNOYppBaRLpphV8xiaYx6rsrcsDzCpc2DJ4vMSixkdL6723c7N6JjlNS9yPADA8QJxuW+NODcAsOTo85RnOAezwLGZOsLx3MA5g1OE7wzVT5y+mjqfQFxUDA1FYPjmcurnHtaBQnkBqEcGBTpF+inhfHQu4YNGWQHL0UKADUTvAlADGBTYKOJoBZwDnAlwgUq9CVgCLAS8KHrPh+eXyO8UYydA5AeHag9Bo1hjXZ6LPKovL6gD96a4u9JeFPtXYS+KP5W1VQJfinpREtuSXpTIbTn2U8n0xdRBHbZ3JdaV4YOSa0uoOyUZ5ftOiY4klsO2nRLeZ9nfb0F1W0djd11U4rvv1W2n9obP1tvv2LpNQRX5DbtLUeWHbtyHqMpNE/69U4e6d3aXovqvGAA=',
        'https://cdn-image.wrtn.ai/crack/icons/hyperchat.webp': 'data:image/webp;base64,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',
        'https://cdn-image.wrtn.ai/crack/icons/superchatplus.webp': 'data:image/webp;base64,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',
        'https://cdn-image.wrtn.ai/crack/icons/superchat.webp': 'data:image/webp;base64,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',
        'https://cdn-image.wrtn.ai/crack/icons/powerchatPlus.webp': 'data:image/webp;base64,UklGRhwFAABXRUJQVlA4WAoAAAAQAAAAOwAAOwAAQUxQSGUCAAABsFVr29g2liAYgiEYgiCEwYRByqBmkDLIMCiEQAgEM4gZPPvi/yXZnZlzbiNiApb/+c9Hzpd1XS+nP+TNZev04+NGxP332/l5F+7n4fT2KSLTfL2ennO+43ZeTj/vOjLefp4edn59vxlv73fImBQJt78ec707moYxCPJxfsTqkUn2x+38gNP9EdMmIYrvy7Hl70dVlM3kfjm2HggNyLRh7H4+9HKAtlKDJOPtdOTjQLNCCkEhn0fuB2QwKWMDpd72vTiclO1Eiuh+2vV6P0RMQsh86LprWVbticg0hGbC/bTvzWakoFkztOW677Y1rZTNQqEQ7rtWqqFB0KQyrRmx7nmPIc9tVvza8wmV0qFCyBjxuec+GIyhLRRBlPK944Ky3XC0IWPQeWu1s1DHtqPgZesVhTy1bNfrPorqCRQhDv2BmXaoodITgqjw19ZLnt4IYXjZOhsrKXSgyP5ctk4T2VtbkWmhgdPW8kWR1GR3Nksovpadv5CjbRFlrIiPPWvGioZEkybTjMnLntM95GDmIdlO38vud9OUCpk3lbFBPvatM4RhDJIh05TzvuVzkmxnTLZDysdycCWl0LA/MqY4H1neTbNRW5kWCR/L4dONoDIW0hYy3s7HljUEJfMy1ETRZXngxSwVGjRFI7kuj1wHA7Idku3r8phQUTRpiEzjujz2VbaLmkyHih/Lg3/aLiWhks3bujz6iiZkmrEh+XVaHv53IdKkECp8rssTf5Mcr+BzXZ76aYzbr/Xy+vtGCN+/f5yWJ39VfX/+OC/z0/p6vV6vry/n5Q+8+XpfT8s/9Hxa/j8GAFZQOCCQAgAAkA4AnQEqPAA8AD6RPJpLJaKiIaYVWnCwEglsALUbRzmfr3488xDwn3zw9r+B9uXaA8SrpNeYD9kf2A95D0AegB5t/qAft308HsO/uH+4ftZEz0Qr8qqDDagdRZlrzKDHQr86WE7fWorGxLOWJz0StOIjs3JoAe8gi8vefMAA/vSj5y6qlvu2cm92obpJRDwVanDub5sAH4lO9WEM2PGS8tzL7jpAiZdht6md6TQqUafTllDbPL63JYDxeBrQbk5cr3rHWE7IdhUEnoElSOIH9HAZ/iqv69msa+ubfeqxmWfuBwGGecO1qmDNTAlhbHH/MxFyKjJZkAWRrecFKlsQ7j04B9xtvKhgYFT4nl0r/9o4Y66l7KQjSSvUuEfsoZ08Dh0CVqSrG3dx8F5hbbduuxtWE+rCwZdzdCm/dwX6RQTnl3ID2fMdIzXw7i8kuz3bhgUVWP7RBHRhqFDG3u5BETDEl83XdeJuyx7jxpP2Gm7GfTDcuNOHgXiIyXG3rMwDBurvlN1XD+TdOrVbC4zkE0RAMaIwPkJthW/TIRwrzIbHt6PxaLzFX/F/P+P9n9fs7Uk4kT+P8/dWTPf9/fGKHke1gv7Sb/HV/6tjJBx+Nm4RIRSWyyaLu7K8QXKcOodH/QTl6X+iTALkSJej5dqC22/b4xmzY4u5gdDLFM4T0LoanIj7/1WcmbIm2VuJFntXxoLVmHLP/ALyl4MVYaJxC49R6keeg0RA2K7D5gzVujfD0Jop9JWnB//AZ8jSujC0agzphh+SFePh9kiEokepx/vZt//+RA10fbcFrNudCy0vGEuHnCTZp7aCrGBkYfff69SufzcTLqqH4tX8mTeDw8Uufhh//vWojneK4x2HAAA=',
        'https://cdn-image.wrtn.ai/crack/icons/powerchat.webp': 'data:image/webp;base64,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'
    };

    clone.querySelectorAll('img').forEach(img => {
        for (const originalUrl in imageDataMap) {
            if (img.src.startsWith(originalUrl)) {
                img.crossOrigin = 'anonymous';
                img.src = imageDataMap[originalUrl];
                break;
            }
        }
    });


    // 2. html2canvas 렌더링 오류를 막기 위해 코드 블록을 먼저 재구성합니다.
    clone.querySelectorAll('pre.shiki').forEach(codeBlock => {
        const plainText = codeBlock.innerText;
        const newPre = document.createElement('pre');
        newPre.textContent = plainText;
        const originalStyle = window.getComputedStyle(codeBlock);
        newPre.style.backgroundColor = '#242321';
        newPre.style.color = '#e1e4e8';
        newPre.style.fontSize = '.875rem';
        newPre.style.fontFamily = '"IBMPlexMono-Regular", "IBM Plex Mono", "Pretendard", "Apple SD Gothic Neo", -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif';
        newPre.style.padding = originalStyle.padding;
        newPre.style.margin = originalStyle.margin;
        newPre.style.borderRadius = originalStyle.borderRadius;
        newPre.style.lineHeight = '1.5';
        newPre.style.whiteSpace = 'pre-wrap';
        newPre.style.wordBreak = 'break-word';
        codeBlock.parentNode.replaceChild(newPre, codeBlock);
    });

    // 3. 메시지 본문('.wrtn-markdown')의 모든 텍스트를 찾아 -8px 올립니다.
    const textContainer = clone.querySelector('.wrtn-markdown');
    if (textContainer) {
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
            const span = document.createElement('span');
            span.style.position = 'relative';
            span.style.top = '-8px';
            span.textContent = textNode.nodeValue;
            parent.replaceChild(span, textNode);
        });
    }

    // [수정됨] 4. '이어서 생성' 버튼의 텍스트를 찾아 -8px 올립니다. (클래스명이 바뀌어도 작동하도록 수정)
    clone.querySelectorAll('p').forEach(pElement => {
        if (pElement.textContent.trim() === '이어서 생성') {
            pElement.style.position = 'relative';
            pElement.style.top = '-8px';
        }
    });

    return clone;
}
    // ===================================================================================
    // PART 4: 유틸리티 함수 및 스크립트 초기화
    // ===================================================================================

    // ========== iOS 저장 지원을 위한 미리보기 창 함수 추가 ==========
    function showImagePreviewModal(dataUrls) {
        if (!dataUrls || dataUrls.length === 0) return;

        // 기존에 창이 있으면 제거
        document.getElementById('capture-preview-modal')?.remove();

        const isDark = document.body.dataset.theme === 'dark';
        const modalBg = isDark ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.9)';
        const textColor = isDark ? '#fff' : '#000';
        const btnBg = isDark ? '#444' : '#ccc';
        const btnColor = isDark ? '#fff' : '#000';

        const modal = document.createElement('div');
        modal.id = 'capture-preview-modal';
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background-color: ${modalBg}; z-index: 10000;
            display: flex; flex-direction: column; align-items: center;
            padding: 20px; box-sizing: border-box; backdrop-filter: blur(5px);
        `;

        const header = document.createElement('div');
        header.style.cssText = `
            width: 100%; max-width: 800px; display: flex; justify-content: space-between; align-items: center;
            padding-bottom: 15px; color: ${textColor}; flex-shrink: 0;
        `;
        header.innerHTML = `<p style="margin: 0; font-weight: bold; font-size: 16px;">이미지를 꾹 눌러서 저장하세요</p>`;

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '닫기';
        closeBtn.style.cssText = `
            background: ${btnBg}; color: ${btnColor}; border: none; padding: 8px 15px;
            border-radius: 5px; cursor: pointer; font-size: 14px;
        `;
        closeBtn.onclick = () => modal.remove();

        header.appendChild(closeBtn);
        modal.appendChild(header);

        const imageContainer = document.createElement('div');
        imageContainer.style.cssText = `
            flex-grow: 1; overflow-y: auto; width: 100%; max-width: 800px;
            display: flex; flex-direction: column; align-items: center; gap: 15px;
        `;

        dataUrls.forEach(url => {
            const img = document.createElement('img');
            img.src = url;
            img.style.maxWidth = '100%';
            img.style.borderRadius = '8px';
            img.style.boxShadow = '0 4px 10px rgba(0,0,0,0.2)';
            imageContainer.appendChild(img);
        });

        modal.appendChild(imageContainer);
        document.body.appendChild(modal);
    }
    // ========================================================

    function downloadImage(dataUrl, format, fileNameSuffix = '') {
        let fileName = ConfigManager.getConfig().fileName;
        const now = new Date();
        const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
        fileName = fileName.replace('{datetime}', `${dateStr}_${timeStr}`).replace('{date}', dateStr).replace('{time}', timeStr);

        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `${fileName}${fileNameSuffix}.${format}`;
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
