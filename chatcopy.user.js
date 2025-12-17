// ==UserScript==
// @name         crack text copy
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  채팅로그를 지정 프롬프트와 함께 복사
// @author       뤼붕이
// @match        https://crack.wrtn.ai/stories/*/episodes/*
// @grant        none
// @require      https://cdn.jsdelivr.net/npm/sortablejs@latest/Sortable.min.js
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // ===================================================================================
    // PART 1: 설정 및 프롬프트 관리 (LocalStorage 사용)
    // ===================================================================================
    class ConfigManager {
        static getConfig() { const d = { turnCount: 30, selectedPromptId: 'none', prompts: [] }; try { const s = JSON.parse(localStorage.getItem("crackCopyConfigPro") || "{}"); return { ...d, ...s, prompts: Array.isArray(s.prompts) ? s.prompts : [] }; } catch (e) { return d; } }
        static setConfig(c) { localStorage.setItem("crackCopyConfigPro", JSON.stringify(c)); }
    }
    class PromptManager {
        static get() { return ConfigManager.getConfig().prompts; }
        static save(p) { const c = ConfigManager.getConfig(); c.prompts = p; ConfigManager.setConfig(c); }
        static add(p) { this.save([...this.get(), { ...p, id: `prompt_${Date.now()}` }]); }
        static update(id, u) { this.save(this.get().map(p => (p.id === id ? { ...p, ...u } : p))); }
        static delete(id) { const c = ConfigManager.getConfig(); if (c.selectedPromptId === id) c.selectedPromptId = 'none'; c.prompts = c.prompts.filter(p => p.id !== id); ConfigManager.setConfig(c); }
    }

    // ===================================================================================
    // PART 2: 텍스트 생성 및 복사 로직
    // ===================================================================================
    function generateCustomFormatString(chatData, customPromptText) {
        let outputLines = [];

        // --- 0. 사용자 프롬프트 (가장 먼저 추가) ---
        if (customPromptText) {
            outputLines.push(customPromptText);
            outputLines.push('');      // 공백
            outputLines.push('---');   // 구분선
            outputLines.push('');      // 공백
        }

        // --- 1. 사용자 페르소나 ---
        if (chatData.userPersona && chatData.userPersona.name) {
            outputLines.push(`[user프로필: ${chatData.userPersona.name}]`);
            if (chatData.userPersona.information) {
                outputLines.push(chatData.userPersona.information);
            }
            outputLines.push('');
        }

        // --- 2. 유저 노트 ---
        if (chatData.userNote) {
            outputLines.push('[usernote]');
            outputLines.push(chatData.userNote);
            outputLines.push('');
        }

        // --- 3. 구분선 및 채팅 로그 ---
        outputLines.push('---');
        outputLines.push(''); // 공백
        outputLines.push('[chat log]');
        const messageBlocks = chatData.messages.map(msg => `{${msg.role}: ${msg.content}}`);
        outputLines.push(messageBlocks.join('\n\n'));

        return outputLines.join('\n');
    }
    async function copyToClipboard(t) { try { await navigator.clipboard.writeText(t); } catch (e) { console.error('클립보드 복사 실패:', e); alert('클립보드 복사에 실패했습니다.'); } }


    // ===================================================================================
    // PART 3: WRTN.AI API 연동 로직
    // ===================================================================================
    const API_BASE = "https://contents-api.wrtn.ai";
    function waitForElement(s) { return new Promise(r => { const i = setInterval(() => { const e = document.querySelector(s); if (e) { clearInterval(i); r(e); } }, 100); }); }
    function getCookie(n) { const m = document.cookie.match(new RegExp(`(?:^|; )${n.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1")}=([^;]*)`)); return m ? decodeURIComponent(m[1]) : null; }
    function getUrlInfo() { const m = window.location.pathname.match(/\/stories\/[a-f0-9]+\/episodes\/([a-f0-9]+)/); return m ? { chatroomId: m[1] } : {}; }
    async function apiRequest(u, t) { const r = await fetch(u, { headers: { 'Authorization': `Bearer ${t}` } }); if (!r.ok) throw new Error(`API 오류: ${r.status}`); return (await r.json()).data; }
    async function getAllPersonas(t) { try { const p1 = await apiRequest(`${API_BASE}/character/character-profiles`, t); if (!p1?.wrtnUid) return []; const p2 = await apiRequest(`${API_BASE}/character/character-profiles/${p1.wrtnUid}`, t); if (!p2?._id) return []; const p3 = await apiRequest(`${API_BASE}/character/character-profiles/${p2._id}/character-chat-profiles`, t); return p3?.characterChatProfiles || []; } catch (e) { console.error("페르소나 로딩 실패:", e); return []; } }
    async function fetchAllChatData(l) { const t = getCookie('access_token'); const { chatroomId } = getUrlInfo(); if (!t || !chatroomId) throw new Error('토큰/채팅방 ID 없음'); const [cD, mD, pL] = await Promise.all([apiRequest(`${API_BASE}/character-chat/api/v2/chat-room/${chatroomId}`, t), apiRequest(`${API_BASE}/character-chat/api/v2/chat-room/${chatroomId}/messages?limit=${l}`, t), getAllPersonas(t)]); let p = null; if (pL.length > 0) { p = cD?.chatProfile?._id ? pL.find(i => i._id === cD.chatProfile._id) : pL.find(i => i.isRepresentative); } const msgs = (mD?.list || []).reverse().map(m => ({ role: m.role, content: m.content })); return { userNote: cD?.character?.userNote?.content || '', userPersona: { name: p?.name || null, information: p?.information || null }, messages: msgs }; }

    // ===================================================================================
    // PART 4: UI 생성 및 이벤트 처리
    // ===================================================================================
    async function handleInstantCopy(btn) {
        const original = btn.innerHTML; const config = ConfigManager.getConfig(); const turnCount = config.turnCount > 0 ? config.turnCount * 2 : 2000;
        try {
            btn.innerHTML = '...'; btn.disabled = true; const p = config.prompts.find(i => i.id === config.selectedPromptId);
            const chatData = await fetchAllChatData(turnCount); const str = generateCustomFormatString(chatData, p ? p.prompt : null);
            await copyToClipboard(str); btn.innerHTML = '✓'; setTimeout(() => { btn.innerHTML = original; btn.disabled = false; }, 1500);
        } catch (e) { console.error('즉시 복사 실패:', e); alert(`오류: ${e.message}`); btn.innerHTML = 'X'; setTimeout(() => { btn.innerHTML = original; btn.disabled = false; }, 2000); }
    }

    function showSettingsModal() {
        if (document.getElementById("crack-copy-settings-modal")) return;
        let localConfig = ConfigManager.getConfig(); const isDark = document.body.dataset.theme === 'dark';
        const c = { bg: isDark ? '#2c2c2e' : '#ffffff', text: isDark ? '#e0e0e0' : '#333333', border: isDark ? '#444444' : '#cccccc', inputBg: isDark ? '#3a3a3c' : '#f0f0f0', btn: isDark ? '#0a84ff' : '#007aff', btnTxt: '#ffffff', delBtn: isDark ? '#ff453a' : '#ff3b30', activeTab: isDark ? '#444' : '#eee', selItem: isDark ? 'rgba(10, 132, 255, 0.3)' : 'rgba(0, 122, 255, 0.1)' };

        const modalHTML = `
            <div id="crack-copy-settings-modal" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:9999;display:flex;justify-content:center;align-items:center;">
                <div style="background:${c.bg};color:${c.text};padding:0;border-radius:12px;width:90%;max-width:700px;display:flex;flex-direction:column;max-height:90vh;">
                    <style>
                        .prompt-item { display:flex; align-items:center; padding: 10px; border-radius: 6px; cursor: pointer; border: 1px solid transparent; margin-bottom: 5px; } .prompt-item:hover { background-color: ${c.inputBg}; } .prompt-item.selected { border-color: ${c.btn}; background-color: ${c.selItem}; } .drag-handle { cursor: grab; padding: 0 10px 0 2px; user-select: none; font-size: 1.2em; } .sortable-ghost { opacity: 0.4; background-color: ${c.btn}; } .modal-tab { padding: 10px 16px; cursor: pointer; border: none; background: transparent; color: ${c.text}; border-bottom: 2px solid transparent; } .modal-tab.active { background: ${c.activeTab}; border-bottom-color: ${c.btn}; }
                        .tab-pane { display: none; }
                        .tab-pane.active { display: block; }
                        #add-pane.active, #edit-pane.active { display: flex !important; flex-direction: column; gap: 10px; }
                        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { appearance: none; margin: 0; } input[type=number] { -moz-appearance: textfield; }
                    </style>
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 24px;border-bottom:1px solid ${c.border};">
                        <h2 style="margin:0;font-size:1.4em;font-weight:600;">📋 텍스트 복사 설정</h2>
                        <button id="crack-copy-close" style="background:none;border:none;color:${c.text};font-size:1.5em;cursor:pointer;">&times;</button>
                    </div>
                    <div style="padding: 0 24px; border-bottom:1px solid ${c.border};">
                         <button class="modal-tab active" data-tab="list-pane">목록</button>
                         <button class="modal-tab" data-tab="add-pane">새 프롬프트 추가</button>
                         <button class="modal-tab" data-tab="edit-pane">프롬프트 편집</button>
                    </div>
                    <div style="overflow-y:auto;padding:20px 24px;">
                        <div id="list-pane" class="tab-pane active">
                            <div style="display:flex; align-items:center; gap: 15px; margin-bottom: 20px;">
                                <label style="font-weight:500;white-space:nowrap;">Turn</label>
                                <input id="crack-copy-turn-count" type="number" min="0" value="${localConfig.turnCount}" style="width:100px;padding:8px;border:1px solid ${c.border};border-radius:6px;background:${c.inputBg};color:${c.text};font-size:1em;">
                            </div>
                            <div id="prompt-list" style="max-height: 300px; overflow-y: auto;"></div>
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
            </div>
        `;
        document.body.insertAdjacentHTML("beforeend", modalHTML);

        const getEl = (id) => document.getElementById(id); let sortableInstance = null;
        const [promptListDiv, addName, addContent, addBtn, editPaneContent] = ["prompt-list", "prompt-name-input-add", "prompt-content-input-add", "prompt-add-btn", "edit-pane-content"].map(getEl);

        const renderEditPane = (prompt) => {
            if (!prompt) { editPaneContent.innerHTML = `<span style="color:${c.text}80;">목록 탭에서 수정할 프롬프트를 선택하세요.</span>`; return; }
            editPaneContent.innerHTML = `
                <input type="hidden" id="prompt-edit-id" value="${prompt.id}">
                <input type="text" id="prompt-name-input-edit" placeholder="프롬프트 이름" value="${prompt.name}" style="width:100%;padding:10px;border:1px solid ${c.border};border-radius:6px;background:${c.inputBg};color:${c.text};margin-bottom:10px;">
                <textarea id="prompt-content-input-edit" placeholder="프롬프트 내용" style="width:100%;height:200px;padding:10px;border:1px solid ${c.border};border-radius:6px;background:${c.inputBg};color:${c.text};resize:vertical;margin-bottom:10px;">${prompt.prompt}</textarea>
                <div>
                    <button id="prompt-update-btn" style="padding:8px 14px;background:${c.btn};color:${c.btnTxt};border:none;border-radius:6px;cursor:pointer;">수정</button>
                    <button id="prompt-delete-btn" style="padding:8px 14px;background:${c.delBtn};color:${c.btnTxt};border:none;border-radius:6px;cursor:pointer;margin-left:10px;">삭제</button>
                </div>`;
            getEl('prompt-update-btn').onclick = () => {
                const id = getEl('prompt-edit-id').value, name = getEl('prompt-name-input-edit').value.trim(), content = getEl('prompt-content-input-edit').value.trim();
                if (!name || !content) return alert('이름과 내용을 모두 입력해주세요.');
                PromptManager.update(id, { name, prompt: content }); localConfig.prompts = PromptManager.get(); renderPrompts(); switchTab('list-pane');
            };
            getEl('prompt-delete-btn').onclick = () => { if (confirm('정말로 이 프롬프트를 삭제하시겠습니까?')) { PromptManager.delete(getEl('prompt-edit-id').value); localConfig = ConfigManager.getConfig(); renderPrompts(); renderEditPane(null); switchTab('list-pane'); } };
        };

        const switchTab = (tabId) => {
            if (tabId === 'edit-pane') {
                const selectedPrompt = localConfig.prompts.find(p => p.id === localConfig.selectedPromptId);
                renderEditPane(selectedPrompt);
            }
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
            localConfig.prompts.forEach(p => promptListDiv.appendChild(createItem(p.id, p.name)));
            initializeSortable();
        };

        addBtn.onclick = () => {
            const name = addName.value.trim(), content = addContent.value.trim();
            if (!name || !content) return alert('이름과 내용을 모두 입력해주세요.');
            PromptManager.add({ name, prompt: content }); localConfig.prompts = PromptManager.get();
            addName.value = ''; addContent.value = ''; renderPrompts(); switchTab('list-pane');
        };

        getEl('crack-copy-close').onclick = () => getEl("crack-copy-settings-modal").remove();
        getEl('crack-copy-save-settings').onclick = () => { localConfig.turnCount = parseInt(getEl('crack-copy-turn-count').value, 10) || 0; ConfigManager.setConfig(localConfig); alert('설정이 저장되었습니다.'); getEl("crack-copy-settings-modal").remove(); };

        renderPrompts(); renderEditPane(null);
    }

    async function createButtons() {
        const menuContainer = await waitForElement('.css-uxwch2');
        if (!document.getElementById('custom-copy-settings-button')) {
            const btn = document.createElement('div'); btn.id = 'custom-copy-settings-button'; btn.className = 'css-1dib65l'; btn.style.cssText = "display: flex; cursor: pointer; padding: 10px;";
            btn.innerHTML = `<p class="css-1xke5yy"><span style="padding-right: 6px;">📋</span>복사 설정</p>`;
            btn.onclick = showSettingsModal; menuContainer.appendChild(btn);
        }
        const btnGroup = await waitForElement('.css-fhxiwe');
        if (!document.getElementById('instant-copy-button')) {
             const btn = document.createElement('button'); btn.id = 'instant-copy-button'; btn.className = 'css-8xk5x8 eh9908w0'; btn.style.cssText = "cursor: pointer; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;"; btn.title = "저장된 설정으로 즉시 복사";
             btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="var(--icon_tertiary)" viewBox="0 0 24 24" width="18" height="18"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"></path></svg>`;
             btn.onclick = () => handleInstantCopy(btn); btnGroup.prepend(btn);
        }
    }

    new MutationObserver(() => { if (document.querySelector('.css-uxwch2') && document.querySelector('.css-fhxiwe')) { createButtons(); } }).observe(document.body, { childList: true, subtree: true });

})();
