// ==UserScript==
// @name         Wrtn 채팅 뷰어(HTML) 생성기 v3.1
// @namespace    http://tampermonkey.net/
// @version      3.1
// @description  현재 wrtn.ai 채팅방의 내용을 편집 가능한 단일 HTML 파일로 저장합니다. (마크다운, UI, 기능 개선)
// @author       Your name
// @match        https://crack.wrtn.ai/u/*/c/*
// @grant        none
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // ===================================================================================
    // PART 1: HTML 생성을 위한 템플릿 정의 (가장 먼저 선언)
    // ===================================================================================

    // --- HTML 구조 템플릿 ---
    const HTML_STRUCTURE = `<header class="main-header">
    <div class="header-content-wrapper">
        <h1 id="viewer-title" title="클릭하여 제목 수정"></h1>
        <button id="hamburger-menu-btn" class="action-btn" title="메뉴 열기">☰</button>
    </div>
</header>
<main id="chat-log-container" class="chat-log-container"></main>
<footer class="site-footer"><p>© 2025. ㄹㅇㄱ. All rights reserved.</p></footer>
<div id="info-panel-overlay"></div>
<div id="info-panel">
    <div class="info-panel-header">
        <h2>대화 정보</h2>
        <button id="info-panel-close-btn">×</button>
    </div>
    <div class="info-panel-tabs">
        <button class="tab-link active" data-tab="persona">프로필</button>
        <button class="tab-link" data-tab="usernote">노트</button>
        <button class="tab-link" data-tab="export">저장/내보내기</button>
    </div>
    <div class="info-panel-body">
        <div id="persona-content" class="tab-content active">
            <div class="content-header">
                <h3 id="persona-name"></h3>
                <button id="edit-persona-btn" class="panel-edit-btn">✏️</button>
            </div>
            <div id="persona-view-mode"><div id="persona-info" class="content-box"></div></div>
            <div id="persona-edit-mode" hidden>
                <textarea id="persona-textarea"></textarea>
                <div class="edit-actions">
                    <button id="save-persona-btn" class="panel-save-btn">저장</button>
                    <button id="cancel-persona-btn" class="panel-cancel-btn">취소</button>
                </div>
            </div>
        </div>
        <div id="usernote-content" class="tab-content">
             <div class="content-header">
                <h3>유저노트</h3>
                <button id="edit-usernote-btn" class="panel-edit-btn">✏️</button>
            </div>
            <div id="usernote-view-mode"><div id="usernote-info" class="content-box"></div></div>
            <div id="usernote-edit-mode" hidden>
                <textarea id="usernote-textarea"></textarea>
                <div class="edit-actions">
                    <button id="save-usernote-btn" class="panel-save-btn">저장</button>
                    <button id="cancel-usernote-btn" class="panel-cancel-btn">취소</button>
                </div>
            </div>
        </div>
        <div id="export-content" class="tab-content">
            <a href="#" id="download-html-btn" class="panel-action-link">💾 HTML 로 저장</a>
            <a href="#" id="download-json-btn" class="panel-action-link">📄 JSON 으로 저장</a>
            <a href="#" id="download-txt-btn" class="panel-action-link">📄 TXT 로 저장</a>
        </div>
    </div>
</div>
<div id="toast-notification"><p class="toast-message"></p></div>`;

    // --- CSS 스타일 템플릿 ---
    const VIEWER_CSS = `
:root { --primary-color: #4A90E2; --primary-hover-color: #357ABD; --background-color: #FFFFFF; --surface-color: #F5F7FA; --border-color: #EAECEF; --text-primary-color: #212529; --text-secondary-color: #6C757D; }
* { box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; margin: 0; background-color: var(--background-color); color: var(--text-primary-color); transition: background-color 0.2s, color 0.2s; display: flex; flex-direction: column; min-height: 100vh; }
.main-header { background-color: var(--surface-color); border-bottom: 1px solid var(--border-color); padding: 10px 15px; position: sticky; top: 0; z-index: 100; }
.header-content-wrapper { display: flex; justify-content: space-between; align-items: center; max-width: 800px; margin: 0 auto; }
.main-header h1 { font-size: 20px; margin: 0; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-grow: 1; text-align: left; }
.action-btn { background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-primary-color); padding: 8px; }
.chat-log-container { display: flex; flex-direction: column; gap: 12px; padding: 20px 15px; max-width: 800px; width: 100%; margin: 0 auto; flex-grow: 1; }
.message-bubble { padding: 16px; border-radius: 18px; max-width: 95%; line-height: 1.6; word-wrap: break-word; }
.message-bubble p:first-child { margin-top: 0; } .message-bubble p:last-child { margin-bottom: 0; }
.message-content { cursor: pointer; white-space: pre-wrap; }
.user-message { align-self: flex-end; background-color: #4A90E2; color: #fff; border-bottom-right-radius: 4px; }
.assistant-message { align-self: flex-start; background-color: var(--surface-color); border: 1px solid var(--border-color); color: var(--text-primary-color); border-bottom-left-radius: 4px; }
.message-bubble.editing { width: 100%; max-width: 100%; }
.editable-textarea { display: block; width: 100%; background: var(--background-color); border: 1px solid var(--primary-color); border-radius: 4px; color: inherit; font-family: inherit; font-size: 1em; line-height: 1.6; padding: 8px; resize: vertical; outline: none; }
.edit-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
.edit-actions button { background-color: var(--surface-color); border: 1px solid var(--border-color); border-radius: 6px; padding: 4px 10px; cursor: pointer; }
.title-edit-input { width: 70%; font-size: 20px; font-weight: bold; text-align: left; border: 1px solid var(--primary-color); border-radius: 5px; padding: 5px; outline: none; background-color: var(--surface-color); color: var(--text-primary-color); }
#info-panel, #info-panel-overlay { position: fixed; top: 0; right: 0; height: 100%; transition: transform 0.3s ease-in-out, opacity 0.3s ease-in-out; }
#info-panel-overlay { width: 100%; background-color: rgba(0, 0, 0, 0.5); z-index: 999; opacity: 0; pointer-events: none; }
#info-panel { width: 90%; max-width: 350px; background-color: var(--surface-color); z-index: 1001; display: flex; flex-direction: column; box-shadow: -2px 0 10px rgba(0,0,0,0.1); transform: translateX(100%); }
#info-panel.is-open { transform: translateX(0); }
#info-panel-overlay.is-open { opacity: 1; pointer-events: auto; }
.info-panel-header { padding: 15px 20px; border-bottom: 1px solid var(--border-color); flex-shrink: 0; }
.info-panel-header { display: flex; justify-content: space-between; align-items: center; }
#info-panel-close-btn { font-size: 24px; background: none; border: none; cursor: pointer; color: var(--text-primary-color); }
.info-panel-tabs { display: flex; border-bottom: 1px solid var(--border-color); flex-shrink: 0; }
.tab-link { flex: 1; padding: 12px; text-align: center; background: none; border: none; cursor: pointer; font-size: 15px; border-bottom: 3px solid transparent; color: var(--text-secondary-color); }
.tab-link.active { font-weight: bold; color: var(--primary-color); border-bottom-color: var(--primary-color); }
.info-panel-body { padding: 20px; overflow-y: auto; flex-grow: 1; }
.tab-content { display: none; }
.tab-content.active { display: block; }
.content-box { background-color: var(--background-color); border: 1px solid var(--border-color); padding: 15px; border-radius: 8px; white-space: pre-wrap; word-break: break-word; min-height: 100px; }
.content-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
#persona-name, .content-header h3 { margin: 0; font-size: 16px; }
.panel-edit-btn { font-size: 18px; background: none; border: none; cursor: pointer; color: var(--text-primary-color); }
#persona-edit-mode textarea, #usernote-edit-mode textarea { width: 100%; min-height: 150px; border: 1px solid var(--primary-color); border-radius: 8px; padding: 10px; resize: vertical; background-color: var(--background-color); color: var(--text-primary-color); }
#persona-edit-mode .edit-actions, #usernote-edit-mode .edit-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px; }
.panel-save-btn, .panel-cancel-btn { padding: 6px 12px; border-radius: 6px; border: none; cursor: pointer; }
.panel-save-btn { background-color: var(--primary-color); color: white; }
.panel-cancel-btn { background-color: #e0e0e0; }
.panel-action-link { display: block; padding: 15px 20px; text-decoration: none; color: var(--text-primary-color); border-radius: 8px; margin-bottom: 10px; background-color: var(--background-color); transition: background-color 0.2s; border: 1px solid var(--border-color); }
.panel-action-link:hover { background-color: #e9ecef; }
.site-footer { text-align: center; padding: 15px; font-size: 12px; color: var(--text-secondary-color); }
#toast-notification { position: fixed; bottom: -50px; left: 50%; transform: translateX(-50%); background-color: rgba(0,0,0,0.8); color: white; padding: 12px 20px; border-radius: 20px; z-index: 2000; opacity: 0; transition: opacity 0.3s, bottom 0.3s; pointer-events: none; }
#toast-notification.show { bottom: 30px; opacity: 1; }`;

    // --- 자바스크립트 로직 템플릿 (마크다운 파서 통합) ---
    const VIEWER_JS = function() {
        // --- 커스텀 마크다운 파서 (내장) ---
        function parseInlineMarkdown(text) {
            let htmlLine = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            htmlLine = htmlLine.replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" style="max-width: 100%; border-radius: 8px;">');
            htmlLine = htmlLine.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');
            htmlLine = htmlLine.replace(/(\*\*\*|__)(.*?)\1/g, '<strong><em>$2</em></strong>');
            htmlLine = htmlLine.replace(/(\*\*)(.*?)\1/g, '<strong>$2</strong>');
            htmlLine = htmlLine.replace(/(\*|_)(.*?)\1/g, '<span style="color: #85837D;">$2</span>');
            htmlLine = htmlLine.replace(/~~(.*?)~~/g, '<del>$1</del>');
            htmlLine = htmlLine.replace(/\^\^(.*?)\^\^/g, '<mark>$1</mark>');
            htmlLine = htmlLine.replace(/`(.*?)`/g, '<code style="font-weight: bold; background-color: rgba(0,0,0,0.05); padding: 2px 4px; border-radius: 4px;">$1</code>');
            return htmlLine;
        }
        function parseMarkdown(text) {
            if (!text) return '';
            const lines = text.split('\n');
            const htmlBlocks = [];
            let inCodeBlock = false;
            let codeLang = '';
            let codeLines = [];
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line.trim().startsWith('```')) {
                    if (inCodeBlock) {
                        const langHeader = codeLang ? `<div style="background-color: #4a4a4a; color: #e0e0e0; padding: 5px 10px; border-top-left-radius: 6px; border-top-right-radius: 6px;">${codeLang}</div>` : '';
                        htmlBlocks.push(`<div style="background-color: #2d2d2d; border-radius: 6px; margin: 1em 0;">${langHeader}<pre style="margin: 0;"><code style="color:#f1f1f1; padding: 10px; display: block; white-space: pre-wrap; word-wrap: break-word;">${codeLines.join('\n')}</code></pre></div>`);
                        inCodeBlock = false; codeLines = []; codeLang = '';
                    } else {
                        inCodeBlock = true;
                        codeLang = line.trim().substring(3).trim();
                    }
                    continue;
                }
                if (inCodeBlock) {
                    codeLines.push(line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
                    continue;
                }
                if (line.trim().startsWith('>')) {
                    const quoteLines = [line.trim().substring(1).trim()];
                    while (i + 1 < lines.length && lines[i + 1].trim().startsWith('>')) {
                        i++;
                        quoteLines.push(lines[i].trim().substring(1).trim());
                    }
                    htmlBlocks.push(`<blockquote style="border-left: 5px solid #ccc; padding: 10px; margin: 1em 0; background-color: var(--surface-color);">${parseInlineMarkdown(quoteLines.join('\n'))}</blockquote>`);
                    continue;
                }
                const hMatch = line.match(/^(#+) (.*)$/);
                if (hMatch) {
                    const level = hMatch[1].length;
                    htmlBlocks.push(`<h${level} style="font-weight: bold; margin: 0.5em 0;">${parseInlineMarkdown(hMatch[2])}</h${level}>`);
                    continue;
                }
                if (/^(\*\*\*|---|___)$/.test(line.trim())) {
                    htmlBlocks.push('<hr style="margin: 1em 0;">');
                    continue;
                }
                if (line.trim() !== '') {
                    htmlBlocks.push(`<p style="margin: 0;">${parseInlineMarkdown(line)}</p>`);
                } else if (htmlBlocks.length > 0 && !htmlBlocks[htmlBlocks.length - 1].endsWith('<br>')) {
                     htmlBlocks.push('<br>');
                }
            }
            return htmlBlocks.join('').replace(/<br>\s*<br>/g, '<br>');
        }

        // --- 메인 뷰어 로직 ---
        document.addEventListener('DOMContentLoaded', () => {
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
                personaInfoEl.innerHTML = parseMarkdown(window.initialChatData.userPersona.information || '정보 없음');
                personaTextarea.value = window.initialChatData.userPersona.information || '';
                usernoteInfoEl.innerHTML = parseMarkdown(window.initialChatData.userNote || '유저노트 없음');
                usernoteTextarea.value = window.initialChatData.userNote || '';
            }

            function createMessageBubble(message, index) {
                const bubble = document.createElement('div');
                bubble.className = `message-bubble ${message.role === 'user' ? 'user' : 'assistant'}-message`;
                bubble.dataset.index = index;
                bubble.dataset.content = message.content;

                const viewContent = document.createElement('div');
                viewContent.className = 'message-content';
                viewContent.innerHTML = parseMarkdown(message.content);

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

                const autoResizeTextarea = (el) => { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; };
                const enterEditMode = () => {
                    if (activeEditingIndex !== null) { showToast('다른 항목 수정을 먼저 완료하세요.'); return; }
                    activeEditingIndex = index;
                    bubble.classList.add('editing');
                    viewContent.style.display = 'none';
                    editContainer.style.display = 'block';
                    autoResizeTextarea(editTextarea);
                    editTextarea.focus();
                };
                const exitEditMode = (save) => {
                    if (save) {
                        const newContent = editTextarea.value;
                        viewContent.innerHTML = parseMarkdown(newContent);
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
                    userPersona: { name: personaNameEl.textContent, information: personaTextarea.value },
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
                    const originalValue = type === 'persona' ? window.initialChatData.userPersona.information : window.initialChatData.userNote;
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
                        infoEl.innerHTML = parseMarkdown(newValue);
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
<title>${currentData.title.replace(/</g, '&lt;')}</title>
<style>${window.CSS_TEMPLATE}</style>
</head>
<body class="sticky-footer-layout">
${window.HTML_TEMPLATE}
<script>
    window.initialChatData = ${JSON.stringify(currentData, null, 2)};
    window.HTML_TEMPLATE = ${JSON.stringify(window.HTML_TEMPLATE)};
    window.CSS_TEMPLATE = ${JSON.stringify(window.CSS_TEMPLATE)};
    window.VIEWER_JS_SOURCE = ${JSON.stringify(window.VIEWER_JS_SOURCE)};
<\/script>
<script>
    (new Function(window.VIEWER_JS_SOURCE))();
<\/script>
</body>
</html>`;
                    download(regeneratedHtml, `${currentData.title.replace(/[\\/:*?"<>|]/g, '')}.html`, 'text/html;charset=utf-8');
                });
                document.getElementById('download-json-btn').addEventListener('click', e => { e.preventDefault(); const d = getCurrentDataFromDOM(); download(JSON.stringify(d, null, 2), `${d.title.replace(/[\\/:*?"<>|]/g, '')}.json`, 'application/json;charset=utf-8'); });
                document.getElementById('download-txt-btn').addEventListener('click', e => { e.preventDefault(); const d = getCurrentDataFromDOM(); const c = d.messages.map(m => `${m.role.toUpperCase()}:\\n${m.content}`).join('\\n\\n'); download(c, `${d.title.replace(/[\\/:*?"<>|]/g, '')}.txt`, 'text/plain;charset=utf-8'); });
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
    function getCookie(name) { const m = document.cookie.match(new RegExp(`(?:^|; )\\s*${name.replace(/([.$?*|{}()\[\]\\\/+^])/g, "\\$1")}=([^;]*)`)); return m ? decodeURIComponent(m[1]) : null; }
    function downloadFile(content, filename, contentType) { const b = new Blob([content], { type: contentType }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href); }

    function getUrlInfo() {
        const match = window.location.pathname.match(/\/u\/[a-f0-9-]+\/c\/([a-f0-9-]+)/);
        return match ? { chatroomId: match[1] } : {};
    }
    async function apiRequest(url, token) {
        const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } });
        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        return (await response.json()).data;
    }

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
            .then(list => list.characterChatProfiles);

        const [chatroomData, messagesData, personaList] = await Promise.all([chatroomPromise, messagesPromise, personaListPromise]);

        const messages = (messagesData?.list || []).reverse().map(m => ({ role: m.role, content: m.content }));
        const currentPersonaId = chatroomData?.chatProfile?._id;
        const currentPersona = currentPersonaId ? personaList.find(p => p._id === currentPersonaId) : null;

        return {
            title: chatroomData?.title || 'Unknown Chat',
            userPersona: {
                name: currentPersona?.name || '적용된 프로필 없음',
                information: currentPersona?.information || ''
            },
            userNote: chatroomData?.character?.userNote?.content || '',
            messages: messages
        };
    }

    async function createMenuButton() {
        try {
            const menuContainer = await waitForElement('.css-uxwch2');
            if (document.getElementById('html-viewer-saver-v3.1')) return;

            const button = document.createElement('div');
            button.id = 'html-viewer-saver-v3.1';
            button.className = 'css-1dib65l';
            button.style.cssText = "display: flex; cursor: pointer; padding: 10px; margin-top: 8px;";
            button.innerHTML = `<p class="css-1xke5yy"><span style="padding-right: 6px;">📄</span>HTML 뷰어 저장 v3.1</p>`;

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
        if (document.querySelector('.css-uxwch2')) {
            createMenuButton();
            obs.disconnect();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();
