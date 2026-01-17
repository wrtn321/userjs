// ==UserScript==
// @name         크랙 html 저장
// @namespace    http://tampermonkey.net/
// @version      2.11
// @description  채팅로그를 읽기 전용 HTML로 저장합니다.
// @author       뤼붕이
// @match        https://crack.wrtn.ai/stories/*/episodes/*
// @downloadURL  https://github.com/wrtn321/userjs/raw/refs/heads/main/htmlviewer.user.js
// @updateURL    https://github.com/wrtn321/userjs/raw/refs/heads/main/htmlviewer.user.js
// @grant        GM_xmlhttpRequest
// @require      https://cdn.jsdelivr.net/npm/dompurify@3.0.11/dist/purify.min.js
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // ===================================================================================
    // PART 1: UI 및 HTML 생성 로직 
    // ===================================================================================
    function generateFullHtmlPage(chatData) {
        function escapeHtml(unsafe) { if (typeof unsafe !== 'string') return ''; return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
        function safeUrl(url) {
            if (typeof url !== 'string') return '#invalid-url';
            url = url.trim();
            try { const parsed = new URL(url, 'https://example.com'); if (['http:', 'https:'].includes(parsed.protocol)) return parsed.href; } catch (e) {}
            return '#invalid-url';
        }
        function parseInlineMarkdown(text) {
            let htmlLine = text;
            htmlLine = htmlLine.replace(/!\[(.*?)\]\((.*?)\)/g, (match, alt, src) => `<img src="${escapeHtml(safeUrl(src))}" alt="${escapeHtml(alt)}" style="max-width: 100%; border-radius: 8px;">`);
            htmlLine = htmlLine.replace(/(\*\*\*|___|\*\*|__)(.+?)\1/g, '<strong>$2</strong>');
            htmlLine = htmlLine.replace(/(\*|_)(.+?)\1/g, '<em style="font-style:normal;color:#737373;">$2</em>');
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
                    const lang = line.trim().substring(3).trim(); const codeLines = []; i++;
                    while (i < lines.length && !lines[i].trim().startsWith('```')) { codeLines.push(lines[i]); i++; }
                    const langHeader = lang ? `<div style="background-color: #4a4a4a; color: #e0e0e0; padding: 5px 10px; border-top-left-radius: 6px; border-top-right-radius: 6px;">${escapeHtml(lang)}</div>` : '';
                    htmlBlocks.push(`<div style="background-color: #2d2d2d; border-radius: 6px; margin: 1em 0;">${langHeader}<pre style="margin: 0;"><code style="color:#f1f1f1; padding: 10px; display: block; white-space: pre-wrap; word-wrap: break-word;">${escapeHtml(codeLines.join('\n'))}</code></pre></div>`);
                    continue;
                }
                if (line.includes('|') && i + 1 < lines.length && lines[i+1].includes('-')) {
                     if (lines[i+1].trim().replace(/\|/g, '').replace(/-/g, '').replace(/:/g, '').replace(/\s/g, '') === '') {
                        const headers = line.split('|').slice(1, -1).map(h => `<th>${parseInlineMarkdown(escapeHtml(h.trim()))}</th>`).join('');
                        const bodyLines = []; i += 2;
                        while (i < lines.length && lines[i].includes('|')) { bodyLines.push(lines[i]); i++; }
                        i--;
                        const rows = bodyLines.map(rowLine => { const cells = rowLine.split('|').slice(1, -1).map(c => `<td>${parseInlineMarkdown(escapeHtml(c.trim()))}</td>`).join(''); return `<tr>${cells}</tr>`; }).join('');
                        htmlBlocks.push(`<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`);
                        continue;
                    }
                }
                const hMatch = line.match(/^(#+) (.*)$/);
                if (hMatch) {
                    const level = hMatch[1].length;
                    htmlBlocks.push(`<h${level} style="font-weight: bold; font-size: ${2.0 - level * 0.2}em; margin: 0;">${parseInlineMarkdown(escapeHtml(hMatch[2]))}</h${level}>`);
                    continue;
                }
                if (/^(---|___|\*\*\*)$/.test(line.trim())) { htmlBlocks.push('<hr>'); continue; }
                if (line.trim() !== '') { htmlBlocks.push(`<p>${parseInlineMarkdown(escapeHtml(line))}</p>`); }
            }
            return htmlBlocks.join('');
        }

        const messagesHtml = chatData.messages.map(msg => {
            const safeHtml = (typeof DOMPurify !== 'undefined') ? DOMPurify.sanitize(parseMarkdown(msg.content)) : escapeHtml(msg.content).replace(/\n/g, '<br>');
            return `<div class="message-bubble ${msg.role === 'user' ? 'user' : 'assistant'}-message">${safeHtml}</div>`;
        }).join('');

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
        .info-panel-body h3 {margin-top:0;}
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
    // PART 2: API 연동 로직
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
                method: "GET", url: url,
                headers: { 'Authorization': `Bearer ${token}`, 'platform': 'web', 'x-wrtn-id': wrtnId || '' },
                onload: (res) => {
                    if (res.status >= 200 && res.status < 300) {
                        try { const data = JSON.parse(res.responseText); resolve(data.data !== undefined ? data.data : data); }
                        catch (e) { reject(new Error("JSON 파싱 실패")); }
                    } else { reject(new Error(`API 오류: ${res.status}`)); }
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
        const token = getCookie('access_token');
        const { chatroomId } = getUrlInfo();
        if (!token || !chatroomId) throw new Error('인증 토큰이나 채팅방 ID를 찾을 수 없습니다.');

        const [cD, mD] = await Promise.all([
            apiRequest(`${API_BASE}/crack-gen/v3/chats/${chatroomId}`, token),
            apiRequest(`${API_BASE}/crack-gen/v3/chats/${chatroomId}/messages?limit=2000`, token)
        ]);

        return {
            title: cD?.story?.title || cD?.title || 'Unknown Chat',
            userNote: cD?.story?.userNote?.content || '',
            messages: (mD?.messages || []).reverse().map(m => ({
                role: m.role === 'assistant' ? 'assistant' : 'user',
                content: m.content
            }))
        };
    }

    function downloadFile(content, filename) {
        const b = new Blob([content], { type: 'text/html;charset=utf-8' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }

    // ===================================================================================
    // PART 3: 스크립트 실행 (선택자 업데이트)
    // ===================================================================================

    function waitForElement(selector) {
        return new Promise(resolve => {
            if (document.querySelector(selector)) {
                return resolve(document.querySelector(selector));
            }
            const observer = new MutationObserver(() => {
                if (document.querySelector(selector)) {
                    observer.disconnect();
                    resolve(document.querySelector(selector));
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        });
    }

    async function createMenuButton() {
        // [수정됨] 버튼을 추가할 컨테이너의 선택자를 새 UI 구조에 맞게 변경
        const container = await waitForElement('.py-4.overflow-y-auto.scrollbar > .px-2:first-of-type');
        if (!container || document.getElementById('html-save-btn-v2-restore')) return;

        const btnWrapper = document.createElement('div');
        btnWrapper.id = 'html-save-btn-v2-restore';
        // [수정됨] 새로운 UI 디자인에 맞는 클래스 적용
        btnWrapper.className = 'px-2.5 h-4 box-content py-[18px]';
        btnWrapper.innerHTML = `
            <button class="w-full flex h-4 items-center justify-between typo-110-16-med space-x-2 [&amp;_svg]:fill-icon_tertiary ring-offset-4 ring-offset-sidebar" style="cursor: pointer;">
                <span class="flex space-x-2 items-center">
                    <span style="font-size: 16px;">📄</span>
                    <span class="btn-text whitespace-nowrap overflow-hidden text-ellipsis typo-text-sm_leading-none_medium">HTML 저장</span>
                </span>
            </button>
        `;

        btnWrapper.onclick = async () => {
            const btnText = btnWrapper.querySelector('.btn-text');
            const originalText = btnText.textContent;
            try {
                btnText.textContent = '불러오는 중...';
                btnWrapper.style.pointerEvents = 'none';
                const chatData = await fetchAllChatData();
                const finalHtml = generateFullHtmlPage(chatData);
                downloadFile(finalHtml, `${chatData.title.replace(/[\\/:*?"<>|]/g, '')}.html`);
                btnText.textContent = '저장 완료!';
                setTimeout(() => {
                    btnText.textContent = originalText;
                    btnWrapper.style.pointerEvents = 'auto';
                }, 2000);
            } catch (e) {
                alert(`오류 발생: ${e.message}`);
                btnText.textContent = originalText;
                btnWrapper.style.pointerEvents = 'auto';
            }
        };
        // '채팅방 설정' 메뉴 그룹의 하단에 버튼을 추가합니다.
        container.appendChild(btnWrapper);
    }

    // 스크립트 시작
    // 페이지가 완전히 로드된 후 버튼 생성을 시도합니다.
    window.addEventListener('load', () => {
        createMenuButton();

        // 페이지 이동 등으로 인해 UI가 다시 렌더링될 경우를 대비해 MutationObserver를 사용합니다.
        const observer = new MutationObserver(() => {
            if (!document.getElementById('html-save-btn-v2-restore')) {
                createMenuButton();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    });

})();
