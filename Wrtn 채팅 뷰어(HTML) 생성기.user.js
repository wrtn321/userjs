// ==UserScript==
// @name         크랙 채팅 HTML 변환
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  크랙(Crack)의 채팅 내용을 html로 변환합니다.
// @author       뤼붕이
// @match        https://crack.wrtn.ai/u/*/c/*
// @grant        none
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // ===================================================================================
    // PART 1: HTML 생성을 위한 템플릿 정의
    // ===================================================================================

    const HTML_STRUCTURE = `<header class="main-header"><div class="header-content-wrapper"><h1 id="viewer-title" title="클릭하여 제목 수정"></h1><button id="hamburger-menu-btn" class="action-btn" title="메뉴 열기">☰</button></div></header><main id="chat-log-container" class="chat-log-container"></main><footer class="site-footer"><p>© 2025. All rights reserved.</p></footer><div id="info-panel-overlay"></div><div id="info-panel"><div class="info-panel-header"><h2>대화 정보</h2><button id="info-panel-close-btn">×</button></div><div class="info-panel-tabs"><button class="tab-link active" data-tab="persona">프로필</button><button class="tab-link" data-tab="usernote">노트</button><button class="tab-link" data-tab="export">저장/내보내기</button></div><div class="info-panel-body"><div id="persona-content" class="tab-content active"><div class="content-header"><h3 id="persona-name"></h3><button id="edit-persona-btn" class="panel-edit-btn">✏️</button></div><div id="persona-view-mode"><div id="persona-info" class="content-box"></div></div><div id="persona-edit-mode" hidden><textarea id="persona-textarea"></textarea><div class="edit-actions"><button id="save-persona-btn" class="panel-save-btn">저장</button><button id="cancel-persona-btn" class="panel-cancel-btn">취소</button></div></div></div><div id="usernote-content" class="tab-content"><div class="content-header"><h3>유저노트</h3><button id="edit-usernote-btn" class="panel-edit-btn">✏️</button></div><div id="usernote-view-mode"><div id="usernote-info" class="content-box"></div></div><div id="usernote-edit-mode" hidden><textarea id="usernote-textarea"></textarea><div class="edit-actions"><button id="save-usernote-btn" class="panel-save-btn">저장</button><button id="cancel-usernote-btn" class="panel-cancel-btn">취소</button></div></div></div><div id="export-content" class="tab-content"><a href="#" id="download-html-btn" class="panel-action-link">💾 HTML 로 저장</a><a href="#" id="download-json-btn" class="panel-action-link">📄 JSON 으로 저장</a><a href="#" id="download-txt-btn" class="panel-action-link">📄 TXT 로 저장</a></div></div></div><div id="toast-notification"><p class="toast-message"></p></div>`;
    const VIEWER_CSS = `:root{--primary-color:#4A90E2;--background-color:#fff;--surface-color:#f5f7fa;--border-color:#eaecef;--text-primary-color:#212529;--text-secondary-color:#6c757d}*{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;margin:0;background-color:var(--background-color);color:var(--text-primary-color);display:flex;flex-direction:column;min-height:100vh}.main-header{background-color:var(--surface-color);border-bottom:1px solid var(--border-color);padding:10px 15px;position:sticky;top:0;z-index:100}.header-content-wrapper{display:flex;justify-content:space-between;align-items:center;width:100%}.main-header h1{font-size:20px;margin:0;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-grow:1;text-align:center;padding:0 40px}.action-btn{background:0 0;border:none;font-size:24px;cursor:pointer;color:var(--text-primary-color);padding:8px}.chat-log-container{display:flex;flex-direction:column;gap:12px;padding:20px 15px;max-width:800px;width:100%;margin:0 auto;flex-grow:1}.message-bubble{padding:16px;border-radius:18px;max-width:95%;line-height:1.6;word-wrap:break-word}.message-bubble p{margin:0 0 14px 0!important}.message-bubble p:last-child{margin:0!important}.message-content{cursor:pointer;white-space:pre-wrap}.user-message{align-self:flex-end;background-color:#61605a;color:#fff;border-bottom-right-radius:4px}.user-message p span{color:#C7C5BD !important;}.assistant-message{align-self:flex-start;background-color:var(--surface-color);border:1px solid var(--border-color);color:var(--text-primary-color);border-bottom-left-radius:4px}.message-bubble.editing{width:100%;max-width:100%}.editable-textarea{display:block;width:100%;background:var(--background-color);border:1px solid var(--primary-color);border-radius:4px;font-family:inherit;font-size:1em;line-height:1.6;padding:8px;resize:vertical;outline:0}.edit-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:8px}.edit-actions button{background-color:var(--surface-color);border:1px solid var(--border-color);border-radius:6px;padding:4px 10px;cursor:pointer}.title-edit-input{width:70%;font-size:20px;font-weight:700;text-align:center;border:1px solid var(--primary-color);border-radius:5px;padding:5px;outline:0;background-color:var(--surface-color);color:var(--text-primary-color)}#info-panel,#info-panel-overlay{position:fixed;top:0;right:0;height:100%;transition:transform .3s ease-in-out,opacity .3s ease-in-out}#info-panel-overlay{width:100%;background-color:rgba(0,0,0,.5);z-index:999;opacity:0;pointer-events:none}#info-panel{width:90%;max-width:350px;background-color:var(--surface-color);z-index:1001;display:flex;flex-direction:column;box-shadow:-2px 0 10px rgba(0,0,0,.1);transform:translateX(100%)}#info-panel.is-open{transform:translateX(0)}#info-panel-overlay.is-open{opacity:1;pointer-events:auto}.info-panel-header{display:flex;justify-content:space-between;align-items:center;padding:0 20px;min-height:60px;border-bottom:1px solid var(--border-color);flex-shrink:0}#info-panel-close-btn{font-size:24px;background:0 0;border:none;cursor:pointer;color:var(--text-primary-color)}.info-panel-tabs{display:flex;border-bottom:1px solid var(--border-color);flex-shrink:0}.tab-link{flex:1;padding:12px;text-align:center;background:0 0;border:none;cursor:pointer;font-size:15px;border-bottom:3px solid transparent;color:var(--text-secondary-color)}.tab-link.active{font-weight:700;color:var(--primary-color);border-bottom-color:var(--primary-color)}.info-panel-body{padding:20px;overflow-y:auto;flex-grow:1;min-height:0}.tab-content{display:none}.tab-content.active{display:block}.content-box{background-color:var(--background-color);border:1px solid var(--border-color);padding:15px;border-radius:8px;white-space:pre-wrap;word-break:break-word;min-height:100px}.content-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}#persona-name,.content-header h3{margin:0;font-size:16px}.panel-edit-btn{font-size:18px;background:0 0;border:none;cursor:pointer;color:var(--text-primary-color)}#persona-edit-mode textarea,#usernote-edit-mode textarea{width:100%;min-height:150px;border:1px solid var(--primary-color);border-radius:8px;padding:10px;resize:vertical;background-color:var(--background-color);color:var(--text-primary-color)}#persona-edit-mode .edit-actions,#usernote-edit-mode .edit-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:10px}.panel-save-btn{padding:6px 12px;border-radius:6px;border:none;cursor:pointer;background-color:var(--primary-color)}.panel-cancel-btn{padding:6px 12px;border-radius:6px;border:none;cursor:pointer;background-color:#e0e0e0}.panel-action-link{display:block;padding:15px 20px;text-decoration:none;color:var(--text-primary-color);border-radius:8px;margin-bottom:10px;background-color:var(--background-color);transition:background-color .2s;border:1px solid var(--border-color)}.panel-action-link:hover{background-color:#e9ecef}.site-footer{text-align:center;padding:15px;font-size:12px;color:var(--text-secondary-color)}#toast-notification{position:fixed;bottom:-50px;left:50%;transform:translateX(-50%);background-color:rgba(0,0,0,.8);color:#fff;padding:12px 20px;border-radius:20px;z-index:2000;opacity:0;transition:opacity .3s,bottom .3s;pointer-events:none}#toast-notification.show{bottom:30px;opacity:1}table{border-collapse:collapse;width:100%;margin:1em 0;border:1px solid #c7c5bd}th,td{border:1px solid #c7c5bd;padding:8px;text-align:left}`;

    const VIEWER_JS = function() {
        function parseInlineMarkdown(text) {
            let htmlLine = text;
            htmlLine = htmlLine.replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" style="max-width: 100%; border-radius: 8px;">');
            htmlLine = htmlLine.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');
            htmlLine = htmlLine.replace(/(\*\*\*|___|\*\*|__)(.+?)\1/g, '<strong style="font-weight: bold;">$2</strong>');
            htmlLine = htmlLine.replace(/(\*|_)(.+?)\1/g, '<span>$2</span>');
            htmlLine = htmlLine.replace(/~~(.+?)~~/g, '<del>$1</del>');
            htmlLine = htmlLine.replace(/\^\^(.+?)\^\^/g, '<mark>$1</mark>');
            htmlLine = htmlLine.replace(/`(.+?)`/g, '<code style="font-weight: bold; background-color: rgba(0,0,0,0.05); padding: 2px 4px; border-radius: 4px;">$1</code>');
            return htmlLine;
        }
        function parseMarkdown(text) {
            if (!text) return '';
            const lines = text.split('\n');
            const htmlBlocks = [];
            for (let i = 0; i < lines.length; i++) {
                let line = lines[i];
                if (line.trim().startsWith('>')) {
                    const quoteLines = [];
                    while (i < lines.length && (lines[i] && lines[i].trim().startsWith('>'))) {
                        quoteLines.push(lines[i].replace(/^>+\s*/, ''));
                        i++;
                    }
                    i--;
                    htmlBlocks.push(`<blockquote style="border-left: 3px solid #ccc; padding-left: 10px; margin: 0; background-color: var(--surface-color);">${parseInlineMarkdown(quoteLines.join('<br>'))}</blockquote>`);
                    continue;
                }
                if (line.trim().startsWith('```')) {
                    const lang = line.trim().substring(3).trim();
                    const codeLines = [];
                    i++;
                    while (i < lines.length && !lines[i].trim().startsWith('```')) { codeLines.push(lines[i]); i++; }
                    const langHeader = lang ? `<div style="background-color: #4a4a4a; color: #e0e0e0; padding: 5px 10px; border-top-left-radius: 6px; border-top-right-radius: 6px;">${lang}</div>` : '';
                    htmlBlocks.push(`<div style="background-color: #2d2d2d; border-radius: 6px; margin: 1em 0;">${langHeader}<pre style="margin: 0;"><code style="color:#f1f1f1; padding: 10px; display: block; white-space: pre-wrap; word-wrap: break-word;">${codeLines.join('\n').replace(/</g, '&lt;')}</code></pre></div>`);
                    continue;
                }
                if (line.includes('|') && i + 1 < lines.length && lines[i+1].includes('-')) {
                     if (lines[i+1].trim().replace(/\|/g, '').replace(/-/g, '').replace(/:/g, '').replace(/\s/g, '') === '') {
                        const headers = line.split('|').slice(1, -1).map(h => `<th>${parseInlineMarkdown(h.trim())}</th>`).join('');
                        const bodyLines = [];
                        i += 2;
                        while (i < lines.length && lines[i].includes('|')) { bodyLines.push(lines[i]); i++; }
                        i--;
                        const rows = bodyLines.map(rowLine => { const cells = rowLine.split('|').slice(1, -1).map(c => `<td>${parseInlineMarkdown(c.trim())}</td>`).join(''); return `<tr>${cells}</tr>`; }).join('');
                        htmlBlocks.push(`<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`);
                        continue;
                    }
                }
                const hMatch = line.match(/^(#+) (.*)$/);
                if (hMatch) {
                    const level = hMatch[1].length;
                    htmlBlocks.push(`<h${level} style="font-weight: bold; font-size: ${2.0 - level * 0.2}em; margin: 0;">${parseInlineMarkdown(hMatch[2])}</h${level}>`);
                    continue;
                }
                if (/^(---|___|\*\*\*)$/.test(line.trim())) { htmlBlocks.push('<hr>'); continue; }
                if (line.trim() !== '') {
                    htmlBlocks.push(`<p>${parseInlineMarkdown(line)}</p>`);
                }
            }
            return htmlBlocks.join('');
        }
        document.addEventListener("DOMContentLoaded", () => {
            let activeEditingIndex = null;
            let toastTimer;
            const viewerTitle = document.getElementById('viewer-title');
            const chatLogContainer = document.getElementById('chat-log-container');
            const hamburgerMenuBtn = document.getElementById('hamburger-menu-btn');
            const infoPanelOverlay = document.getElementById('info-panel-overlay');
            const infoPanel = document.getElementById('info-panel');
            const infoPanelCloseBtn = document.getElementById('info-panel-close-btn');
            const infoPanelTabs = document.querySelector('.info-panel-tabs');
            const personaNameEl = document.getElementById('persona-name');
            const personaInfoEl = document.getElementById('persona-info');
            const personaTextarea = document.getElementById('persona-textarea');
            const usernoteInfoEl = document.getElementById('usernote-info');
            const usernoteTextarea = document.getElementById('usernote-textarea');

            function renderAll() {
                document.title = window.initialChatData.title;
                viewerTitle.textContent = window.initialChatData.title;
                chatLogContainer.innerHTML = '';
                window.initialChatData.messages.forEach((msg, index) => {
                    chatLogContainer.appendChild(createMessageBubble(msg, index));
                });
                personaNameEl.textContent = window.initialChatData.userPersona.name || '프로필';
                personaInfoEl.textContent = window.initialChatData.userPersona.information || '정보 없음';
                personaTextarea.value = window.initialChatData.userPersona.information || '';
                usernoteInfoEl.textContent = window.initialChatData.userNote || '유저노트 없음';
                usernoteTextarea.value = window.initialChatData.userNote || '';
            }

            function createMessageBubble(message, index) {
                const bubble = document.createElement('div');
                bubble.className = `message-bubble ${message.role === 'user' ? 'user' : 'assistant'}-message`;
                bubble.dataset.index = index;
                bubble.dataset.content = message.content;
                const viewContent = document.createElement('div');
                viewContent.className = 'message-content';
                viewContent.innerHTML = parseMarkdown(message.content.replace(/</g, "&lt;"));
                const editContainer = document.createElement('div');
                editContainer.style.display = 'none';
                const editTextarea = document.createElement('textarea');
                editTextarea.className = 'editable-textarea';
                editTextarea.value = message.content;
                const editActions = document.createElement('div');
                editActions.className = 'edit-actions';
                editActions.innerHTML = `<button class="save-edit-btn">저장</button><button class="cancel-edit-btn">취소</button>`;
                editContainer.appendChild(editTextarea);
                editContainer.appendChild(editActions);
                bubble.appendChild(viewContent);
                bubble.appendChild(editContainer);
                const autoResizeTextarea = (el) => {
                    el.style.height = 'auto';
                    el.style.height = el.scrollHeight + 'px';
                };
                const enterEditMode = () => {
                    if (activeEditingIndex !== null) {
                        showToast('다른 항목 수정을 먼저 완료하세요.');
                        return;
                    }
                    activeEditingIndex = index;
                    bubble.classList.add('editing');
                    viewContent.style.display = 'none';
                    editContainer.style.display = 'block';
                    autoResizeTextarea(editTextarea);
                    // [수정] 포커스 시 화면 스크롤 방지
                    editTextarea.focus({ preventScroll: true });
                };
                const exitEditMode = (save) => {
                    if (save) {
                        const newContent = editTextarea.value;
                        viewContent.innerHTML = parseMarkdown(newContent.replace(/</g, "&lt;"));
                        bubble.dataset.content = newContent;
                    } else {
                        editTextarea.value = bubble.dataset.content;
                    }
                    bubble.classList.remove('editing');
                    viewContent.style.display = 'block';
                    editContainer.style.display = 'none';
                    activeEditingIndex = null;
                };
                viewContent.addEventListener('dblclick', enterEditMode);
                editTextarea.addEventListener('input', () => autoResizeTextarea(editTextarea));
                editActions.querySelector('.save-edit-btn').addEventListener('click', () => exitEditMode(true));
                editActions.querySelector('.cancel-edit-btn').addEventListener('click', () => exitEditMode(false));
                return bubble;
            }

            function getCurrentDataFromDOM() {
                return {
                    title: viewerTitle.textContent,
                    userPersona: {
                        name: personaNameEl.textContent,
                        information: personaTextarea.value
                    },
                    userNote: usernoteTextarea.value,
                    messages: Array.from(document.querySelectorAll('.message-bubble')).map(bubble => ({
                        role: bubble.classList.contains('user-message') ? 'user' : 'assistant',
                        content: bubble.dataset.content
                    }))
                };
            }

            function download(content, filename, contentType) {
                const blob = new Blob([content], { type: contentType });
                const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
                document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href);
            }

            function addEventListeners() {
                const openPanel = () => { infoPanelOverlay.classList.add('is-open'); infoPanel.classList.add('is-open'); };
                const closePanel = () => { infoPanelOverlay.classList.remove('is-open'); infoPanel.classList.remove('is-open'); };
                hamburgerMenuBtn.addEventListener('click', openPanel);
                infoPanelCloseBtn.addEventListener('click', closePanel);
                infoPanelOverlay.addEventListener('click', closePanel);
                viewerTitle.addEventListener('click', () => {
                    if (document.querySelector('.title-edit-input')) return;
                    const input = document.createElement('input');
                    input.type = 'text'; input.className = 'title-edit-input'; input.value = viewerTitle.textContent;
                    viewerTitle.style.display = 'none'; viewerTitle.parentNode.insertBefore(input, viewerTitle);
                    input.focus();
                    const saveTitle = () => {
                        const newTitle = input.value.trim() || '제목 없음';
                        viewerTitle.textContent = newTitle; document.title = newTitle;
                        viewerTitle.style.display = 'block';
                        if (input.parentNode) input.parentNode.removeChild(input);
                    };
                    input.addEventListener('blur', saveTitle);
                    input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
                });
                infoPanelTabs.addEventListener('click', e => {
                    if (e.target.classList.contains('tab-link')) {
                        const tabName = e.target.dataset.tab;
                        infoPanelTabs.querySelectorAll('.tab-link').forEach(btn => btn.classList.remove('active'));
                        infoPanel.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
                        e.target.classList.add('active');
                        document.getElementById(`${tabName}-content`).classList.add('active');
                    }
                });
                const setupEditToggle = type => {
                    const infoEl = document.getElementById(`${type}-info`);
                    const textarea = document.getElementById(`${type}-textarea`);
                    document.getElementById(`edit-${type}-btn`).addEventListener('click', () => {
                        document.getElementById(`${type}-view-mode`).hidden = true;
                        document.getElementById(`${type}-edit-mode`).hidden = false;
                    });
                    document.getElementById(`cancel-${type}-btn`).addEventListener('click', () => {
                        textarea.value = (type === 'persona') ? window.initialChatData.userPersona.information : window.initialChatData.userNote;
                        document.getElementById(`${type}-view-mode`).hidden = false;
                        document.getElementById(`${type}-edit-mode`).hidden = true;
                    });
                    document.getElementById(`save-${type}-btn`).addEventListener('click', () => {
                        const newValue = textarea.value;
                        infoEl.textContent = newValue;
                        if (type === 'persona') window.initialChatData.userPersona.information = newValue;
                        else window.initialChatData.userNote = newValue;
                        document.getElementById(`${type}-view-mode`).hidden = false;
                        document.getElementById(`${type}-edit-mode`).hidden = true;
                        showToast('임시 저장되었습니다.');
                    });
                };
                setupEditToggle('persona');
                setupEditToggle('usernote');
                document.getElementById('download-html-btn').addEventListener('click', e => {
                    e.preventDefault();
                    const currentData = getCurrentDataFromDOM();
                    const regeneratedHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, maximum-scale=1.0, minimum-scale=1.0">
<title>${currentData.title.replace(/</g,"&lt;")}</title>
<style>${window.CSS_TEMPLATE}</style>
</head>
<body class="sticky-footer-layout">
${window.HTML_TEMPLATE}
<script>
    window.initialChatData = ${JSON.stringify(currentData,null,2)};
    window.HTML_TEMPLATE = ${JSON.stringify(window.HTML_TEMPLATE)};
    window.CSS_TEMPLATE = ${JSON.stringify(window.CSS_TEMPLATE)};
    window.VIEWER_JS_SOURCE = ${JSON.stringify(window.VIEWER_JS_SOURCE)};
<\/script>
<script>
    (new Function(window.VIEWER_JS_SOURCE))();
<\/script>
</body>
</html>`;
                    download(regeneratedHtml, `${currentData.title.replace(/[\\/:*?"<>|]/g,"")}.html`, "text/html;charset=utf-8");
                });
                document.getElementById('download-json-btn').addEventListener('click', e => { e.preventDefault(); const d = getCurrentDataFromDOM(); download(JSON.stringify(d, null, 2), `${d.title.replace(/[\\/:*?"<>|]/g,"")}.json`, "application/json;charset=utf-8"); });
                document.getElementById('download-txt-btn').addEventListener('click', e => { e.preventDefault(); const d = getCurrentDataFromDOM(); const c = d.messages.map(m => `${m.role.toUpperCase()}:\n${m.content}`).join('\n\n'); download(c, `${d.title.replace(/[\\/:*?"<>|]/g,"")}.txt`, "text/plain;charset=utf-8"); });
            }
            const showToast = message => {
                const toast = document.getElementById('toast-notification');
                if (!toast) return;
                toast.querySelector('.toast-message').textContent = message;
                clearTimeout(toastTimer);
                toast.classList.add('show');
                toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
            };
            renderAll();
            addEventListeners();
        });
    };

    // ===================================================================================
    // PART 2: WRTN.AI 사이트 로직
    // ===================================================================================

    function generateFullHtmlPage(chatData) {
        return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, maximum-scale=1.0, minimum-scale=1.0">
    <title>${chatData.title.replace(/</g, '&lt;')}</title>
    <style>${VIEWER_CSS}</style>
</head>
<body class="sticky-footer-layout">
${HTML_STRUCTURE}
<script>
    window.initialChatData = ${JSON.stringify(chatData, null, 2)};
    window.HTML_TEMPLATE = ${JSON.stringify(HTML_STRUCTURE)};
    window.CSS_TEMPLATE = ${JSON.stringify(VIEWER_CSS)};
    window.VIEWER_JS_SOURCE = ${JSON.stringify(`(${VIEWER_JS.toString()})();`)};
<\/script>
<script>
    (new Function(window.VIEWER_JS_SOURCE))();
<\/script>
</body>
</html>`;
    }

    function waitForElement(selector) { return new Promise(resolve => { const i = setInterval(() => { const e = document.querySelector(selector); if (e) { clearInterval(i); resolve(e); } }, 100); }); }
    function getCookie(name) { const nameEQ = name + "="; const ca = document.cookie.split(';'); for(let i=0;i < ca.length;i++) { let c = ca[i]; while (c.charAt(0)==' ') c = c.substring(1,c.length); if (c.indexOf(nameEQ) == 0) return decodeURIComponent(c.substring(nameEQ.length,c.length)); } return null; }
    function downloadFile(content, filename, contentType) { const b = new Blob([content], { type: contentType }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href); }
    function getUrlInfo() { const pathParts = window.location.pathname.split('/'); const cIndex = pathParts.indexOf('c'); if (cIndex > -1 && cIndex + 1 < pathParts.length) { return { chatroomId: pathParts[cIndex + 1] }; } return {}; }
    async function apiRequest(url, token) { const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }); if (!response.ok) throw new Error(`API Error: ${response.status}`); return (await response.json()).data; }

    async function fetchAllChatData() {
        const token = getCookie('access_token');
        const { chatroomId } = getUrlInfo();
        if (!token || !chatroomId) throw new Error('토큰 또는 채팅방 ID를 찾을 수 없습니다.');
        const API_BASE = "https://contents-api.wrtn.ai";
        const chatroomPromise = apiRequest(`${API_BASE}/character-chat/api/v2/chat-room/${chatroomId}`, token);
        const messagesPromise = apiRequest(`${API_BASE}/character-chat/api/v2/chat-room/${chatroomId}/messages?limit=2000`, token);
        const personaListPromise = apiRequest(`${API_BASE}/character/character-profiles`, token)
            .then(p => p?.wrtnUid ? apiRequest(`${API_BASE}/character/character-profiles/${p.wrtnUid}`, token) : null)
            .then(pd => pd?._id ? apiRequest(`${API_BASE}/character/character-profiles/${pd._id}/character-chat-profiles`, token) : { characterChatProfiles: [] })
            .then(list => list.characterChatProfiles || []);
        const [chatroomData, messagesData, personaList] = await Promise.all([chatroomPromise, messagesPromise, personaListPromise]);
        const messages = (messagesData?.list || []).reverse().map(m => ({ role: m.role, content: m.content }));
        const currentPersonaId = chatroomData?.chatProfile?._id;
        let currentPersona = currentPersonaId ? personaList.find(p => p._id === currentPersonaId) : null;
        if (!currentPersona && personaList.length > 0) {
            currentPersona = personaList.find(p => p.isRepresentative);
        }
        return {
            title: chatroomData?.title || 'Unknown Chat',
            userPersona: { name: currentPersona?.name || '적용된 프로필 없음', information: currentPersona?.information || '' },
            userNote: chatroomData?.character?.userNote?.content || '',
            messages: messages
        };
    }

    async function createMenuButton() {
        try {
            const menuContainer = await waitForElement('.css-uxwch2');
            const buttonId = 'html-viewer-saver-v4.2';
            if (document.getElementById(buttonId)) return;
            const button = document.createElement('div');
            button.id = buttonId;
            button.className = 'css-1dib65l';
            button.style.cssText = "display: flex; cursor: pointer; padding: 10px;";
            button.innerHTML = `<p class="css-1xke5yy"><span style="padding-right: 6px;">📄</span>HTML 뷰어 저장 v4.2</p>`;
            button.addEventListener('click', async () => {
                const p = button.querySelector('p');
                const originalText = p.innerHTML;
                try {
                    p.textContent = '생성 중...';
                    button.style.pointerEvents = 'none';
                    const chatData = await fetchAllChatData();
                    const finalHtml = generateFullHtmlPage(chatData);
                    const fileName = `${chatData.title.replace(/[\\/:*?"<>|]/g, '')}.html`;
                    downloadFile(finalHtml, fileName, 'text/html;charset=utf-8');
                } catch (error) {
                    console.error('HTML 생성 실패:', error);
                    alert(`오류가 발생했습니다: ${error.message}`);
                } finally {
                    p.innerHTML = originalText;
                    button.style.pointerEvents = 'auto';
                }
            });
            menuContainer.appendChild(button);
        } catch (e) { console.error('버튼 생성 실패:', e); }
    }

    const observer = new MutationObserver((_, obs) => {
        if (document.querySelector('.css-uxwch2')) { createMenuButton(); obs.disconnect(); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();
