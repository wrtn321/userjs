// ==UserScript==
// @name         크랙 html 저장
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  크랙의 채팅로그를 읽기 전용 HTML로 저장합니다.
// @author       뤼붕이
// @match        https://crack.wrtn.ai/u/*/c/*
// @grant        none
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // ===================================================================================
    // PART 1: '읽기 전용' HTML 페이지 생성을 위한 모든 로직
    // ===================================================================================

    function generateFullHtmlPage(chatData) {
        // --- 보안 및 마크다운 파싱 함수 (HTML 생성에 필수) ---
        function escapeHtml(unsafe) { if (typeof unsafe !== 'string') return ''; return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
        function safeUrl(url) { try { const parsedUrl = new URL(url, 'https://example.com'); if (['http:', 'https:'].includes(parsedUrl.protocol)) { return url; } } catch (e) { return '#invalid-url'; } return '#unsafe-protocol'; }
        function parseInlineMarkdown(text) {
            let htmlLine = text;
            htmlLine = htmlLine.replace(/!\[(.*?)\]\((.*?)\)/g, (match, alt, src) => `<img src="${escapeHtml(safeUrl(src))}" alt="${escapeHtml(alt)}" style="max-width: 100%; border-radius: 8px;">`);
            htmlLine = htmlLine.replace(/(\*\*\*|___|\*\*|__)(.+?)\1/g, '<strong>$2</strong>');
            htmlLine = htmlLine.replace(/(\*|_)(.+?)\1/g, '<em style="font-style:normal;color:#9a9a9a;">$2</em>');
            htmlLine = htmlLine.replace(/~~(.+?)~~/g, '<del>$1</del>');
            htmlLine = htmlLine.replace(/\^\^(.+?)\^\^/g, '<mark>$1</mark>');
            htmlLine = htmlLine.replace(/`(.+?)`/g, (match, code) => `<code style="font-weight: bold; background-color: rgba(0,0,0,0.05); padding: 2px 4px; border-radius: 4px;">${escapeHtml(code)}</code>`);
            return htmlLine;
        }
        function parseMarkdown(text) {
            if (!text) return '';
            const lines = text.split('\n');
            const htmlBlocks = [];
            for (let i = 0; i < lines.length; i++) {
                let line = lines[i];
                if (line.trim().startsWith('```')) {
                    const lang = line.trim().substring(3).trim();
                    const codeLines = [];
                    i++;
                    while (i < lines.length && !lines[i].trim().startsWith('```')) { codeLines.push(lines[i]); i++; }
                    const langHeader = lang ? `<div style="background-color: #4a4a4a; color: #e0e0e0; padding: 5px 10px; border-top-left-radius: 6px; border-top-right-radius: 6px;">${escapeHtml(lang)}</div>` : '';
                    htmlBlocks.push(`<div style="background-color: #2d2d2d; border-radius: 6px; margin: 1em 0;">${langHeader}<pre style="margin: 0;"><code style="color:#f1f1f1; padding: 10px; display: block; white-space: pre-wrap; word-wrap: break-word;">${escapeHtml(codeLines.join('\n'))}</code></pre></div>`);
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
                    htmlBlocks.push(`<p>${parseInlineMarkdown(escapeHtml(line))}</p>`);
                }
            }
            return htmlBlocks.join('');
        }

        const messagesHtml = chatData.messages.map(msg => `
            <div class="message-bubble ${msg.role === 'user' ? 'user' : 'assistant'}-message">
                ${parseMarkdown(msg.content)}
            </div>
        `).join('');

        // --- 최종 HTML 페이지 템플릿 ---
        return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(chatData.title)}</title>
    <style>
        :root{--primary-color:#4A90E2;--background-color:#fff;--surface-color:#f5f7fa;--border-color:#eaecef;--text-primary-color:#212529;--text-secondary-color:#6c757d}
        *{box-sizing:border-box}
        body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;margin:0;background-color:var(--background-color);color:var(--text-primary-color);display:flex;flex-direction:column;min-height:100vh}
        .main-header{background-color:var(--surface-color);border-bottom:1px solid var(--border-color);padding:10px 15px;position:sticky;top:0;z-index:100}
        .header-content-wrapper{display:flex;justify-content:space-between;align-items:center;width:100%}
        .main-header h1{font-size:20px;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-grow:1;text-align:center;padding:0 40px}
        .action-btn{background:0 0;border:none;font-size:24px;cursor:pointer;color:var(--text-primary-color);padding:8px}
        .chat-log-container{display:flex;flex-direction:column;gap:12px;padding:20px 15px;max-width:800px;width:100%;margin:0 auto;flex-grow:1}
        .message-bubble{padding:16px;border-radius:18px;max-width:95%;line-height:1.6;word-wrap:break-word}
        .message-bubble p{margin:0 0 14px 0 !important} .message-bubble p:last-child{margin:0 !important}
        .user-message{align-self:flex-end;background-color:#61605a;color:#fff;border-bottom-right-radius:4px}
        .user-message p em{color:#C7C5BD !important;}
        .assistant-message{align-self:flex-start;background-color:var(--surface-color);border:1px solid var(--border-color);color:var(--text-primary-color);border-bottom-left-radius:4px}
        #info-panel,#info-panel-overlay{position:fixed;top:0;right:0;height:100%;transition:transform .3s ease-in-out,opacity .3s ease-in-out}
        #info-panel-overlay{width:100%;background-color:rgba(0,0,0,.5);z-index:999;opacity:0;pointer-events:none}
        #info-panel{width:90%;max-width:350px;background-color:var(--surface-color);z-index:1001;display:flex;flex-direction:column;box-shadow:-2px 0 10px rgba(0,0,0,.1);transform:translateX(100%)}
        #info-panel.is-open{transform:translateX(0)}
        #info-panel-overlay.is-open{opacity:1;pointer-events:auto}
        .info-panel-header{display:flex;justify-content:space-between;align-items:center;padding:0 20px;min-height:60px;border-bottom:1px solid var(--border-color);flex-shrink:0}
        #info-panel-close-btn{font-size:24px;background:0 0;border:none;cursor:pointer;color:var(--text-primary-color)}
        .info-panel-body{padding:20px;overflow-y:auto;flex-grow:1;min-height:0}
        .content-box{background-color:var(--background-color);border:1px solid var(--border-color);padding:15px;border-radius:8px;white-space:pre-wrap;word-break:break-word;min-height:100px}
        .site-footer{text-align:center;padding:15px;font-size:12px;color:var(--text-secondary-color)}
        table{border-collapse:collapse;width:100%;margin:1em 0;border:1px solid #c7c5bd}
        th,td{border:1px solid #c7c5bd;padding:8px;text-align:left}
    </style>
</head>
<body>
    <header class="main-header">
        <div class="header-content-wrapper">
            <h1>${escapeHtml(chatData.title)}</h1>
            <button id="hamburger-menu-btn" class="action-btn" title="메뉴 열기">☰</button>
        </div>
    </header>
    <main class="chat-log-container">${messagesHtml}</main>
    <footer class="site-footer"><p>© ${new Date().getFullYear()}. All rights reserved.</p></footer>

    <div id="info-panel-overlay"></div>
    <div id="info-panel">
        <div class="info-panel-header">
            <h2>대화 정보</h2>
            <button id="info-panel-close-btn">×</button>
        </div>
        <div class="info-panel-body">
            <h3>유저노트</h3>
            <div class="content-box">${escapeHtml(chatData.userNote).replace(/\n/g, '<br>')}</div>
        </div>
    </div>

    <script>
        document.addEventListener('DOMContentLoaded', () => {
            const openBtn = document.getElementById('hamburger-menu-btn');
            const closeBtn = document.getElementById('info-panel-close-btn');
            const overlay = document.getElementById('info-panel-overlay');
            const panel = document.getElementById('info-panel');

            const openPanel = () => { panel.classList.add('is-open'); overlay.classList.add('is-open'); };
            const closePanel = () => { panel.classList.remove('is-open'); overlay.classList.remove('is-open'); };

            openBtn.addEventListener('click', openPanel);
            closeBtn.addEventListener('click', closePanel);
            overlay.addEventListener('click', closePanel);
        });
    <\/script>
</body>
</html>`;
    }

    // ===================================================================================
    // PART 2: WRTN.AI 사이트 로직
    // ===================================================================================
    function waitForElement(selector) { return new Promise(resolve => { const i = setInterval(() => { const e = document.querySelector(selector); if (e) { clearInterval(i); resolve(e); } }, 100); }); }
    function getCookie(name) { const nameEQ = name + "="; const ca = document.cookie.split(';'); for(let i=0;i < ca.length;i++) { let c = ca[i]; while (c.charAt(0)==' ') c = c.substring(1,c.length); if (c.indexOf(nameEQ) == 0) return decodeURIComponent(c.substring(nameEQ.length,c.length)); } return null; }
    function downloadFile(content, filename, contentType) { const b = new Blob([content], { type: contentType }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href); }
    function getUrlInfo() { const pathParts = window.location.pathname.split('/'); const cIndex = pathParts.indexOf('c'); if (cIndex > -1 && cIndex + 1 < pathParts.length) { return { chatroomId: pathParts[cIndex + 1] }; } return {}; }
    async function apiRequest(url, token) { const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'applicationjson' } }); if (!response.ok) throw new Error(`API Error: ${response.status}`); return (await response.json()).data; }
    async function fetchAllChatData() { const token = getCookie('access_token'); const { chatroomId } = getUrlInfo(); if (!token || !chatroomId) throw new Error('토큰 또는 채팅방 ID를 찾을 수 없습니다.'); const API_BASE = "https://contents-api.wrtn.ai"; const chatroomPromise = apiRequest(`${API_BASE}/character-chat/api/v2/chat-room/${chatroomId}`, token); const messagesPromise = apiRequest(`${API_BASE}/character-chat/api/v2/chat-room/${chatroomId}/messages?limit=2000`, token); const [chatroomData, messagesData] = await Promise.all([chatroomPromise, messagesPromise]); const messages = (messagesData?.list || []).reverse().map(m => ({ role: m.role, content: m.content })); return { title: chatroomData?.title || 'Unknown Chat', userNote: chatroomData?.character?.userNote?.content || '', messages: messages }; }
    async function createMenuButton() { try { const menuContainer = await waitForElement('.css-uxwch2'); const buttonId = 'html-readonly-viewer-saver-ui'; if (document.getElementById(buttonId)) return; const button = document.createElement('div'); button.id = buttonId; button.className = 'css-1dib65l'; button.style.cssText = "display: flex; cursor: pointer; padding: 10px;"; button.innerHTML = `<p class="css-1xke5yy"><span style="padding-right: 6px;">📄</span>HTML 저장</p>`; button.addEventListener('click', async () => { const p = button.querySelector('p'); const originalText = p.innerHTML; try { p.textContent = '생성 중...'; button.style.pointerEvents = 'none'; const chatData = await fetchAllChatData(); const finalHtml = generateFullHtmlPage(chatData); const fileName = `${chatData.title.replace(/[\\/:*?"<>|]/g, '')}.html`; downloadFile(finalHtml, fileName, 'text/html;charset=utf-8'); } catch (error) { console.error('HTML 생성 실패:', error); alert(`오류가 발생했습니다: ${error.message}`); } finally { p.innerHTML = originalText; button.style.pointerEvents = 'auto'; } }); menuContainer.appendChild(button); } catch (e) { console.error('버튼 생성 실패:', e); } }
    const observer = new MutationObserver((_, obs) => { if (document.querySelector('.css-uxwch2')) { createMenuButton(); obs.disconnect(); } }); observer.observe(document.body, { childList: true, subtree: true });

})();
