// ==UserScript==
// @name         💾 채팅로그 json 다운
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  채팅 로그를 JSON으로 저장
// @author       뤼붕이
// @match        https://crack.wrtn.ai/*
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

    async function fetchAllSummariesByType(chatroomId, token, summaryType) {
        const allSummaries = [];
        const limit = 20;
        let currentCursor = null;
        let page = 1;

        while (true) {
            let url = `${API_BASE}/crack-gen/v3/chats/${chatroomId}/summaries?limit=${limit}&type=${summaryType}&orderBy=newest`;
            if (currentCursor) {
                url += `&cursor=${encodeURIComponent(currentCursor)}`;
            }
            if (summaryType === 'longTerm') {
                url += '&filter=all';
            }

            const summaryData = await apiRequest(url, token);
            const fetchedSummaries = summaryData.summaries || [];

            if (fetchedSummaries.length > 0) {
                allSummaries.push(...fetchedSummaries);
            }

            if (summaryData.nextCursor) {
                currentCursor = summaryData.nextCursor;
                page++;
            } else {
                break;
            }

            if (fetchedSummaries.length === 0) break;
            if (page > 200) break;
        }
        return allSummaries;
    }

    async function fetchAllDataForJsonExport() {
        const token = getCookie('access_token');
        const { chatroomId } = getUrlInfo();
        if (!token || !chatroomId) throw new Error('채팅방 정보를 읽을 수 없습니다.');

        const [chatDetails, messageData, profileInfo, longTermMem, shortTermMem, relationshipMem, goalMem] = await Promise.all([
            apiRequest(`${API_BASE}/crack-gen/v3/chats/${chatroomId}`, token),
            apiRequest(`${API_BASE}/crack-gen/v3/chats/${chatroomId}/messages?limit=2000`, token),
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
                const persona = personaList.find(p => p._id === activePersonaId) || personaList.find(p => p.isRepresentative) || personaList[0];
                if (persona) {
                    userPersona = { name: persona.name, information: persona.information };
                }
            }
        } catch (e) {
            console.error("페르소나 정보를 가져오는 데 실패했습니다:", e);
        }


        const messages = (messageData?.messages || []).reverse();

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
                // chatDetails 전체를 저장
                chatDetails: data.chatDetails,
                userNote: data.userNote,
                userPersona: {
                    name: data.userPersona?.name || null,
                    information: data.userPersona?.information || null
                },
                summaryMemory: data.summaryMemory,
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
