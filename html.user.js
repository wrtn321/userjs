// ==UserScript==
// @name         Wrtn 채팅 뷰어(HTML) 생성기 v2
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  현재 wrtn.ai 채팅방의 내용을 편집 가능한 단일 HTML 파일로 저장합니다.
// @author       Your name
// @match        https://crack.wrtn.ai/u/*/c/*
// @grant        none
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // ===================================================================================
    // PART 1: WRTN.AI 사이트에서 데이터를 추출하고 UI 버튼을 생성하는 로직
    // ===================================================================================

    function waitForElement(selector) {
        return new Promise((resolve) => {
            const interval = setInterval(() => {
                const element = document.querySelector(selector);
                if (element) { clearInterval(interval); resolve(element); }
            }, 100);
        });
    }

    function getCookie(name) {
        const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/([.$?*|{}()\[\]\\\/+^])/g, "\\$1")}=([^;]*)`));
        return match ? decodeURIComponent(match[1]) : null;
    }

    function getUrlInfo() {
        const match = window.location.pathname.match(/\/u\/([a-f0-9]+)\/c\/([a-f0-9]+)/);
        return match ? { characterId: match[1], chatroomId: match[2] } : { characterId: null, chatroomId: null };
    }

    async function apiRequest(url, token) {
        const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } });
        if (!response.ok) throw new Error(`API 요청 실패: ${response.status}`);
        const result = await response.json();
        return result.data;
    }

    async function fetchAllChatData() {
        const token = getCookie('access_token');
        const { chatroomId } = getUrlInfo();
        const API_BASE_URL = "https://contents-api.wrtn.ai";
        if (!token || !chatroomId) throw new Error('인증 토큰 또는 채팅방 ID를 가져올 수 없습니다.');

        const chatroomPromise = apiRequest(`${API_BASE_URL}/character-chat/api/v2/chat-room/${chatroomId}`, token);
        const messagesPromise = apiRequest(`${API_BASE_URL}/character-chat/api/v2/chat-room/${chatroomId}/messages?limit=2000`, token);

        const [chatroomData, messagesData] = await Promise.all([chatroomPromise, messagesPromise]);

        const messages = (messagesData?.list || []).reverse().map(msg => ({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content
        }));

        return {
            title: chatroomData?.title || 'Unknown Chat',
            userPersona: {
                name: chatroomData?.chatProfile?.name || '기본 프로필',
                information: chatroomData?.chatProfile?.information || '프로필 정보가 없습니다.'
            },
            userNote: chatroomData?.character?.userNote?.content || '유저노트가 없습니다.',
            messages: messages
        };
    }

    async function createMenuButton() {
        try {
            const menuContainer = await waitForElement('.css-uxwch2');
            if (document.getElementById('html-viewer-saver')) return;

            const buttonWrapper = document.createElement('div');
            buttonWrapper.id = 'html-viewer-saver';
            buttonWrapper.className = 'css-1dib65l';
            buttonWrapper.style.cssText = "display: flex; cursor: pointer; padding: 10px; margin-top: 8px;";
            buttonWrapper.innerHTML = `<p class="css-1xke5yy"><span style="padding-right: 6px;">📄</span>HTML 뷰어 저장</p>`;

            const textElement = buttonWrapper.querySelector('p');
            const originalText = buttonWrapper.innerHTML;

            buttonWrapper.addEventListener('click', async () => {
                try {
                    textElement.innerHTML = '생성 중...';
                    buttonWrapper.style.pointerEvents = 'none';

                    const chatData = await fetchAllChatData();
                    const finalHtml = generateFullHtmlPage(chatData);

                    const timestamp = new Date().toISOString().slice(0, 10);
                    const fileName = `${chatData.title.replace(/[\\/:*?"<>|]/g, '')}_${timestamp}.html`;

                    downloadFile(finalHtml, fileName, 'text/html;charset=utf-8');
                    alert('HTML 뷰어를 성공적으로 생성했습니다.');

                } catch (error) {
                    console.error('HTML 생성 실패:', error);
                    alert(`오류가 발생했습니다: ${error.message}`);
                } finally {
                    buttonWrapper.innerHTML = originalText;
                    buttonWrapper.style.pointerEvents = 'auto';
                }
            });
            menuContainer.appendChild(buttonWrapper);
        } catch (error) { console.error('메뉴 버튼 생성 실패:', error); }
    }

    function downloadFile(content, filename, contentType) {
        const blob = new Blob([content], { type: contentType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
    }

    const observer = new MutationObserver((mutationsList, obs) => {
        if (document.querySelector('.css-uxwch2')) {
            createMenuButton();
            obs.disconnect();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // ===================================================================================
    // PART 2: 독립적인 HTML 파일을 생성하기 위한 템플릿 (CSS, JS, HTML 구조)
    // ===================================================================================

    function generateFullHtmlPage(chatData) {
        const embeddedDataString = JSON.stringify(chatData, null, 2);

        // HTML 파일 내부에 포함될 Javascript 코드.
        // toString()을 사용하여 함수 자체를 문자열로 변환합니다.
        const viewerJsString = `(${VIEWER_JS.toString()})();`;

        return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, maximum-scale=1.0, minimum-scale=1.0">
    <title>${chatData.title}</title>
    <style>${VIEWER_CSS}</style>
</head>
<body class="sticky-footer-layout">

${HTML_STRUCTURE}

<script id="initial-data-script">
    const initialChatData = ${embeddedDataString};
</script>
<script>${viewerJsString}</script>

</body>
</html>`;
    }

    // --- HTML 구조 템플릿 ---
    const HTML_STRUCTURE = `<header class="main-header">
    <h1 id="viewer-title" title="클릭하여 제목 수정"></h1>
    <button id="hamburger-menu-btn" class="action-btn" title="메뉴 열기">☰</button>
</header>
<main id="chat-log-container" class="chat-log-container"></main>
<footer class="site-footer"><p>© 2025. ㄹㅇㄱ. All rights reserved.</p></footer>
<div id="info-panel-overlay" class="hidden"></div>
<div id="info-panel" class="hidden">
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
body.dark-mode { --primary-color: #4A90E2; --primary-hover-color: #63a4ff; --background-color: #121212; --surface-color: #1E1E1E; --border-color: #333; --text-primary-color: #E0E0E0; --text-secondary-color: #A0A0A0; }
* { box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; margin: 0; background-color: var(--background-color); color: var(--text-primary-color); transition: background-color 0.2s, color 0.2s; display: flex; flex-direction: column; min-height: 100vh; }
.main-header { display: flex; justify-content: space-between; align-items: center; background-color: var(--surface-color); border-bottom: 1px solid var(--border-color); padding: 10px 15px; position: sticky; top: 0; z-index: 100; }
.main-header h1 { font-size: 20px; margin: 0; cursor: pointer; }
.action-btn { background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-primary-color); }
.chat-log-container { display: flex; flex-direction: column; gap: 12px; padding: 20px 15px; max-width: 800px; width: 100%; margin: 0 auto; flex-grow: 1; }
.message-bubble { padding: 16px; border-radius: 18px; max-width: 95%; line-height: 1.6; word-wrap: break-word; white-space: pre-wrap; }
.message-content { cursor: pointer; }
.user-message { align-self: flex-end; background-color: #4A90E2; color: #fff; border-bottom-right-radius: 4px; }
.assistant-message { align-self: flex-start; background-color: var(--surface-color); border: 1px solid var(--border-color); color: var(--text-primary-color); border-bottom-left-radius: 4px; }
.message-bubble.editing { width: 100%; max-width: 100%; }
.editable-textarea { display: none; width: 100%; background: var(--background-color); border: 1px solid var(--primary-color); border-radius: 4px; color: inherit; font-family: inherit; font-size: 1em; line-height: 1.6; padding: 2px; resize: vertical; outline: none; }
.edit-actions { display: none; text-align: right; margin-top: 5px; }
.edit-actions button { background-color: var(--surface-color); border: 1px solid var(--border-color); border-radius: 6px; padding: 4px 8px; margin-left: 5px; cursor: pointer; }
.title-edit-input { width: 70%; font-size: 20px; font-weight: bold; text-align: left; border: 1px solid var(--primary-color); border-radius: 5px; padding: 5px; outline: none; background-color: var(--surface-color); color: var(--text-primary-color); }
#info-panel-overlay, #info-panel { transition: transform 0.3s ease-in-out, opacity 0.3s; }
#info-panel-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.5); z-index: 1000; }
#info-panel { position: fixed; top: 0; right: 0; width: 90%; max-width: 350px; height: 100%; background-color: var(--surface-color); z-index: 1001; display: flex; flex-direction: column; box-shadow: -2px 0 10px rgba(0,0,0,0.1); }
.hidden { opacity: 0; pointer-events: none; transform: translateX(100%); }
.info-panel-header { display: flex; justify-content: space-between; align-items: center; padding: 15px 20px; border-bottom: 1px solid var(--border-color); }
#info-panel-close-btn { font-size: 24px; }
.info-panel-tabs { display: flex; border-bottom: 1px solid var(--border-color); }
.tab-link { flex: 1; padding: 12px; text-align: center; background: none; border: none; cursor: pointer; font-size: 15px; border-bottom: 3px solid transparent; }
.tab-link.active { font-weight: bold; color: var(--primary-color); border-bottom-color: var(--primary-color); }
.info-panel-body { padding: 20px; overflow-y: auto; flex-grow: 1; }
.tab-content { display: none; }
.tab-content.active { display: block; }
.content-box { background-color: var(--background-color); border: 1px solid var(--border-color); padding: 15px; border-radius: 8px; white-space: pre-wrap; word-break: break-word; min-height: 100px; }
.content-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
#persona-name, .content-header h3 { margin: 0; font-size: 16px; }
.panel-edit-btn { font-size: 18px; }
#persona-edit-mode textarea, #usernote-edit-mode textarea { width: 100%; min-height: 150px; border: 1px solid var(--primary-color); border-radius: 8px; padding: 10px; resize: vertical; background-color: var(--background-color); color: var(--text-primary-color); }
#persona-edit-mode .edit-actions, #usernote-edit-mode .edit-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px; }
.panel-save-btn, .panel-cancel-btn { padding: 6px 12px; border-radius: 6px; border: none; cursor: pointer; }
.panel-save-btn { background-color: var(--primary-color); color: white; }
.panel-cancel-btn { background-color: #e0e0e0; }
.panel-action-link { display: block; padding: 15px 20px; text-decoration: none; color: var(--text-primary-color); border-radius: 8px; margin-bottom: 10px; background-color: var(--background-color); transition: background-color 0.2s; }
.panel-action-link:hover { background-color: #e9ecef; }
body.dark-mode .panel-action-link:hover { background-color: #333; }
.site-footer { text-align: center; padding: 15px; font-size: 12px; color: var(--text-secondary-color); }
#toast-notification { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background-color: rgba(0,0,0,0.7); color: white; padding: 12px 20px; border-radius: 20px; z-index: 2000; opacity: 0; transition: opacity 0.3s, bottom 0.3s; pointer-events: none; }
#toast-notification.show { bottom: 30px; opacity: 1; }`;

    // --- 자바스크립트 로직 템플릿 ---
    const VIEWER_JS = function() {
        document.addEventListener('DOMContentLoaded', () => {
            let activeEditingIndex = null;
            let toastTimer;

            // --- UI 요소 가져오기 생략 (함수 내에서 직접 참조) ---

            function renderAll() {
                // `initialChatData`는 HTML 파일에 포함된 전역 변수입니다.
                document.title = initialChatData.title;
                document.getElementById('viewer-title').textContent = initialChatData.title;

                const chatLogContainer = document.getElementById('chat-log-container');
                chatLogContainer.innerHTML = '';
                initialChatData.messages.forEach((msg, index) => {
                    chatLogContainer.appendChild(createMessageBubble(msg, index));
                });

                document.getElementById('persona-name').textContent = initialChatData.userPersona.name || '프로필';
                document.getElementById('persona-info').textContent = initialChatData.userPersona.information || '정보 없음';
                document.getElementById('persona-textarea').value = initialChatData.userPersona.information || '';
                document.getElementById('usernote-info').textContent = initialChatData.userNote || '유저노트 없음';
                document.getElementById('usernote-textarea').value = initialChatData.userNote || '';
            }

            function createMessageBubble(message, index) {
                const bubble = document.createElement('div');
                bubble.className = `message-bubble ${message.role}-message`;
                bubble.dataset.index = index;

                const viewContent = document.createElement('div');
                viewContent.className = 'message-content';
                viewContent.innerHTML = message.content.replace(/\n/g, '<br>');
                viewContent.title = '더블클릭하여 수정';

                const editContainer = document.createElement('div');
                editContainer.className = 'edit-container';
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

                const autoResizeTextarea = (el) => { el.style.height = 'auto'; el.style.height = (el.scrollHeight) + 'px'; };

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
                        viewContent.innerHTML = editTextarea.value.replace(/\n/g, '<br>');
                        bubble.dataset.content = editTextarea.value; // 변경된 내용을 dataset에 임시 저장
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
                const newMessages = [];
                document.querySelectorAll('.message-bubble').forEach(bubble => {
                    const index = parseInt(bubble.dataset.index, 10);
                    const originalMessage = initialChatData.messages[index];
                    let newContent;
                    if(bubble.classList.contains('editing')){
                        newContent = bubble.querySelector('.editable-textarea').value;
                    } else {
                        newContent = typeof bubble.dataset.content === 'string' ? bubble.dataset.content : originalMessage.content;
                    }
                    newMessages.push({ role: originalMessage.role, content: newContent });
                });
                return {
                    title: document.getElementById('viewer-title').textContent,
                    userPersona: {
                        name: document.getElementById('persona-name').textContent,
                        information: document.getElementById('persona-textarea').value
                    },
                    userNote: document.getElementById('usernote-textarea').value,
                    messages: newMessages
                };
            }

            function download(content, filename, contentType) {
                const blob = new Blob([content], { type: contentType });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = filename;
                document.body.appendChild(a); a.click();
                document.body.removeChild(a); URL.revokeObjectURL(url);
            }

            function addEventListeners() {
                const infoPanelOverlay = document.getElementById('info-panel-overlay');
                const infoPanel = document.getElementById('info-panel');
                document.getElementById('hamburger-menu-btn').addEventListener('click', () => { infoPanel.classList.remove('hidden'); infoPanelOverlay.classList.remove('hidden'); });
                document.getElementById('info-panel-close-btn').addEventListener('click', () => { infoPanel.classList.add('hidden'); infoPanelOverlay.classList.add('hidden'); });
                infoPanelOverlay.addEventListener('click', () => { infoPanel.classList.add('hidden'); infoPanelOverlay.classList.add('hidden'); });

                document.getElementById('viewer-title').addEventListener('click', (e) => {
                    const viewerTitle = e.currentTarget;
                    if (document.querySelector('.title-edit-input')) return;
                    const input = document.createElement('input');
                    input.type = 'text'; input.className = 'title-edit-input'; input.value = viewerTitle.textContent;
                    viewerTitle.style.display = 'none';
                    viewerTitle.parentNode.insertBefore(input, viewerTitle.nextSibling);
                    input.focus();
                    input.addEventListener('blur', () => {
                        if (input.value.trim()) { viewerTitle.textContent = input.value.trim(); document.title = input.value.trim(); }
                        viewerTitle.style.display = 'block';
                        if (input.parentNode) input.parentNode.removeChild(input);
                    });
                    input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') ev.target.blur(); });
                });

                document.querySelector('.info-panel-tabs').addEventListener('click', e => {
                    if (e.target.classList.contains('tab-link')) {
                        const tabName = e.target.dataset.tab;
                        document.querySelectorAll('.tab-link').forEach(btn => btn.classList.remove('active'));
                        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                        e.target.classList.add('active');
                        document.getElementById(`${tabName}-content`).classList.add('active');
                    }
                });

                const setupEditToggle = (type) => {
                    document.getElementById(`edit-${type}-btn`).addEventListener('click', () => {
                        document.getElementById(`${type}-view-mode`).hidden = true; document.getElementById(`${type}-edit-mode`).hidden = false; });
                    document.getElementById(`cancel-${type}-btn`).addEventListener('click', () => {
                        document.getElementById(`${type}-view-mode`).hidden = false; document.getElementById(`${type}-edit-mode`).hidden = true;
                        document.getElementById(`${type}-textarea`).value = type === 'persona' ? initialChatData.userPersona.information : initialChatData.userNote; });
                    document.getElementById(`save-${type}-btn`).addEventListener('click', () => {
                        document.getElementById(`${type}-view-mode`).hidden = false; document.getElementById(`${type}-edit-mode`).hidden = true;
                        const newValue = document.getElementById(`${type}-textarea`).value;
                        document.getElementById(`${type}-info`).textContent = newValue;
                        showToast(`${type === 'persona' ? '프로필' : '노트'} 정보가 임시 저장되었습니다.`);
                    });
                };
                setupEditToggle('persona');
                setupEditToggle('usernote');

                // --- 내보내기 버튼 이벤트 리스너 ---
                document.getElementById('download-html-btn').addEventListener('click', e => {
                    e.preventDefault();
                    // 핵심 수정사항: HTML을 문자열로 재조립하는 대신, 현재 문서에서 데이터만 교체하는 방식으로 변경
                    const currentData = getCurrentDataFromDOM();
                    const newScriptBlock = `<script id="initial-data-script">
    const initialChatData = ${JSON.stringify(currentData, null, 2)};
</script>`;

                    const currentHtml = document.documentElement.outerHTML;
                    const updatedHtml = currentHtml.replace(/<script id="initial-data-script">[\s\S]*?<\/script>/, newScriptBlock);

                    download(updatedHtml, `${currentData.title.replace(/[\\/:*?"<>|]/g, '')}.html`, 'text/html;charset=utf-8');
                });

                document.getElementById('download-json-btn').addEventListener('click', e => {
                    e.preventDefault();
                    const currentData = getCurrentDataFromDOM();
                    download(JSON.stringify(currentData, null, 2), `${currentData.title.replace(/[\\/:*?"<>|]/g, '')}.json`, 'application/json;charset=utf-8');
                });

                document.getElementById('download-txt-btn').addEventListener('click', e => {
                    e.preventDefault();
                    const currentData = getCurrentDataFromDOM();
                    const txtContent = currentData.messages.map(msg => `${msg.role.toUpperCase()}:\n${msg.content}`).join('\n\n');
                    download(txtContent, `${currentData.title.replace(/[\\/:*?"<>|]/g, '')}.txt`, 'text/plain;charset=utf-8');
                });
            }

            const showToast = message => {
                const toast = document.getElementById('toast-notification');
                if (!toast) return;
                toast.querySelector('.toast-message').textContent = message;
                clearTimeout(toastTimer);
                toast.classList.add('show');
                toastTimer = setTimeout(() => { toast.classList.remove('show'); }, 2500);
            };

            renderAll();
            addEventListeners();
        });
    };
})();
