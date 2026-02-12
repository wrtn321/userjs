// ==UserScript==
// @name         채팅로그 json 다운
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  채팅 로그를 지정된 형식의 JSON으로 저장
// @author       뤼붕이
// @match        https://crack.wrtn.ai/stories/*/episodes/*
// @downloadURL  https://raw.githubusercontent.com/wrtn321/userjs/main/json_log.user.js
// @updateURL    https://raw.githubusercontent.com/wrtn321/userjs/main/json_log.user.js
// @grant        GM_xmlhttpRequest
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // ===================================================================================
    // PART 1: API 연동 로직
    // ===================================================================================
    const API_BASE = "https://crack-api.wrtn.ai";

    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return decodeURIComponent(parts.pop().split(';').shift());
        return null;
    }

    function apiRequest(url, token, method = "GET", data = null) {
        const wrtnId = getCookie('__w_id');
        return new Promise((resolve, reject) => {
            const headers = {
                'Authorization': `Bearer ${token}`,
                'platform': 'web',
                'x-wrtn-id': wrtnId || ''
            };
            if (data) {
                headers['Content-Type'] = 'application/json';
            }
            GM_xmlhttpRequest({
                method: method,
                url: url,
                headers: headers,
                data: data ? JSON.stringify(data) : null,
                onload: function(response) {
                    if (response.status >= 200 && response.status < 300) {
                        try {
                            const responseData = JSON.parse(response.responseText);
                            // API 구조상 data 안에 nextCursor가 존재하므로 data를 반환해야 함
                            resolve(responseData.data !== undefined ? responseData.data : responseData);
                        } catch (e) {
                            reject(new Error("JSON 파싱 오류"));
                        }
                    } else {
                        reject(new Error(`API 오류: ${response.status}`));
                    }
                },
                onerror: () => reject(new Error("네트워크 오류"))
            });
        });
    }

    function getUrlInfo() {
        const m = window.location.pathname.match(/\/stories\/([a-f0-9]+)\/episodes\/([a-f0-9]+)/);
        return m ? { chatroomId: m[2] } : {};
    }

    // Cursor 로직 적용
    async function fetchAllSummariesByType(chatroomId, token, summaryType) {
        const allSummaries = [];
        const limit = 20;
        let currentCursor = null; // 다음 페이지를 위한 커서
        let page = 1;

        while (true) {
            // 기본 URL 생성
            let url = `${API_BASE}/crack-gen/v3/chats/${chatroomId}/summaries?limit=${limit}&type=${summaryType}&orderBy=newest`;

            // 커서가 존재하면 URL에 추가
            if (currentCursor) {
                url += `&cursor=${encodeURIComponent(currentCursor)}`;
            }

            // 장기 기억일 경우 필터 추가
            if (summaryType === 'longTerm') {
                url += '&filter=all';
            }

            const summaryData = await apiRequest(url, token);
            const fetchedSummaries = summaryData.summaries || [];

            if (fetchedSummaries.length > 0) {
                allSummaries.push(...fetchedSummaries);
            }

            // [핵심] nextCursor 확인하여 다음 루프 결정
            if (summaryData.nextCursor) {
                currentCursor = summaryData.nextCursor;
                page++;
            } else {
                // 더 이상 커서가 없으면 종료
                break;
            }

            // 안전장치 (무한 루프 방지)
            if (fetchedSummaries.length === 0) break;
            if (page > 200) break; // 페이지 제한을 200으로 설정 (필요시 조정)
        }
        return allSummaries;
    }

    // JSON 저장을 위해 필요한 모든 데이터를 가져오는 함수
    async function fetchAllDataForJsonExport() {
        const token = getCookie('access_token');
        const { chatroomId } = getUrlInfo();
        if (!token || !chatroomId) throw new Error('채팅방 정보를 읽을 수 없습니다.');

        // 5가지 주요 정보를 병렬로 요청
        // 각 요약 메모리 함수가 이제 Cursor 방식으로 동작함
        const [chatDetails, messageData, profileInfo, longTermMem, shortTermMem, relationshipMem, goalMem] = await Promise.all([
            apiRequest(`${API_BASE}/crack-gen/v3/chats/${chatroomId}`, token),
            apiRequest(`${API_BASE}/crack-gen/v3/chats/${chatroomId}/messages?limit=2000`, token), // 메시지는 최대 2000개까지
            apiRequest(`${API_BASE}/crack-api/profiles`, token),
            fetchAllSummariesByType(chatroomId, token, 'longTerm'),
            fetchAllSummariesByType(chatroomId, token, 'shortTerm'),
            fetchAllSummariesByType(chatroomId, token, 'relationship'),
            fetchAllSummariesByType(chatroomId, token, 'goal')
        ]);

        const userNote = chatDetails?.story?.userNote?.content || null;
        let userPersona = { name: null, information: null };

        try {
            if (profileInfo?._id) {
                const personaResponse = await apiRequest(`${API_BASE}/crack-api/profiles/${profileInfo._id}/chat-profiles`, token);
                const personaList = personaResponse?.chatProfiles || [];
                const activePersonaId = chatDetails?.chatProfile?._id;
                // 활성 페르소나를 우선 찾고, 없으면 대표 페르소나, 그것도 없으면 첫 번째 페르소나를 사용
                const persona = personaList.find(p => p._id === activePersonaId) || personaList.find(p => p.isRepresentative) || personaList[0];
                if (persona) {
                    userPersona = { name: persona.name, information: persona.information };
                }
            }
        } catch (e) {
            console.error("페르소나 정보를 가져오는 데 실패했습니다:", e);
        }

        const messages = (messageData?.messages || []).reverse().map(msg => ({
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: msg.content
        }));

        const summaryMemory = {
            longTerm: longTermMem,
            shortTerm: shortTermMem,
            relationship: relationshipMem,
            goal: goalMem
        };

        return { chatDetails, userNote, userPersona, summaryMemory, messages };
    }


    // ===================================================================================
    // PART 2: JSON 생성 및 다운로드 로직
    // ===================================================================================

    // 파일 다운로드 헬퍼 함수
    function downloadFile(content, filename, type = 'application/json') {
        const blob = new Blob([content], { type: `${type};charset=utf-8` });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // JSON 저장 메인 로직
    async function saveChatAsJson(button) {
        const btnText = button.querySelector('.btn-text');
        if (!btnText) return;

        const originalText = btnText.textContent;
        try {
            btnText.textContent = '데이터 수집 중...';
            button.disabled = true;

            const data = await fetchAllDataForJsonExport();

            const output = {
                title: data.chatDetails?.story?.title || data.chatDetails?.title || 'Unknown Chat',
                characterName: data.chatDetails?.story?.name || 'Unknown Character',
                savedAt: new Date().toISOString(),
                userNote: data.userNote,
                userPersona: {
                    name: data.userPersona?.name || null,
                    information: data.userPersona?.information || null
                },
                summaryMemory: data.summaryMemory, // 요약 메모리 추가
                messages: data.messages
            };

            const filename = `${output.title.replace(/[\\/:*?"<>|]/g, '')}_${new Date().toISOString().slice(0, 10)}.json`;
            downloadFile(JSON.stringify(output, null, 2), filename);

            btnText.textContent = '저장 완료!';
            setTimeout(() => {
                btnText.textContent = originalText;
                button.disabled = false;
            }, 2000);

        } catch (error) {
            alert(`JSON 저장 중 오류가 발생했습니다: ${error.message}`);
            console.error('[JSON 저장 오류]', error);
            btnText.textContent = originalText;
            button.disabled = false;
        }
    }


    // ===================================================================================
    // PART 3: UI 생성 및 스크립트 실행
    // ===================================================================================

    function waitForElement(selector) {
        return new Promise(resolve => {
            const interval = setInterval(() => {
                const element = document.querySelector(selector);
                if (element) {
                    clearInterval(interval);
                    resolve(element);
                }
            }, 100);
        });
    }

    async function createMenuButton() {
        const container = await waitForElement('.py-4.overflow-y-auto.scrollbar > .px-2:first-of-type');
        if (!container || document.getElementById('json-save-button-standalone')) return;

        const btnWrapper = document.createElement('div');
        btnWrapper.id = 'json-save-button-standalone';
        btnWrapper.className = 'px-2.5 h-4 box-content py-[18px]';
        btnWrapper.innerHTML = `
            <button class="w-full flex h-4 items-center justify-between typo-110-16-med space-x-2 [&amp;_svg]:fill-icon_tertiary ring-offset-4 ring-offset-sidebar" style="cursor: pointer;">
                <span class="flex space-x-2 items-center">
                    <span style="font-size: 16px;">💾</span>
                    <span class="btn-text whitespace-nowrap overflow-hidden text-ellipsis typo-text-sm_leading-none_medium">JSON 저장</span>
                </span>
            </button>
        `;

        btnWrapper.onclick = () => saveChatAsJson(btnWrapper.querySelector('button'));

        container.appendChild(btnWrapper);
    }

    const observer = new MutationObserver(() => {
        if (!document.getElementById('json-save-button-standalone')) {
             createMenuButton();
        }
    });

    waitForElement('body').then(body => {
        observer.observe(body, { childList: true, subtree: true });
        createMenuButton();
    });

})();
