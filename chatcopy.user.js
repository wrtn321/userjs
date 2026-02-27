// ==UserScript==
// @name         crack text copy
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  사용자 프롬프트와 함께 채팅로그를 복사
// @author       뤼붕이
// @match        https://crack.wrtn.ai/stories/*/episodes/*
// @downloadURL  https://raw.githubusercontent.com/wrtn321/userjs/main/chatcopy.user.js
// @updateURL    https://raw.githubusercontent.com/wrtn321/userjs/main/chatcopy.user.js
// @grant        GM_xmlhttpRequest
// @require      https://cdn.jsdelivr.net/npm/sortablejs@latest/Sortable.min.js
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // ===================================================================================
    // PART 1: 설정 및 프롬프트 관리
    // ===================================================================================
    class ConfigManager {
        static getConfig() {
            const defaults = {
                copyMode: 'recent',
                recentTurnCount: 10,
                startTurn: 1,
                endTurn: 50,
                showTurnNumbers: true,
                selectedPromptId: 'none',
                prompts:[],
                includeUserNote: true,
                includePersona: true
            };
            try {
                const saved = JSON.parse(localStorage.getItem("crackCopyConfigProV3") || "{}");
                return { ...defaults, ...saved, prompts: Array.isArray(saved.prompts) ? saved.prompts :[] };
            } catch (e) {
                return defaults;
            }
        }
        static setConfig(c) { localStorage.setItem("crackCopyConfigProV3", JSON.stringify(c)); }
    }
    class PromptManager {
        static get() { return ConfigManager.getConfig().prompts; }
        static save(p) { const c = ConfigManager.getConfig(); c.prompts = p; ConfigManager.setConfig(c); }
        static add(p) { this.save([...this.get(), { ...p, id: `prompt_${Date.now()}` }]); }
        static update(id, u) { this.save(this.get().map(p => (p.id === id ? { ...p, ...u } : p))); }
        static delete(id) { const c = ConfigManager.getConfig(); if (c.selectedPromptId === id) c.selectedPromptId = 'none'; c.prompts = c.prompts.filter(p => p.id !== id); ConfigManager.setConfig(c); }
    }

    // ===================================================================================
    // PART 2: 턴 계산 및 텍스트 생성 로직
    // ===================================================================================

    // 턴계산방식: AI의 한 응답 = 1턴
    function groupMessagesIntoTurns(messages) {
        let turns =[];
        let currentTurn = { turnNum: 1, messages:[] };

        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];

            if (msg.role === 'assistant' && currentTurn.messages.length > 0) {
                turns.push(currentTurn);
                currentTurn = { turnNum: turns.length + 1, messages:[] };
            }

            currentTurn.messages.push(msg);
        }
        if (currentTurn.messages.length > 0) {
            turns.push(currentTurn);
        }
        return turns;
    }

    function generateCustomFormatString(chatData, customPromptText, config) {
        let outputLines =[];

        if (customPromptText) { outputLines.push(customPromptText, '', '---', ''); }

        if (config.includePersona && chatData.userPersona && chatData.userPersona.name) {
            outputLines.push(`[user프로필: ${chatData.userPersona.name}]`);
            if (chatData.userPersona.information) { outputLines.push(chatData.userPersona.information); }
            outputLines.push('');
        }

        if (config.includeUserNote && chatData.userNote) {
            outputLines.push('[usernote]', chatData.userNote, '');
        }
        outputLines.push('---', '', '[chat log]');

        const allTurns = groupMessagesIntoTurns(chatData.messages);
        let targetTurns =[];

        if (config.copyMode === 'range') {
            targetTurns = allTurns.filter(t => t.turnNum >= config.startTurn && t.turnNum <= config.endTurn);
        } else {
            if (config.recentTurnCount <= 0) {
                targetTurns = allTurns;
            } else {
                targetTurns = allTurns.slice(-Math.abs(config.recentTurnCount));
            }
        }

        targetTurns.forEach(turn => {
            if (config.showTurnNumbers) {
                outputLines.push(`\n[Turn ${turn.turnNum}]`);
            }
            turn.messages.forEach(msg => {
                outputLines.push(`{${msg.role}: ${msg.content}}`);
            });
        });

        return outputLines.join('\n').trim();
    }

    async function copyToClipboard(text, successCallback, errorCallback) {
        try {
            await navigator.clipboard.writeText(text);
            if (successCallback) successCallback();
        }
        catch (err) {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.top = '-9999px';
            textarea.style.left = '-9999px';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                if(document.execCommand('copy')) {
                    if (successCallback) successCallback();
                } else {
                    if (errorCallback) errorCallback();
                }
            } catch (execErr) {
                if (errorCallback) errorCallback();
            } finally {
                document.body.removeChild(textarea);
            }
        }
    }

    // ===================================================================================
    // PART 3: API 연동 로직
    // ===================================================================================
    const API_BASE = "https://crack-api.wrtn.ai";

    function getCookie(name) {
        const value = `; ${document.cookie}`; const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return decodeURIComponent(parts.pop().split(';').shift());
        return null;
    }

    function apiRequest(url, token) {
        const wrtnId = getCookie('__w_id');
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET", url: url, headers: { 'Authorization': `Bearer ${token}`, 'platform': 'web', 'x-wrtn-id': wrtnId || '' },
                onload: function(response) {
                    if (response.status >= 200 && response.status < 300) {
                        try { const data = JSON.parse(response.responseText); resolve(data.data !== undefined ? data.data : data); }
                        catch (e) { reject(new Error("JSON 파싱 오류")); }
                    } else { reject(new Error(`API 오류: ${response.status}`)); }
                },
                onerror: () => reject(new Error("네트워크 오류"))
            });
        });
    }

    function getUrlInfo() {
        const m = window.location.pathname.match(/\/stories\/([a-f0-9]+)\/episodes\/([a-f0-9]+)/);
        return m ? { chatroomId: m[2] } : {};
    }

    async function fetchAllChatData() {
        const t = getCookie('access_token');
        const { chatroomId } = getUrlInfo();
        if (!t || !chatroomId) throw new Error('채팅방 정보를 읽을 수 없습니다.');

        const[cD, mD, profileInfo] = await Promise.all([
            apiRequest(`${API_BASE}/crack-gen/v3/chats/${chatroomId}`, t),
            apiRequest(`${API_BASE}/crack-gen/v3/chats/${chatroomId}/messages?limit=10000`, t),
            apiRequest(`${API_BASE}/crack-api/profiles`, t)
        ]);

        const userNote = cD?.story?.userNote?.content || "";
        let userPersona = { name: null, information: null };
        try {
            if (profileInfo?._id) {
                const personaRes = await apiRequest(`${API_BASE}/crack-api/profiles/${profileInfo._id}/chat-profiles`, t);
                const list = personaRes?.chatProfiles ||[];
                const activeId = cD?.chatProfile?._id;
                const p = list.find(i => i._id === activeId) || list.find(i => i.isRepresentative) || list[0];
                if (p) { userPersona = { name: p.name, information: p.information }; }
            }
        } catch (e) { console.error("페르소나 파싱 실패:", e); }

        const messages = (mD?.messages ||[]).reverse().map(m => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content
        }));

        return { userNote, userPersona, messages };
    }

    // ===================================================================================
    // PART 4: UI 생성 및 이벤트 처리
    // ===================================================================================
    function createCopyConfirmationUI(textToCopy, originalButton, originalButtonHTML) {
        if (document.getElementById('copy-confirmation-overlay')) return;
        const overlay = document.createElement('div');
        overlay.id = 'copy-confirmation-overlay';
        overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:10000; display:flex; justify-content:center; align-items:center;';
        const confirmButton = document.createElement('button');
        confirmButton.textContent = '클립보드에 복사하기';
        confirmButton.style.cssText = 'padding: 15px 30px; font-size: 16px; border-radius: 8px; border: none; background-color: #007aff; color: white; cursor: pointer;';

        const closeUI = () => {
            document.body.removeChild(overlay);
            originalButton.innerHTML = originalButtonHTML;
            originalButton.disabled = false;
        };

        confirmButton.onclick = () => { copyToClipboard(textToCopy, () => { confirmButton.textContent = '복사 완료!'; confirmButton.style.backgroundColor = '#34c759'; setTimeout(closeUI, 1000); }, () => { confirmButton.textContent = '복사 실패'; confirmButton.style.backgroundColor = '#ff3b30'; setTimeout(closeUI, 1500); } ); };
        overlay.onclick = (e) => { if (e.target === overlay) closeUI(); };
        overlay.appendChild(confirmButton); document.body.appendChild(overlay);
    }

    async function handleInstantCopy(btn) {
        const originalHTML = btn.innerHTML;
        const config = ConfigManager.getConfig();

        const successSVG = `<svg xmlns="http://www.w3.org/2000/svg" fill="var(--icon_tertiary)" viewBox="0 0 24 24" width="18" height="18"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"></path></svg>`;
        const failSVG = `<svg xmlns="http://www.w3.org/2000/svg" fill="var(--icon_tertiary)" viewBox="0 0 24 24" width="18" height="18"><path d="M19 6.4L17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4z"></path></svg>`;

        try {
            btn.innerHTML = '...';
            btn.disabled = true;

            const prompt = config.prompts.find(i => i.id === config.selectedPromptId);
            const chatData = await fetchAllChatData();
            const textToCopy = generateCustomFormatString(chatData, prompt ? prompt.prompt : null, config);
            const isIphone = /iPhone/i.test(navigator.userAgent);

            if (isIphone) {
                createCopyConfirmationUI(textToCopy, btn, originalHTML);
            } else {
                await copyToClipboard(textToCopy,
                    () => {
                        btn.innerHTML = successSVG;
                        setTimeout(() => { btn.innerHTML = originalHTML; btn.disabled = false; }, 1500);
                    },
                    () => {
                        btn.innerHTML = failSVG;
                        setTimeout(() => { btn.innerHTML = originalHTML; btn.disabled = false; }, 2000);
                    }
                );
            }
        } catch (e) {
            alert(`오류: ${e.message}`);
            btn.innerHTML = originalHTML;
            btn.disabled = false;
        }
    }

    function showSettingsModal() {
        if (document.getElementById("crack-copy-settings-modal")) return;
        let localConfig = ConfigManager.getConfig(); const isDark = document.body.dataset.theme === 'dark';
        const c = { bg: isDark ? '#2c2c2e' : '#ffffff', text: isDark ? '#e0e0e0' : '#333333', border: isDark ? '#444444' : '#cccccc', inputBg: isDark ? '#3a3a3c' : '#f0f0f0', btn: isDark ? '#0a84ff' : '#007aff', btnTxt: '#ffffff', delBtn: isDark ? '#ff453a' : '#ff3b30', activeTab: isDark ? '#444' : '#eee', selItem: isDark ? 'rgba(10, 132, 255, 0.3)' : 'rgba(0, 122, 255, 0.1)' };

        const modalHTML = `<div id="crack-copy-settings-modal" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:9999;display:flex;justify-content:center;align-items:center;">
            <div style="background:${c.bg};color:${c.text};padding:0;border-radius:12px;width:90%;max-width:700px;display:flex;flex-direction:column;max-height:90vh;">
                <style>
                    .prompt-item { display:flex; align-items:center; padding: 10px; border-radius: 6px; cursor: pointer; border: 1px solid transparent; margin-bottom: 5px; }
                    .prompt-item:hover { background-color: ${c.inputBg}; }
                    .prompt-item.selected { border-color: ${c.btn}; background-color: ${c.selItem}; }
                    .drag-handle { cursor: grab; padding: 0 10px 0 2px; user-select: none; font-size: 1.2em; }
                    .sortable-ghost { opacity: 0.4; background-color: ${c.btn}; }
                    .modal-tab { padding: 10px 16px; cursor: pointer; border: none; background: transparent; color: ${c.text}; border-bottom: 2px solid transparent; }
                    .modal-tab.active { background: ${c.activeTab}; border-bottom-color: ${c.btn}; }
                    .tab-pane { display: none; } .tab-pane.active { display: block; }
                    #add-pane.active, #edit-pane.active { display: flex !important; flex-direction: column; gap: 10px; }
                    input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { appearance: none; margin: 0; }
                    input[type=number] { -moz-appearance: textfield; }
                    .radio-group { display: flex; flex-direction: column; gap: 10px; margin-bottom: 15px; background: ${c.inputBg}; padding: 15px; border-radius: 8px; }
                </style>
                <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 24px;border-bottom:1px solid ${c.border};">
                    <h2 style="margin:0;font-size:1.4em;font-weight:600;">📋 텍스트 복사 설정</h2>
                    <button id="crack-copy-close" style="background:none;border:none;color:${c.text};font-size:1.5em;cursor:pointer;">&times;</button>
                </div>
                <div style="padding: 0 24px; border-bottom:1px solid ${c.border};">
                    <button class="modal-tab active" data-tab="list-pane">목록 & 설정</button>
                    <button class="modal-tab" data-tab="add-pane">새 프롬프트 추가</button>
                    <button class="modal-tab" data-tab="edit-pane">프롬프트 편집</button>
                </div>
                <div style="overflow-y:auto;padding:20px 24px;">
                    <div id="list-pane" class="tab-pane active">
                        <div class="radio-group">
                            <label style="font-weight:bold; margin-bottom:5px;">대화 추출 범위 설정</label>
                            <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
                                <input type="radio" name="copyMode" value="recent" ${localConfig.copyMode === 'recent' ? 'checked' : ''}>
                                <span>최근 <input id="crack-copy-recent-turns" type="number" min="0" value="${localConfig.recentTurnCount}" style="width:60px;padding:4px;border:1px solid ${c.border};border-radius:4px;background:${c.bg};color:${c.text};text-align:center;"> 턴만 복사 (0 입력시 전체복사)</span>
                            </label>
                            <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
                                <input type="radio" name="copyMode" value="range" ${localConfig.copyMode === 'range' ? 'checked' : ''}>
                                <span>특정 구간: <input id="crack-copy-start-turn" type="number" min="1" value="${localConfig.startTurn}" style="width:60px;padding:4px;border:1px solid ${c.border};border-radius:4px;background:${c.bg};color:${c.text};text-align:center;"> 턴 부터 ~
                                <input id="crack-copy-end-turn" type="number" min="1" value="${localConfig.endTurn}" style="width:60px;padding:4px;border:1px solid ${c.border};border-radius:4px;background:${c.bg};color:${c.text};text-align:center;"> 턴 까지</span>
                            </label>
                        </div>

                        <div style="display:flex; align-items:center; gap: 20px; margin-bottom: 20px; flex-wrap: wrap;">
                            <div style="display:flex; align-items:center; gap: 8px;">
                                <input type="checkbox" id="crack-copy-include-persona" ${localConfig.includePersona ? 'checked' : ''} style="cursor:pointer;">
                                <label for="crack-copy-include-persona" style="cursor:pointer; user-select:none;">대화 프로필</label>
                            </div>
                            <div style="display:flex; align-items:center; gap: 8px;">
                                <input type="checkbox" id="crack-copy-include-note" ${localConfig.includeUserNote ? 'checked' : ''} style="cursor:pointer;">
                                <label for="crack-copy-include-note" style="cursor:pointer; user-select:none;">유저노트</label>
                            </div>
                            <div style="display:flex; align-items:center; gap: 8px;">
                                <input type="checkbox" id="crack-copy-show-turn-num" ${localConfig.showTurnNumbers ? 'checked' : ''} style="cursor:pointer;">
                                <label for="crack-copy-show-turn-num" style="cursor:pointer; user-select:none;">[Turn N] 표시</label>
                            </div>
                        </div>
                        <h3 style="margin: 0 0 10px 0; font-size: 1.1em; border-bottom: 1px solid ${c.border}; padding-bottom: 5px;">프롬프트 선택</h3>
                        <div id="prompt-list" style="max-height: 250px; overflow-y: auto;"></div>
                    </div>
                    <div id="add-pane" class="tab-pane">
                        <input type="text" id="prompt-name-input-add" placeholder="프롬프트 이름" style="width:100%;padding:10px;border:1px solid ${c.border};border-radius:6px;background:${c.inputBg};color:${c.text};">
                        <textarea id="prompt-content-input-add" placeholder="프롬프트 내용" style="width:100%;height:200px;padding:10px;border:1px solid ${c.border};border-radius:6px;background:${c.inputBg};color:${c.text};resize:vertical;"></textarea>
                        <button id="prompt-add-btn" style="padding:8px 14px;background:${c.btn};color:${c.btnTxt};border:none;border-radius:6px;cursor:pointer;align-self:flex-start;">추가</button>
                    </div>
                    <div id="edit-pane" class="tab-pane">
                        <div id="edit-pane-content"></div>
                    </div>
                </div>
                <div style="text-align: right; border-top: 1px solid ${c.border}; padding: 16px 24px;">
                    <button id="crack-copy-save-settings" style="padding:10px 20px;background:${c.btn};color:${c.btnTxt};border:none;border-radius:8px;cursor:pointer;font-size:1em;font-weight:500;">설정 저장</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML("beforeend", modalHTML);

        const getEl = (id) => document.getElementById(id);
        let sortableInstance = null;
        const[promptListDiv, addName, addContent, addBtn, editPaneContent] =["prompt-list", "prompt-name-input-add", "prompt-content-input-add", "prompt-add-btn", "edit-pane-content"].map(getEl);

        const renderEditPane = (p) => {
            if (!p) { editPaneContent.innerHTML = `<span style="color:${c.text}80;">목록 탭에서 수정할 프롬프트를 선택하세요.</span>`; return; }
            editPaneContent.innerHTML = `<input type="hidden" id="prompt-edit-id" value="${p.id}"><input type="text" id="prompt-name-input-edit" placeholder="프롬프트 이름" value="${p.name}" style="width:100%;padding:10px;border:1px solid ${c.border};border-radius:6px;background:${c.inputBg};color:${c.text};margin-bottom:10px;"><textarea id="prompt-content-input-edit" placeholder="프롬프트 내용" style="width:100%;height:200px;padding:10px;border:1px solid ${c.border};border-radius:6px;background:${c.inputBg};color:${c.text};resize:vertical;margin-bottom:10px;">${p.prompt}</textarea><div><button id="prompt-update-btn" style="padding:8px 14px;background:${c.btn};color:${c.btnTxt};border:none;border-radius:6px;cursor:pointer;">수정</button><button id="prompt-delete-btn" style="padding:8px 14px;background:${c.delBtn};color:${c.btnTxt};border:none;border-radius:6px;cursor:pointer;margin-left:10px;">삭제</button></div>`;
            getEl('prompt-update-btn').onclick = () => { const id = getEl('prompt-edit-id').value, name = getEl('prompt-name-input-edit').value.trim(), content = getEl('prompt-content-input-edit').value.trim(); if (!name || !content) return alert('이름과 내용을 모두 입력해주세요.'); PromptManager.update(id, { name, prompt: content }); localConfig.prompts = PromptManager.get(); renderPrompts(); switchTab('list-pane'); };
            getEl('prompt-delete-btn').onclick = () => { if (confirm('정말로 이 프롬프트를 삭제하시겠습니까?')) { PromptManager.delete(getEl('prompt-edit-id').value); localConfig = ConfigManager.getConfig(); renderPrompts(); renderEditPane(null); switchTab('list-pane'); } };
        };

        const switchTab = (tabId) => {
            if (tabId === 'edit-pane') { const p = localConfig.prompts.find(p => p.id === localConfig.selectedPromptId); renderEditPane(p); }
            document.querySelectorAll('.modal-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === tabId));
        };

        document.querySelectorAll('.modal-tab').forEach(tab => tab.onclick = () => switchTab(tab.dataset.tab));
        const selectPrompt = (id) => { localConfig.selectedPromptId = id; renderPrompts(); };
        const initializeSortable = () => { if (sortableInstance) sortableInstance.destroy(); sortableInstance = new Sortable(promptListDiv, { handle: '.drag-handle', animation: 150, onEnd: (e) => { const item = localConfig.prompts.splice(e.oldIndex - 1, 1)[0]; localConfig.prompts.splice(e.newIndex - 1, 0, item); renderPrompts(); } }); };

        const renderPrompts = () => {
            promptListDiv.innerHTML = '';
            const createItem = (id, name) => {
                const item = document.createElement('div'); item.className = 'prompt-item'; item.dataset.id = id;
                const isSelected = localConfig.selectedPromptId === id; if (isSelected) item.classList.add('selected');
                item.innerHTML = `<span class="drag-handle" style="visibility:${id === 'none' ? 'hidden' : 'visible'};">☰</span><span>${isSelected ? '✓ ' : ''}${name}</span>`;
                item.onclick = () => selectPrompt(id); return item;
            };
            promptListDiv.appendChild(createItem('none', '프롬프트 사용 안함'));
            localConfig.prompts.forEach(p => promptListDiv.appendChild(createItem(p.id, p.name))); initializeSortable();
        };

        addBtn.onclick = () => { const name = addName.value.trim(), content = addContent.value.trim(); if (!name || !content) return alert('이름과 내용을 모두 입력해주세요.'); PromptManager.add({ name, prompt: content }); localConfig.prompts = PromptManager.get(); addName.value = ''; addContent.value = ''; renderPrompts(); switchTab('list-pane'); };
        getEl('crack-copy-close').onclick = () => getEl("crack-copy-settings-modal").remove();

        getEl('crack-copy-save-settings').onclick = () => {
            const copyMode = document.querySelector('input[name="copyMode"]:checked').value;
            localConfig.copyMode = copyMode;
            localConfig.recentTurnCount = parseInt(getEl('crack-copy-recent-turns').value, 10) || 0;
            localConfig.startTurn = parseInt(getEl('crack-copy-start-turn').value, 10) || 1;
            localConfig.endTurn = parseInt(getEl('crack-copy-end-turn').value, 10) || 50;

            localConfig.showTurnNumbers = getEl('crack-copy-show-turn-num').checked;
            localConfig.includePersona = getEl('crack-copy-include-persona').checked;
            localConfig.includeUserNote = getEl('crack-copy-include-note').checked;

            ConfigManager.setConfig(localConfig);
            alert('설정이 저장되었습니다.');
            getEl("crack-copy-settings-modal").remove();
        };

        renderPrompts();
        renderEditPane(null);
    }

    async function createButtons() {
        const menuContainer = await waitForElement('.py-4.overflow-y-auto.scrollbar > .px-2:first-of-type');
        if (menuContainer && !document.getElementById('custom-copy-settings-button')) {
            const btn = document.createElement('div');
            btn.id = 'custom-copy-settings-button';
            btn.className = 'px-2.5 h-4 box-content py-[18px]';
            btn.innerHTML = `<button class="w-full flex h-4 items-center justify-between typo-110-16-med space-x-2 [&amp;_svg]:fill-icon_tertiary ring-offset-4 ring-offset-sidebar" style="cursor: pointer;"><span class="flex space-x-2 items-center"><span style="font-size: 16px;">📋</span><span class="whitespace-nowrap overflow-hidden text-ellipsis typo-text-sm_leading-none_medium">복사 설정</span></span></button>`;
            btn.onclick = showSettingsModal;
            menuContainer.appendChild(btn);
        }

        const btnGroup = await waitForElement('.flex.items-center.space-x-2');
        if (btnGroup && !document.getElementById('instant-copy-button')) {
            const btn = document.createElement('button');
            btn.id = 'instant-copy-button';
            btn.className = 'relative inline-flex items-center gap-1 rounded-full text-sm font-medium leading-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4[&_svg]:fill-current min-w-7 border border-border bg-card text-gray-1 hover:bg-secondary p-0 size-7 justify-center';
            btn.title = "저장된 설정으로 즉시 복사";
            btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="var(--icon_tertiary)" viewBox="0 0 24 24" width="18" height="18"><path d="M16 1H4C2.9 1 2 1.9 2 3v14h2V3h12V1zM19 5H8C6.9 5 6 5.9 6 7v14c0 1.1 0.9 2 2 2h11c1.1 0 2-0.9 2-2V7C21 5.9 20.1 5 19 5zM19 21H8V7h11V21z"></path></svg>`;
            btn.onclick = () => handleInstantCopy(btn);
            btnGroup.prepend(btn);
        }
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

    const observer = new MutationObserver(() => {
        if (!document.getElementById('custom-copy-settings-button') || !document.getElementById('instant-copy-button')) {
             createButtons();
        }
    });

    waitForElement('body').then(body => {
        observer.observe(body, { childList: true, subtree: true });
        createButtons();
    });

})();
