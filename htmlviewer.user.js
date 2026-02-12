// ==UserScript==
// @name         크랙 html 저장
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  채팅로그를 HTML로 저장
// @author       뤼붕이
// @match        https://crack.wrtn.ai/stories/*/episodes/*
// @downloadURL  https://raw.githubusercontent.com/wrtn321/userjs/main/htmlviewer.user.js
// @updateURL    https://raw.githubusercontent.com/wrtn321/userjs/main/htmlviewer.user.js
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
        // --- HTML 생성을 위한 유틸리티 함수 ---
        function escapeHtml(unsafe) { if (typeof unsafe !== 'string') return ''; return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
        function safeUrl(url) { if (typeof url !== 'string') return '#invalid-url'; url = url.trim(); try { const parsed = new URL(url, 'https://example.com'); if (['http:', 'https:'].includes(parsed.protocol)) return parsed.href; } catch (e) {} return '#invalid-url'; }

        // --- 마크다운 파싱 로직 (초기 렌더링용) ---
        function parseInlineMarkdown(text) {
            let htmlLine = text;
            htmlLine = htmlLine.replace(/\[\/\/\]:\s*#\s*\((.*?)\)/g, '<span class="hidden-comment" contenteditable="false">[//]: # ($1)</span>');
            // 초기 렌더링용 이미지 파서
            htmlLine = htmlLine.replace(/!\[(.*?)\]\((.*?)\)/g, (match, alt, src) => `<img src="${escapeHtml(safeUrl(src))}" alt="${escapeHtml(alt)}" style="max-width: 100%; border-radius: 8px;">`);
            htmlLine = htmlLine.replace(/(\*\*\*|___|\*\*|__)(.+?)\1/g, '<strong>$2</strong>');
            htmlLine = htmlLine.replace(/(\*|_)(.+?)\1/g, '<em style="font-style:normal;color:#737373;">$2</em>');
            htmlLine = htmlLine.replace(/~~(.+?)~~/g, '<del>$1</del>');
            // 초기 렌더링용 형광펜 파서
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
        const sanitize = (html) => (typeof DOMPurify !== 'undefined') ? DOMPurify.sanitize(html) : html;

        // --- 데이터 처리 및 HTML 렌더링 ---
        const messagesHtml = chatData.messages.map(msg => {
            const rawContent = escapeHtml(msg.content);
            const renderedHtml = sanitize(parseMarkdown(msg.content));
            return `<div class="message-bubble ${msg.role === 'user' ? 'user' : 'assistant'}-message editable-target" data-raw-content="${rawContent}">${renderedHtml}</div>`;
        }).join('');

        const renderPlainTextList = (items) => {
            if (!items || !Array.isArray(items) || items.length === 0) {
                return '<p style="color:#999; font-size:0.9em; text-align:center;">데이터가 없습니다.</p>';
            }
            return `<ul style="padding: 0; margin: 0; list-style: none;">${items.map(item => {
                const titleText = item.title || '';
                const summaryText = item.summary || '';
                const titleHtml = titleText ? `<div class="memory-title editable-target no-markdown" data-raw-content="${escapeHtml(titleText)}">${escapeHtml(titleText)}</div>` : '';
                const summaryHtml = summaryText ? `<div class="memory-summary editable-target no-markdown" data-raw-content="${escapeHtml(summaryText)}">${escapeHtml(summaryText).replace(/\n/g, '<br>')}</div>` : '';
                if (!titleHtml && !summaryHtml) return '';
                return `<li style="margin-bottom: 10px; background: #f8f9fa; padding: 12px; border-radius: 8px; border: 1px solid #eee;">
                    ${titleHtml}${summaryHtml}
                </li>`;
            }).join('')}</ul>`;
        };

        const longTermHtml = renderPlainTextList(chatData.memories.longTerm);
        const shortTermHtml = renderPlainTextList(chatData.memories.shortTerm);
        const relationshipHtml = renderPlainTextList(chatData.memories.relationship);
        const goalHtml = renderPlainTextList(chatData.memories.goal);

        const profileNameRaw = escapeHtml(chatData.userPersona.name || '설정된 이름 없음');
        const profileInfoRaw = escapeHtml(chatData.userPersona.information || '설정된 내용 없음');
        const userNoteRaw = escapeHtml(chatData.userNote || '작성된 유저 노트가 없습니다.');

        // -----------------------------------------------------------------------------------
        // 클라이언트 사이드 스크립트 (HTML 파일 내부에 저장될 스크립트)
        // -----------------------------------------------------------------------------------
        const clientScript = `
        document.addEventListener('DOMContentLoaded', () => {
            // --- 마크다운 파서 (클라이언트용) ---
            const localParser = (() => {
                function escapeHtml(unsafe) { if (typeof unsafe !== 'string') return ''; return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
                function safeUrl(url) { if (typeof url !== 'string') return '#'; url = url.trim(); try { const p = new URL(url, 'https://e.com'); if (['http:', 'https:'].includes(p.protocol)) return p.href; } catch (e) {} return '#'; }

                function parseInline(text) {
                    let h = text;
                    h = h.replace(/\\[\\/\\/\\]:\\s*#\\s*\\((.*?)\\)/g, '<span class="hidden-comment" contenteditable="false">[//]: # ($1)</span>');

                    // [Fix 1] 이미지 파서 수정: 정규식의 불필요한 백슬래시 제거
                    h = h.replace(/!\\\[(.*?)\\\]\\((.*?)\\)/g, (m, alt, src) => \`<img src="\${escapeHtml(safeUrl(src))}" alt="\${escapeHtml(alt)}" style="max-width: 100%; border-radius: 8px;">\`);

                    h = h.replace(/(\\*\\*\\*|___|\\*\\*|__)(.+?)\\1/g, '<strong>$2</strong>');
                    h = h.replace(/(\\*|_)(.+?)\\1/g, '<em style="font-style:normal;color:#737373;">$2</em>');
                    h = h.replace(/~~(.+?)~~/g, '<del>$1</del>');

                    // [Fix 2] 형광펜 파서 수정: ^ 이스케이프 수정 (기존: \\\\^ -> 수정: \\^)
                    h = h.replace(/\\^\\^(.+?)\\^\\^/g, '<mark>$1</mark>');

                    h = h.replace(/\\\`(.+?)\\\`/g, (m, code) => \`<code style="font-weight: bold; background-color: rgba(0,0,0,0.05); padding: 2px 4px; border-radius: 4px;">\${escapeHtml(code)}</code>\`);
                    return h;
                }

                return function parseFull(text) {
                    if (!text) return '';
                    const lines = text.split('\\n');
                    const blocks = [];
                    for (let i = 0; i < lines.length; i++) {
                        let line = lines[i];
                        if (line.trim().startsWith('\`\`\`')) {
                            const lang = line.trim().substring(3).trim(); const code = []; i++;
                            while (i < lines.length && !lines[i].trim().startsWith('\`\`\`')) { code.push(lines[i]); i++; }
                            const h = lang ? \`<div style="background-color: #4a4a4a; color: #e0e0e0; padding: 5px 10px; border-top-left-radius: 6px; border-top-right-radius: 6px;">\${escapeHtml(lang)}</div>\` : '';
                            blocks.push(\`<div style="background-color: #2d2d2d; border-radius: 6px; margin: 1em 0;">\${h}<pre style="margin: 0;"><code style="color:#f1f1f1; padding: 10px; display: block; white-space: pre-wrap; word-wrap: break-word;">\${escapeHtml(code.join('\\n'))}</code></pre></div>\`); continue;
                        }
                        if (line.includes('|') && i + 1 < lines.length && lines[i+1].includes('-') && lines[i+1].trim().replace(/[|:\\\\s-]/g, '') === '') {
                             const headers = line.split('|').slice(1, -1).map(h => \`<th>\${parseInline(escapeHtml(h.trim()))}</th>\`).join('');
                             const body = []; i += 2;
                             while (i < lines.length && lines[i].includes('|')) { body.push(lines[i++]); } i--;
                             const rows = body.map(r => { const c = r.split('|').slice(1, -1).map(c => \`<td>\${parseInline(escapeHtml(c.trim()))}</td>\`).join(''); return \`<tr>\${c}</tr>\`; }).join('');
                             blocks.push(\`<table><thead><tr>\${headers}</tr></thead><tbody>\${rows}</tbody></table>\`); continue;
                        }
                        const hMatch = line.match(/^(#+) (.*)$/);
                        if (hMatch) { blocks.push(\`<h\${hMatch[1].length} style="font-weight: bold; font-size: \${2.0 - hMatch[1].length * 0.2}em; margin: 0;">\${parseInline(escapeHtml(hMatch[2]))}</h\${hMatch[1].length}>\`); continue; }
                        if (/^(---|___|\\*\\*\\*)$/.test(line.trim())) { blocks.push('<hr>'); continue; }
                        if (line.trim() !== '') { blocks.push(\`<p>\${parseInline(escapeHtml(line))}</p>\`); }
                    }
                    return blocks.join('');
                };
            })();

            // --- UI 및 탭 로직 ---
            const panel = document.getElementById('info-panel');
            const overlay = document.getElementById('info-panel-overlay');
            document.getElementById('hamburger-menu-btn').addEventListener('click', () => { panel.classList.add('is-open'); overlay.classList.add('is-open'); });
            const closePanel = () => { panel.classList.remove('is-open'); overlay.classList.remove('is-open'); };
            document.getElementById('info-panel-close-btn').addEventListener('click', closePanel);
            overlay.addEventListener('click', closePanel);

            window.openTab = (tabId) => {
                document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
                document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
                document.getElementById(tabId).classList.add('active');
                event.currentTarget.classList.add('active');
            };

            window.toggleAccordion = (btn) => { btn.classList.toggle('open'); btn.nextElementSibling.classList.toggle('open'); };
            window.openModal = (modalId) => { document.getElementById(modalId).classList.add('show'); };
            window.closeModal = (modalId) => { document.getElementById(modalId).classList.remove('show'); };
            document.querySelectorAll('.modal-overlay').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.remove('show'); }));

            // --- 저장 기능 (플로팅 버튼) ---
            const saveBtn = document.getElementById('floating-save-btn');

            window.saveChangesToFile = () => {
                saveBtn.style.display = 'none';

                const htmlContent = document.documentElement.outerHTML;
                const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = document.title + '.html';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            };

            // --- 인라인 수정 로직 ---
            let currentlyEditing = null;

            function enterEditMode(element) {
                if (currentlyEditing && currentlyEditing.element === element) return;
                if (currentlyEditing) exitEditMode(currentlyEditing.element, true);

                const rawContent = element.dataset.rawContent || element.innerText;
                currentlyEditing = {
                    element: element,
                    originalHTML: element.innerHTML,
                    originalRaw: rawContent
                };

                element.classList.add('is-editing');
                element.contentEditable = 'true';
                element.innerText = rawContent;
                element.focus();

                element.addEventListener('keydown', onKeydownHandler);
                element.addEventListener('blur', onBlurHandler);
            }

            function exitEditMode(element, saveChanges = true) {
                if (!element) return;

                element.removeEventListener('keydown', onKeydownHandler);
                element.removeEventListener('blur', onBlurHandler);

                if (saveChanges) {
                    const newRawContent = element.innerText;
                    element.dataset.rawContent = newRawContent;

                    if (currentlyEditing && newRawContent !== currentlyEditing.originalRaw) {
                        saveBtn.style.display = 'block';
                        saveBtn.classList.add('bounce');
                        setTimeout(() => saveBtn.classList.remove('bounce'), 1000);
                    }

                    if (element.classList.contains('no-markdown')) {
                        element.innerHTML = newRawContent.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\\n/g, '<br>');
                    } else {
                        element.innerHTML = localParser(newRawContent);
                    }
                } else {
                    if (currentlyEditing && currentlyEditing.element === element) {
                        element.innerHTML = currentlyEditing.originalHTML;
                    }
                }

                element.contentEditable = 'false';
                element.classList.remove('is-editing');

                if (currentlyEditing && currentlyEditing.element === element) {
                    currentlyEditing = null;
                }
            }

            function onBlurHandler(e) { exitEditMode(e.currentTarget, true); }
            function onKeydownHandler(e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    exitEditMode(e.currentTarget, true);
                }
                else if (e.key === 'Escape') {
                    e.preventDefault();
                    exitEditMode(e.currentTarget, false);
                }
            }

            document.body.addEventListener('dblclick', (e) => {
                const target = e.target.closest('.editable-target');
                if (target && !target.isContentEditable) {
                    enterEditMode(target);
                }
            });
        });
        `;

        // --- HTML 템플릿 반환 ---
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
        .main-header{background-color:var(--surface-color);border-bottom:1px solid var(--border-color);padding:5px 15px;position:sticky;top:0;z-index:100}
        .action-btn{background:0 0;border:none;font-size:18px;cursor:pointer;color:var(--text-primary-color);padding:8px 10px}
        .header-content-wrapper{display:flex;justify-content:space-between;align-items:center;width:100%}
        .main-header h1{font-size:20px;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-grow:1;text-align:center;padding:0 40px}
        .chat-log-container{display:flex;flex-direction:column;gap:12px;padding:20px 15px;max-width:800px;width:100%;margin:0 auto;flex-grow:1}

        .main-footer { text-align: center; padding: 30px 20px; color: var(--text-secondary-color); font-size: 13px; border-top: 1px solid var(--border-color); background-color: var(--surface-color); margin-top: auto; }
        .main-footer a { color: var(--primary-color); text-decoration: none; }
        .main-footer a:hover { text-decoration: underline; }

        .message-bubble{padding:16px;border-radius:18px;max-width:95%;line-height:1.6;word-wrap:break-word;transition:box-shadow 0.2s}
        .message-bubble p{margin:0 0 14px 0 !important} .message-bubble p:last-child{margin:0 !important}
        .user-message{align-self:flex-end;background-color:#61605a;color:#fff;border-bottom-right-radius:4px}
        .user-message p em{color:#C7C5BD !important;}
        .assistant-message{align-self:flex-start;background-color:var(--surface-color);border:1px solid var(--border-color);color:var(--text-primary-color);border-bottom-left-radius:4px}

        .editable-target { cursor: pointer; }
        .editable-target:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
        .is-editing { outline: 2px dashed var(--primary-color); outline-offset: 2px; cursor: text; white-space: pre-wrap; min-height: 1.5em; }
        .hidden-comment { display: none; }

        #info-panel,#info-panel-overlay{position:fixed;top:0;right:0;height:100%;transition:transform .3s ease-in-out,opacity .3s ease-in-out}
        #info-panel-overlay{width:100%;background-color:rgba(0,0,0,.5);z-index:999;opacity:0;pointer-events:none}
        #info-panel{width:90%;max-width:400px;background-color:var(--surface-color);z-index:1001;display:flex;flex-direction:column;box-shadow:-2px 0 10px rgba(0,0,0,.1);transform:translateX(100%)}
        #info-panel.is-open{transform:translateX(0)}
        #info-panel-overlay.is-open{opacity:1;pointer-events:auto}
        .info-panel-header{display:flex;justify-content:space-between;align-items:center;padding:0 20px;min-height:50px;border-bottom:1px solid var(--border-color);flex-shrink:0; background: #fff;}
        #info-panel-close-btn{font-size:24px;background:0 0;border:none;cursor:pointer;color:var(--text-primary-color)}
        .tabs-nav { display: flex; background: #fff; border-bottom: 1px solid var(--border-color); }
        .tab-btn { flex: 1; padding: 12px 5px; border: none; background: none; cursor: pointer; font-size: 14px; font-weight: 600; color: var(--text-secondary-color); transition: color 0.2s; border-bottom: 2px solid transparent; }
        .tab-btn.active { color: var(--primary-color); border-bottom-color: var(--primary-color); }
        .tab-content { display: none; padding: 20px; overflow-y: auto; flex-grow: 1; height: 100%; }
        .tab-content.active { display: block; }
        .content-box{background-color:var(--background-color);border:1px solid var(--border-color);padding:15px;border-radius:8px;word-break:break-word;margin-bottom:10px;white-space:pre-wrap;}
        .section-title { font-size: 16px; font-weight: bold; margin-bottom: 10px; display: block; }

        .memory-btn { width: 100%; padding: 12px; margin-bottom: 10px; background: #fff; border: 1px solid var(--border-color); border-radius: 8px; text-align: left; font-weight: bold; cursor: pointer; display: flex; justify-content: space-between; align-items: center; }
        .memory-btn.long-term { border-color: var(--primary-color); color: var(--primary-color); }
        .arrow-icon { transition: transform 0.3s; font-size: 12px; }
        .accordion-btn.open .arrow-icon { transform: rotate(180deg); }
        .accordion-content { display: none; padding: 15px; background: #fff; border: 1px solid var(--border-color); border-top: none; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px; margin-top: -10px; margin-bottom: 10px; }
        .accordion-content.open { display: block; }

        .modal-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); z-index: 2000; align-items: center; justify-content: center; }
        .modal-overlay.show { display: flex; }
        .modal-box { background: #fff; width: 90%; max-width: 500px; max-height: 80vh; border-radius: 12px; display: flex; flex-direction: column; box-shadow: 0 4px 20px rgba(0,0,0,0.2); }
        .modal-header { padding: 15px 20px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; font-weight: bold; font-size: 1.1em; }
        .modal-body { padding: 20px; overflow-y: auto; background-color: var(--surface-color); }
        .modal-close { background: none; border: none; font-size: 24px; cursor: pointer; }

        .memory-title { font-weight:bold; margin-bottom:4px; color:#333; }
        .memory-summary { font-size:0.95em; color:#555; line-height:1.4; white-space:pre-wrap; }

        table{border-collapse:collapse;width:100%;margin:1em 0;border:1px solid #c7c5bd} th,td{border:1px solid #c7c5bd;padding:8px;text-align:left}

        /* 저장 버튼 스타일 */
        #floating-save-btn {
            display: none; /* 초기에는 숨김 */
            position: fixed;
            bottom: 30px;
            right: 30px;
            padding: 15px 20px;
            background-color: var(--primary-color);
            color: white;
            border: none;
            border-radius: 50px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
            z-index: 9999;
            transition: transform 0.2s, background-color 0.2s;
        }
        #floating-save-btn:hover { background-color: #357abd; transform: translateY(-2px); }
        #floating-save-btn.bounce { animation: bounce 0.5s; }
        @keyframes bounce {
            0%, 20%, 50%, 80%, 100% {transform: translateY(0);}
            40% {transform: translateY(-10px);}
            60% {transform: translateY(-5px);}
        }
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

    <button id="floating-save-btn" onclick="saveChangesToFile()">💾 변경사항 저장하기</button>

    <footer class="main-footer">
        <p>${new Date().toLocaleDateString()} 저장됨</p>
    </footer>

    <div id="info-panel-overlay"></div>
    <div id="info-panel">
        <div class="info-panel-header"><span>대화 정보</span><button id="info-panel-close-btn">×</button></div>
        <div class="tabs-nav">
            <button class="tab-btn active" onclick="openTab('tab-profile')">대화프로필</button>
            <button class="tab-btn" onclick="openTab('tab-usernote')">유저노트</button>
            <button class="tab-btn" onclick="openTab('tab-memory')">메모리</button>
        </div>

        <div id="tab-profile" class="tab-content active">
            <span class="section-title">이름</span>
            <div class="content-box editable-target no-markdown" data-raw-content="${profileNameRaw}">${escapeHtml(profileNameRaw).replace(/\n/g, '<br>')}</div>
            <span class="section-title">상세 설정</span>
            <div class="content-box editable-target no-markdown" data-raw-content="${profileInfoRaw}">${escapeHtml(profileInfoRaw).replace(/\n/g, '<br>')}</div>
        </div>

        <div id="tab-usernote" class="tab-content">
            <span class="section-title">유저 노트</span>
            <div class="content-box editable-target no-markdown" style="min-height: 200px;" data-raw-content="${userNoteRaw}">${escapeHtml(userNoteRaw).replace(/\n/g, '<br>')}</div>
        </div>

        <div id="tab-memory" class="tab-content">
            <button class="memory-btn long-term" onclick="openModal('modal-longterm')">🧠 장기기억 보기 <span>🔍</span></button>
            <button class="memory-btn accordion-btn" onclick="toggleAccordion(this)">⚡ 단기기억 <span class="arrow-icon">▼</span></button>
            <div class="accordion-content">${shortTermHtml}</div>
            <button class="memory-btn accordion-btn" onclick="toggleAccordion(this)">💞 관계도 <span class="arrow-icon">▼</span></button>
            <div class="accordion-content">${relationshipHtml}</div>
            <button class="memory-btn accordion-btn" onclick="toggleAccordion(this)">🎯 목표 <span class="arrow-icon">▼</span></button>
            <div class="accordion-content">${goalHtml}</div>
        </div>
    </div>

    <div id="modal-longterm" class="modal-overlay">
        <div class="modal-box">
            <div class="modal-header">장기기억<button class="modal-close" onclick="closeModal('modal-longterm')">×</button></div>
            <div class="modal-body">${longTermHtml}</div>
        </div>
    </div>

    <script>${clientScript}<\/script>
</body>
</html>`;
    }

    // ===================================================================================
    // PART 2: API 연동 로직
    // ===================================================================================
    const API_BASE = "https://crack-api.wrtn.ai";
    function getCookie(name) { const value = `; ${document.cookie}`; const parts = value.split(`; ${name}=`); if (parts.length === 2) return decodeURIComponent(parts.pop().split(';').shift()); return null; }
    function apiRequest(url, token) { const wrtnId = getCookie('__w_id'); return new Promise((resolve, reject) => { GM_xmlhttpRequest({ method: "GET", url: url, headers: { 'Authorization': `Bearer ${token}`, 'platform': 'web', 'x-wrtn-id': wrtnId || '' }, onload: (res) => { if (res.status >= 200 && res.status < 300) { try { const data = JSON.parse(res.responseText); resolve(data.data !== undefined ? data.data : data); } catch (e) { reject(new Error("JSON 파싱 실패")); } } else { reject(new Error(`API 오류: ${res.status}`)); } }, onerror: () => reject(new Error("네트워크 오류")) }); }); }
    function getUrlInfo() { const m = window.location.pathname.match(/\/stories\/([a-f0-9]+)\/episodes\/([a-f0-9]+)/); return m ? { chatroomId: m[2] } : {}; }
    async function fetchAllSummariesByType(chatroomId, token, summaryType) { const allSummaries = []; const limit = 20; let currentCursor = null; let page = 1; while (true) { let url = `${API_BASE}/crack-gen/v3/chats/${chatroomId}/summaries?limit=${limit}&type=${summaryType}&orderBy=newest`; if (currentCursor) url += `&cursor=${encodeURIComponent(currentCursor)}`; if (summaryType === 'longTerm') url += '&filter=all'; try { const summaryData = await apiRequest(url, token); const fetchedSummaries = summaryData.summaries || []; if (fetchedSummaries.length > 0) allSummaries.push(...fetchedSummaries); if (summaryData.nextCursor) { currentCursor = summaryData.nextCursor; page++; } else { break; } if (fetchedSummaries.length === 0 || page > 200) break; } catch (e) { console.warn(`${summaryType} fetch warning:`, e); break; } } return allSummaries; }
    async function fetchAllChatData() { const token = getCookie('access_token'); const { chatroomId } = getUrlInfo(); if (!token || !chatroomId) throw new Error('인증 토큰이나 채팅방 ID를 찾을 수 없습니다.'); const [cD, mD, pInfo, longMem, shortMem, relMem, goalMem] = await Promise.all([apiRequest(`${API_BASE}/crack-gen/v3/chats/${chatroomId}`, token), apiRequest(`${API_BASE}/crack-gen/v3/chats/${chatroomId}/messages?limit=2000`, token), apiRequest(`${API_BASE}/crack-api/profiles`, token), fetchAllSummariesByType(chatroomId, token, 'longTerm'), fetchAllSummariesByType(chatroomId, token, 'shortTerm'), fetchAllSummariesByType(chatroomId, token, 'relationship'), fetchAllSummariesByType(chatroomId, token, 'goal')]); let userPersona = { name: null, information: null }; try { if (pInfo?._id) { const personaResponse = await apiRequest(`${API_BASE}/crack-api/profiles/${pInfo._id}/chat-profiles`, token); const personaList = personaResponse?.chatProfiles || []; const activePersonaId = cD?.chatProfile?._id; const persona = personaList.find(p => p._id === activePersonaId) || personaList.find(p => p.isRepresentative) || personaList[0]; if (persona) { userPersona = { name: persona.name, information: persona.information }; } } } catch (e) { console.error("페르소나 로드 실패", e); } return { title: cD?.story?.title || cD?.title || 'Unknown Chat', userNote: cD?.story?.userNote?.content || '', userPersona: userPersona, memories: { longTerm: longMem, shortTerm: shortMem, relationship: relMem, goal: goalMem }, messages: (mD?.messages || []).reverse().map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })) }; }
    function downloadFile(content, filename) { const b = new Blob([content], { type: 'text/html;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); }

    // ===================================================================================
    // PART 3: 스크립트 실행
    // ===================================================================================
    function waitForElement(selector) { return new Promise(resolve => { if (document.querySelector(selector)) return resolve(document.querySelector(selector)); const observer = new MutationObserver(() => { if (document.querySelector(selector)) { observer.disconnect(); resolve(document.querySelector(selector)); } }); observer.observe(document.body, { childList: true, subtree: true }); }); }
    async function createMenuButton() { const container = await waitForElement('.py-4.overflow-y-auto.scrollbar > .px-2:first-of-type'); if (!container || document.getElementById('html-save-btn-v4-2')) return; const btnWrapper = document.createElement('div'); btnWrapper.id = 'html-save-btn-v4-2'; btnWrapper.className = 'px-2.5 h-4 box-content py-[18px]'; btnWrapper.innerHTML = `<button class="w-full flex h-4 items-center justify-between typo-110-16-med space-x-2 [&amp;_svg]:fill-icon_tertiary ring-offset-4 ring-offset-sidebar" style="cursor: pointer;"><span class="flex space-x-2 items-center"><span style="font-size: 16px;">📄</span><span class="btn-text whitespace-nowrap overflow-hidden text-ellipsis typo-text-sm_leading-none_medium">HTML 저장</span></span></button>`; btnWrapper.onclick = async () => { const btnText = btnWrapper.querySelector('.btn-text'); const originalText = btnText.textContent; try { btnText.textContent = '데이터 수집 중...'; btnWrapper.style.pointerEvents = 'none'; const chatData = await fetchAllChatData(); const finalHtml = generateFullHtmlPage(chatData); downloadFile(finalHtml, `${chatData.title.replace(/[\\/:*?"<>|]/g, '')}.html`); btnText.textContent = '저장 완료!'; setTimeout(() => { btnText.textContent = originalText; btnWrapper.style.pointerEvents = 'auto'; }, 2000); } catch (e) { alert(`오류 발생: ${e.message}`); console.error(e); btnText.textContent = originalText; btnWrapper.style.pointerEvents = 'auto'; } }; container.appendChild(btnWrapper); }
    window.addEventListener('load', () => { createMenuButton(); const observer = new MutationObserver(() => { if (!document.getElementById('html-save-btn-v4-2')) createMenuButton(); }); observer.observe(document.body, { childList: true, subtree: true }); });

})();
