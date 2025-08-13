// ==UserScript==
// @name         wrtn 채팅 JSON 저장
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  현재 wrtn.ai 채팅방의 대화 로그, 채팅방 정보, 페르소나, 유저노트를 포함한 상세 JSON으로 저장합니다.
// @author       Your name
// @match        https://crack.wrtn.ai/u/*/c/*
// @grant        none
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

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
     * 쿠키에서 값을 가져오는 함수
     * @param {string} name - 쿠키 이름
     * @returns {string|null}
     */
    function getCookie(name) {
        const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/([.$?*|{}()\[\]\\\/+^])/g, "\\$1")}=([^;]*)`));
        return match ? decodeURIComponent(match[1]) : null;
    }

    /**
     * 현재 URL에서 ID들을 추출하는 함수
     * @returns {{characterId: string|null, chatroomId: string|null}}
     */
    function getUrlInfo() {
        const match = window.location.pathname.match(/\/u\/([a-f0-9]+)\/c\/([a-f0-9]+)/);
        return match ? { characterId: match[1], chatroomId: match[2] } : { characterId: null, chatroomId: null };
    }

    /**
     * API 요청을 보내는 범용 함수
     * @param {string} url - API 엔드포인트
     * @param {string} token - 인증 토큰
     * @returns {Promise<any>}
     */
    async function apiRequest(url, token) {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        if (!response.ok) {
            throw new Error(`API 요청 실패: ${response.status} ${response.statusText}`);
        }
        const result = await response.json();
        return result.data;
    }

    /**
     * 채팅과 관련된 모든 정보를 가져오는 함수
     * @returns {Promise<object>}
     */
    async function fetchAllChatData() {
        const token = getCookie('access_token');
        const { chatroomId } = getUrlInfo();
        const API_BASE_URL = "https://contents-api.wrtn.ai";

        if (!token || !chatroomId) {
            throw new Error('인증 토큰 또는 채팅방 ID를 가져올 수 없습니다.');
        }

        // 1. 채팅방 정보 가져오기 (제목, 유저노트, 캐릭터 이름 등)
        const chatroomPromise = apiRequest(`${API_BASE_URL}/character-chat/api/v2/chat-room/${chatroomId}`, token);

        // 2. 페르소나 목록 가져오기
        const personaPromise = apiRequest(`${API_BASE_URL}/character/character-profiles`, token)
            .then(profile => {
                if (!profile?.wrtnUid) return null;
                return apiRequest(`${API_BASE_URL}/character/character-profiles/${profile.wrtnUid}`, token);
            })
            .then(profileDetail => {
                if (!profileDetail?._id) return [];
                return apiRequest(`${API_BASE_URL}/character/character-profiles/${profileDetail._id}/character-chat-profiles`, token);
            })
            .then(personaData => personaData?.characterChatProfiles || []);

        // 3. 채팅 메시지 가져오기 (최대 2000개)
        const messagesPromise = apiRequest(`${API_BASE_URL}/character-chat/api/v2/chat-room/${chatroomId}/messages?limit=2000`, token);

        // 모든 API 요청을 병렬로 실행
        const [chatroomData, personaList, messagesData] = await Promise.all([
            chatroomPromise,
            personaPromise,
            messagesPromise
        ]);

        // 메시지를 시간 순서대로 정렬 (API는 최신순으로 반환)
        const messages = (messagesData?.list || []).reverse().map(msg => ({
            role: msg.role,
            content: msg.content
        }));

        // 현재 적용된 페르소나 찾기
        const currentPersonaId = chatroomData?.chatProfile?._id;
        const currentPersona = currentPersonaId
            ? personaList.find(p => p._id === currentPersonaId)
            : personaList.find(p => p.isRepresentative); // 없으면 대표 페르소나

        return {
            title: chatroomData?.title || 'Unknown Chat',
            characterName: chatroomData?.character?.name || 'Unknown Character',
            userNote: chatroomData?.character?.userNote?.content || null,
            userPersona: {
                name: currentPersona?.name || null,
                information: currentPersona?.information || null
            },
            messages: messages
        };
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
            const menuContainer = await waitForElement('.css-uxwch2');

            if (document.getElementById('json-advanced-saver')) {
                return;
            }

            const buttonWrapper = document.createElement('div');
            buttonWrapper.id = 'json-advanced-saver';
            // 다른 메뉴 아이템과 스타일 통일
            buttonWrapper.className = 'css-1dib65l';
            buttonWrapper.style.cssText = "display: flex; cursor: pointer; padding: 10px; margin-top: 8px;";
            buttonWrapper.innerHTML = `
                <p class="css-1xke5yy">
                    <span style="padding-right: 6px;">💾</span>상세 JSON 저장
                </p>
            `;

            const textElement = buttonWrapper.querySelector('p');
            const originalText = textElement.innerHTML;

            buttonWrapper.addEventListener('click', async () => {
                try {
                    textElement.innerHTML = '저장 중...';
                    buttonWrapper.style.pointerEvents = 'none'; // 중복 클릭 방지

                    const chatData = await fetchAllChatData();
                    const finalJson = JSON.stringify(chatData, null, 2);

                    const timestamp = new Date().toISOString().slice(0, 10);
                    const fileName = `${chatData.title}_${timestamp}.json`;

                    downloadFile(finalJson, fileName);
                    alert('채팅 기록을 성공적으로 저장했습니다.');

                } catch (error) {
                    console.error('JSON 저장 실패:', error);
                    alert(`오류가 발생했습니다: ${error.message}`);
                } finally {
                     textElement.innerHTML = originalText;
                     buttonWrapper.style.pointerEvents = 'auto';
                }
            });

            menuContainer.appendChild(buttonWrapper);

        } catch (error) {
            console.error('메뉴 버튼 생성 실패:', error);
        }
    }

    // MutationObserver를 사용하여 페이지 내용 변경 감지 (SPA 환경 대응)
    const observer = new MutationObserver((mutationsList, obs) => {
        // 메뉴 컨테이너가 생성되었는지 확인
        if (document.querySelector('.css-uxwch2')) {
            createMenuButton();
            // 버튼이 생성되면 더 이상 관찰할 필요가 없으므로 관찰 중지
            obs.disconnect();
        }
    });

    // body의 자식 요소 변경을 감지하여 스크립트 실행
    observer.observe(document.body, { childList: true, subtree: true });

})();
