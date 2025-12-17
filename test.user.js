// ==UserScript==
// @name         크랙 JSON 복사
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  채팅로그를 지정한 턴수만큼 JSON 형식으로 클립보드에 복사합니다.
// @author       뤼붕이 (수정 by Gemini)
// @match        https://crack.wrtn.ai/stories/*/episodes/*
// @grant        none
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // ===================================================================================
    // PART 1: JSON 데이터 생성 및 클립보드 복사 로직
    // ===================================================================================

    /**
     * 전체 채팅 데이터와 사용자가 지정한 턴 수를 받아
     * 필요한 정보만 담은 JSON 객체를 생성하고 문자열로 변환합니다.
     * @param {object} chatData - fetchAllChatData에서 반환된 전체 데이터
     * @param {number} turnCount - 사용자가 복사하길 원하는 메시지(턴)의 수
     * @returns {string} - 예쁘게 포맷된 JSON 문자열
     */
    function generateJsonString(chatData, turnCount) {
        // 메시지 배열의 끝에서부터 turnCount만큼의 메시지를 잘라냅니다.
        const slicedMessages = chatData.messages.slice(-turnCount);

        // 복사할 최종 데이터 구조를 정의합니다.
        const dataToCopy = {
            title: chatData.title,
            userNote: chatData.userNote,
            messages: slicedMessages
        };

        // JSON 객체를 사람이 읽기 쉬운 형태의 문자열로 변환합니다. (들여쓰기 2칸)
        return JSON.stringify(dataToCopy, null, 2);
    }

    /**
     * 주어진 텍스트를 클립보드에 복사합니다.
     * @param {string} text - 클립보드에 복사할 텍스트
     * @returns {Promise<void>}
     */
    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
        } catch (err) {
            console.error('클립보드 복사 실패:', err);
            alert('클립보드 복사에 실패했습니다. 브라우저 콘솔을 확인해주세요.');
        }
    }


    // ===================================================================================
    // PART 2: WRTN.AI 사이트 연동 로직 (기존 코드 재활용)
    // ===================================================================================

    function waitForElement(selector) { return new Promise(resolve => { const i = setInterval(() => { const e = document.querySelector(selector); if (e) { clearInterval(i); resolve(e); } }, 100); }); }
    function getCookie(name) { const nameEQ = name + "="; const ca = document.cookie.split(';'); for(let i=0;i < ca.length;i++) { let c = ca[i]; while (c.charAt(0)==' ') c = c.substring(1,c.length); if (c.indexOf(nameEQ) == 0) return decodeURIComponent(c.substring(nameEQ.length,c.length)); } return null; }
    function getUrlInfo() {const match = window.location.pathname.match(/\/stories\/[a-f0-9]+\/episodes\/([a-f0-9]+)/); if (match && match[1]) {return { chatroomId: match[1] };}return {};}
    async function apiRequest(url, token) { const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }); if (!response.ok) throw new Error(`API Error: ${response.status}`); return (await response.json()).data; }
    async function fetchAllChatData() {
        const token = getCookie('access_token');
        const { chatroomId } = getUrlInfo();
        if (!token || !chatroomId) throw new Error('토큰 또는 채팅방 ID를 찾을 수 없습니다.');
        const API_BASE = "https://contents-api.wrtn.ai";
        const chatroomPromise = apiRequest(`${API_BASE}/character-chat/api/v2/chat-room/${chatroomId}`, token);
        const messagesPromise = apiRequest(`${API_BASE}/character-chat/api/v2/chat-room/${chatroomId}/messages?limit=2000`, token);
        const [chatroomData, messagesData] = await Promise.all([chatroomPromise, messagesPromise]);
        const messages = (messagesData?.list || []).reverse().map(m => ({ role: m.role, content: m.content }));
        return {
            title: chatroomData?.title || 'Unknown Chat',
            userNote: chatroomData?.character?.userNote?.content || '',
            messages: messages
        };
    }
    async function createMenuButton() {
        try {
            const menuContainer = await waitForElement('.css-uxwch2');
            const buttonId = 'json-copy-button';
            if (document.getElementById(buttonId)) return;

            const button = document.createElement('div');
            button.id = buttonId;
            button.className = 'css-1dib65l';
            button.style.cssText = "display: flex; cursor: pointer; padding: 10px;";

            const buttonText = document.createElement('p');
            buttonText.className = 'css-1xke5yy';
            buttonText.innerHTML = `<span style="padding-right: 6px;">📋</span>JSON 복사`;
            button.appendChild(buttonText);

            button.addEventListener('click', async () => {
                const originalText = buttonText.innerHTML;
                let isProcessing = false;

                if (isProcessing) return;

                const turnInput = prompt("복사할 마지막 턴(메시지) 개수를 입력하세요:", "10");
                if (turnInput === null) return; // 사용자가 취소한 경우

                const turnCount = parseInt(turnInput, 10);
                if (isNaN(turnCount) || turnCount <= 0) {
                    alert("유효한 숫자를 입력해야 합니다.");
                    return;
                }

                try {
                    isProcessing = true;
                    buttonText.textContent = '복사 중...';
                    button.style.pointerEvents = 'none';

                    const chatData = await fetchAllChatData();
                    const jsonString = generateJsonString(chatData, turnCount);
                    await copyToClipboard(jsonString);

                    buttonText.textContent = '복사 완료!';
                    setTimeout(() => {
                         buttonText.innerHTML = originalText;
                         button.style.pointerEvents = 'auto';
                         isProcessing = false;
                    }, 2000);

                } catch (error) {
                    console.error('JSON 생성 또는 복사 실패:', error);
                    alert(`오류가 발생했습니다: ${error.message}`);
                    buttonText.innerHTML = originalText;
                    button.style.pointerEvents = 'auto';
                    isProcessing = false;
                }
            });

            menuContainer.appendChild(button);
        } catch (e) {
            console.error('버튼 생성 실패:', e);
        }
    }

    const observer = new MutationObserver((_, obs) => {
        if (document.querySelector('.css-uxwch2')) {
            createMenuButton();
            obs.disconnect();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

})();
