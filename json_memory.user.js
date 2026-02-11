// ==UserScript==
// @name         crack 요약 메모리 백업/복원
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  요약메모리를 JSON으로 백업/복원
// @author       뤼붕이
// @match        https://crack.wrtn.ai/stories/*/episodes/*
// @grant        GM_xmlhttpRequest
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // ===================================================================================
    // PART 1: API 연동 및 유틸리티 함수
    // ===================================================================================
    const API_BASE = "https://crack-api.wrtn.ai";

    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return decodeURIComponent(parts.pop().split(';').shift());
        return null;
    }

    function getUrlInfo() {
        const match = window.location.pathname.match(/\/stories\/[a-f0-9]+\/episodes\/([a-f0-9]+)/);
        return match ? { chatroomId: match[1] } : {};
    }

    function apiRequest(method, url, token, data = null) {
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
                onload: (res) => {
                    if (res.status >= 200 && res.status < 300 || res.status === 304) {
                        try {
                            const responseData = JSON.parse(res.responseText);
                            // API 응답 구조: { result: "SUCCESS", data: { summaries: [], nextCursor: "..." } }
                            // 우리는 data 객체 내부를 반환해야 함
                            if (responseData.data) {
                                resolve(responseData.data);
                            } else {
                                resolve(responseData);
                            }
                        } catch (e) { reject(new Error("JSON 파싱 실패")); }
                    } else { reject(new Error(`API 오류: ${res.status} - ${res.responseText}`)); }
                },
                onerror: (err) => reject(new Error("네트워크 오류"))
            });
        });
    }

    // ===================================================================================
    // PART 2: 백업 및 복원 기능 구현
    // ===================================================================================

    // [핵심 수정] 서버 응답 필드명을 'nextCursor'로 수정
    async function fetchSummariesByType(chatroomId, token, summaryType, button) {
        const allSummaries = [];
        const limit = 20;
        let currentCursor = null; // 현재 사용 중인 커서
        let page = 1;

        while (true) {
            const typeName = { longTerm: '장기', shortTerm: '단기', relationship: '관계도', goal: '목표' }[summaryType];
            button.textContent = `'${typeName}' 기억 불러오는 중... (${page}페이지)`;

            // 기본 URL 생성
            let url = `${API_BASE}/crack-gen/v3/chats/${chatroomId}/summaries?limit=${limit}&type=${summaryType}&orderBy=newest`;

            // [중요] 다음 페이지 티켓(커서)이 있다면 URL에 붙임
            if (currentCursor) {
                url += `&cursor=${encodeURIComponent(currentCursor)}`;
            }

            // 장기기억일 경우 필터 추가
            if (summaryType === 'longTerm') {
                url += '&filter=all';
            }

            // API 요청
            const summaryData = await apiRequest('GET', url, token);
            const fetchedSummaries = summaryData.summaries || [];

            if (fetchedSummaries.length > 0) {
                allSummaries.push(...fetchedSummaries);
            }

            // [수정된 부분] 로그 확인 결과 필드명이 'nextCursor'임
            if (summaryData.nextCursor) {
                currentCursor = summaryData.nextCursor; // 다음 루프 때 쓸 티켓 챙기기
                page++;
            } else {
                // nextCursor가 없으면 더 이상 페이지가 없다는 뜻
                break;
            }

            // 안전장치
            if (fetchedSummaries.length === 0) break;
            if (page > 100) break;
        }
        return allSummaries;
    }


    async function backupSummaries(button) {
        const originalText = button.textContent;
        try {
            button.textContent = '준비 중...';
            button.disabled = true;
            const token = getCookie('access_token');
            const { chatroomId } = getUrlInfo();
            if (!token || !chatroomId) throw new Error('인증 토큰이나 채팅방 ID를 찾을 수 없습니다.');

            const summaryTypes = ['longTerm', 'shortTerm', 'relationship', 'goal'];
            const allData = {};

            for (const type of summaryTypes) {
                const summaries = await fetchSummariesByType(chatroomId, token, type, button);
                if (summaries.length > 0) {
                    allData[type] = summaries;
                }
            }

            if (Object.keys(allData).length === 0) {
                alert('백업할 요약 메모리가 없습니다.');
                button.textContent = originalText;
                button.disabled = false;
                return;
            }

            const chatInfo = await apiRequest('GET', `${API_BASE}/crack-gen/v3/chats/${chatroomId}`, token);
            const title = chatInfo?.story?.title || chatInfo?.title || 'Unknown Chat';
            const filename = `[요약메모리] ${title.replace(/[\\/:*?"<>|]/g, '')}.json`;
            const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json;charset=utf-8' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            button.textContent = '백업 완료!';
        } catch (e) {
            alert(`백업 중 오류 발생: ${e.message}`);
            button.textContent = originalText;
        } finally {
            setTimeout(() => {
                button.textContent = originalText;
                button.disabled = false;
            }, 2000);
        }
    }

    function restoreSummaries(button) {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';
        fileInput.onchange = async (event) => {
            const file = event.target.files[0];
            if (!file) return;
            const originalText = button.textContent;
            button.textContent = '파일 읽는 중...';
            button.disabled = true;
            try {
                const content = await file.text();
                let dataToRestore = JSON.parse(content);

                // 이전 버전(배열)과의 호환성 유지
                if (Array.isArray(dataToRestore)) {
                    dataToRestore = { longTerm: dataToRestore };
                }

                const token = getCookie('access_token');
                const { chatroomId } = getUrlInfo();
                if (!token || !chatroomId) throw new Error('인증 토큰이나 채팅방 ID를 찾을 수 없습니다.');

                // --- longTerm 데이터만 복원 대상으로 지정 ---
                const summariesToInject = dataToRestore.longTerm;

                if (!summariesToInject || !Array.isArray(summariesToInject) || summariesToInject.length === 0) {
                    alert('복원할 장기기억 데이터가 파일에 없거나 형식이 올바르지 않습니다.');
                } else {
                    const total = summariesToInject.length;
                    let successCount = 0;
                    const errors = [];

                    for (const [index, summary] of summariesToInject.reverse().entries()) {
                        if (summary.title && summary.summary) {
                            button.textContent = `장기기억 추가 중... (${index + 1}/${total})`;
                            try {
                                const payload = { title: summary.title, summary: summary.summary, type: "longTerm" };
                                const url = `${API_BASE}/crack-gen/v3/chats/${chatroomId}/summaries`;
                                await apiRequest('POST', url, token, payload);
                                successCount++;
                            } catch (err) {
                                errors.push(`'${summary.title}'`);
                            }
                        }
                    }

                    // [수정됨] 결과 알림창 메시지 포맷 변경
                    let resultMsg = `장기기억 복원 완료!\n\n성공: ${successCount} / ${total}`;

                    if (errors.length > 0) {
                        // 실패한 갯수 표시
                        resultMsg += `\n실패: ${errors.length}건 (아마도 갯수(100개) 제한 초과)`;
                        resultMsg += `\n\n[추가실패 목록]\n[${errors.join(', ')}]`;
                    }

                    alert(resultMsg);
                }

            } catch (e) {
                alert(`복원 중 오류 발생: ${e.message}`);
            } finally {
                button.textContent = originalText;
                button.disabled = false;
            }
        };
        fileInput.click();
    }


    // ===================================================================================
    // PART 3: UI 생성 및 스크립트 실행
    // ===================================================================================

    function createButtons(footerContainer) {
        if (footerContainer.querySelector('#summary-backup-restore-container')) {
            return;
        }

        const container = document.createElement('div');
        container.id = 'summary-backup-restore-container';
        container.style.display = 'flex';
        container.style.gap = '8px';

        const backupButton = document.createElement('button');
        backupButton.textContent = 'JSON 백업';
        backupButton.onclick = () => backupSummaries(backupButton);

        const restoreButton = document.createElement('button');
        restoreButton.textContent = 'JSON 복원';
        restoreButton.onclick = () => restoreSummaries(restoreButton);

        [backupButton, restoreButton].forEach(btn => {
            btn.className = "relative inline-flex items-center justify-center gap-1 overflow-hidden whitespace-nowrap text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:pointer-events-none disabled:opacity-50 h-9 rounded-md px-4 py-2 border border-solid border-border bg-background text-foreground hover:bg-accent active:bg-accent/80";
            btn.type = 'button';
        });

        container.appendChild(backupButton);
        container.appendChild(restoreButton);

        footerContainer.prepend(container);
    }

    const observer = new MutationObserver((mutationsList, observer) => {
        const modalTitle = Array.from(document.querySelectorAll('h2')).find(h2 => h2.textContent.trim() === '요약 메모리');
        if (!modalTitle) return;

        const modal = modalTitle.closest('div[role="dialog"]');
        if (!modal) return;

        const editButton = Array.from(modal.querySelectorAll('button')).find(btn => btn.textContent.trim() === '편집');
        if (editButton && editButton.parentElement) {
            const footerContainer = editButton.parentElement;
            if (footerContainer.matches('[class*="sm:justify-end"]')) {
                 createButtons(footerContainer);
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

})();
