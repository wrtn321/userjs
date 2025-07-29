// ==UserScript==
// @name         wrtn 채팅 JSON 저장 (role/content)
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  현재 wrtn.ai 채팅방의 대화 로그를 role과 content만 포함된 JSON 형식으로 저장합니다.
// @author       Your Name
// @match        https://crack.wrtn.ai/u/*/c/*
// @grant        none
// @license      MIT
// ==/UserScript==

(function() {
    'use-strict';

    /**
     * 특정 요소가 화면에 나타날 때까지 기다리는 함수
     * @param {string} selector - CSS 선택자
     * @param {number} timeout - 최대 대기 시간 (ms)
     * @returns {Promise<Element>}
     */
    function waitForElement(selector, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const intervalTime = 100;
            let timeWaited = 0;

            const interval = setInterval(() => {
                const element = document.querySelector(selector);
                if (element) {
                    clearInterval(interval);
                    resolve(element);
                } else {
                    timeWaited += intervalTime;
                    if (timeWaited >= timeout) {
                        clearInterval(interval);
                        reject(new Error(`'${selector}' 요소를 찾지 못했습니다.`));
                    }
                }
            }, intervalTime);
        });
    }

    /**
     * 쿠키에서 access_token을 가져오는 함수
     * @returns {string|null}
     */
    function getAccessToken() {
        const match = document.cookie.match(/(?:^|; )access_token=([^;]*)/);
        return match ? decodeURIComponent(match[1]) : null;
    }

    /**
     * 현재 URL에서 채팅방 ID를 추출하는 함수
     * @returns {string|null}
     */
    function getChatroomId() {
        const match = window.location.pathname.match(/\/c\/([a-f0-9]+)/);
        return match ? match[1] : null;
    }

    /**
     * 채팅방 상단에 표시된 캐릭터 이름을 가져오는 함수
     * @returns {string}
     */
    function getCharacterName() {
        // 이 선택자는 사이트 업데이트에 따라 변경될 수 있습니다.
        const nameElement = document.querySelector('p[class*="css-1ijub34"]');
        return nameElement ? nameElement.innerText.trim() : 'Unknown_Character';
    }

    /**
     * API를 통해 채팅 로그를 가져와 role과 content만 추출하는 함수
     * @returns {Promise<Array<{role: string, content: string}>>}
     */
    async function fetchChatMessages() {
        const token = getAccessToken();
        const chatroomId = getChatroomId();

        if (!token || !chatroomId) {
            throw new Error('인증 토큰 또는 채팅방 ID를 가져올 수 없습니다.');
        }

        // 전체 대화를 가져오기 위해 limit 값을 충분히 높게 설정
        const apiUrl = `https://contents-api.wrtn.ai/character-chat/api/v2/chat-room/${chatroomId}/messages?limit=2000`;

        const response = await fetch(apiUrl, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`API 요청 실패: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const messages = data?.data?.list || [];

        // API는 최신 메시지 순으로 반환하므로, 시간 순서대로 뒤집어줌
        const chronologicalMessages = messages.reverse();

        // role과 content만 추출하여 새로운 배열 생성
        return chronologicalMessages.map(msg => ({
            role: msg.role,
            content: msg.content
        }));
    }

    /**
     * 데이터를 JSON 파일로 다운로드하는 함수
     * @param {string} content - JSON 문자열
     * @param {string} filename - 파일 이름
     */
    function downloadFile(content, filename) {
        const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * UI 버튼을 생성하고 메뉴에 추가하는 함수
     */
    async function createMenuButton() {
        try {
            // 첫 번째 예제 스크립트에서 확인된 메뉴 컨테이너 선택자
            const menuContainer = await waitForElement('.css-uxwch2');

            // 이미 버튼이 있는지 확인
            if (document.getElementById('json-role-content-saver')) {
                return;
            }

            const buttonWrapper = document.createElement('div');
            buttonWrapper.id = 'json-role-content-saver';
            // 다른 메뉴 아이템과 동일한 스타일 적용
            buttonWrapper.className = 'css-5w39sj';
            buttonWrapper.style.cursor = 'pointer';
            buttonWrapper.style.marginTop = '8px';
            buttonWrapper.innerHTML = `
                <p color="text_primary" class="css-1xke5yy">
                    <span style="padding-right: 6px;">💾</span>현재 채팅 JSON 저장
                </p>
                <div class="css-13pmxen" style="display: flex;"></div>
            `;

            buttonWrapper.addEventListener('click', async () => {
                try {
                    buttonWrapper.querySelector('p').textContent = '저장 중...';
                    const messages = await fetchChatMessages();
                    const finalJson = JSON.stringify({ messages }, null, 2);
                    const characterName = getCharacterName();
                    const timestamp = new Date().toISOString().slice(0, 10);
                    downloadFile(finalJson, `${characterName}_${timestamp}.json`);
                    alert('채팅 기록을 성공적으로 저장했습니다.');
                } catch (error) {
                    console.error('JSON 저장 실패:', error);
                    alert(`오류가 발생했습니다: ${error.message}`);
                } finally {
                     buttonWrapper.querySelector('p').innerHTML = `<span style="padding-right: 6px;">💾</span>현재 채팅 JSON 저장`;
                }
            });

            menuContainer.appendChild(buttonWrapper);

        } catch (error) {
            console.error('메뉴 버튼 생성 실패:', error);
        }
    }

    // 페이지가 완전히 로드되고, SPA(Single Page Application) 특성으로 인한
    // 페이지 전환이 완료될 시간을 고려하여 스크립트 실행
    setTimeout(createMenuButton, 3000);

})();