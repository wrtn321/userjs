// ==UserScript==
// @name         🕒 crack timestamp
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  채팅 메시지와 요약 메모리의 생성/수정 시간을 표시
// @author       뤼붕이
// @match        https://crack.wrtn.ai/*
// @grant        none
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // ==========================================
    // 1. 핵심 유틸리티 및 데이터 캐싱
    // ==========================================
    const summaryCache = new Map();

    function scanAndCache(obj) {
        let updated = false;
        const visited = new Set();

        function traverse(curr) {
            if (!curr || typeof curr !== 'object') return;
            if (visited.has(curr)) return;
            visited.add(curr);

            if (Array.isArray(curr)) {
                curr.forEach(traverse);
            } else {
                if (curr.title && curr.createdAt && curr.updatedAt && typeof curr.title === 'string') {
                    const title = curr.title.trim();
                    if (title) {
                        summaryCache.set(title, {
                            createdAt: new Date(curr.createdAt),
                            updatedAt: new Date(curr.updatedAt)
                        });
                        updated = true;
                    }
                }
                Object.values(curr).forEach(traverse);
            }
        }

        try { traverse(obj); } catch(e) {}
        return updated;
    }

    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const response = await originalFetch.apply(this, args);
        try {
            const clone = response.clone();
            clone.json().then(data => {
                if (scanAndCache(data)) {
                    setTimeout(injectSummaryTimestamps, 100);
                }
            }).catch(() => {});
        } catch(e) {}
        return response;
    };

    const originalXHR = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function() {
        this.addEventListener('load', function() {
            try {
                if (this.responseText) {
                    if (scanAndCache(JSON.parse(this.responseText))) {
                        setTimeout(injectSummaryTimestamps, 100);
                    }
                }
            } catch(e) {}
        });
        return originalXHR.apply(this, arguments);
    };

    function scrapeInitialData() {
        try {
            const nextData = document.getElementById('__NEXT_DATA__');
            if (nextData) {
                scanAndCache(JSON.parse(nextData.textContent));
            }
        } catch (e) {
            console.error("Next data parsing error:", e);
        }
    }

    function decodeObjectId(id) {
        if (!id || id.length < 8) return null;
        const hexTimestamp = id.substring(0, 8);
        const unixTimestamp = parseInt(hexTimestamp, 16);
        if (isNaN(unixTimestamp)) return null;
        return new Date(unixTimestamp * 1000);
    }

    function formatDateTime(date) {
        if (!date || isNaN(date)) return '';
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const h = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        return `${y}.${m}.${d} ${h}:${min}`;
    }

    // ==========================================
    // 2. 타임스탬프 UI 주입 로직
    // ==========================================
    function injectMessageTimestamps() {
        document.querySelectorAll('div[data-message-group-id]').forEach(group => {
            if (group.querySelector('.crack-msg-time')) return;
            const msgId = group.getAttribute('data-message-group-id');
            const date = decodeObjectId(msgId);
            if (!date) return;

            const timeEl = document.createElement('div');
            timeEl.className = 'crack-msg-time';
            timeEl.style.cssText = 'font-size: 11.5px; color: var(--text_tertiary, #9ca3af); text-align: right; margin-top: 6px; padding-right: 4px; user-select: none; width: 100%;';
            timeEl.innerText = formatDateTime(date);

            const contentWrapper = group.querySelector('.wrtn-markdown')?.parentElement;
            if (contentWrapper) {
                contentWrapper.appendChild(timeEl);
            }
        });
    }

    function injectSummaryTimestamps() {
        const modal = document.querySelector('div[role="dialog"][data-state="open"]');
        if (!modal) return;

        // [장기 기억] 아코디언 버튼 형태 (유연한 클래스 탐색 적용)
        modal.querySelectorAll('h3 > button').forEach(btn => {
            if (btn.querySelector('.crack-summary-time')) return;

            const titleSpan = btn.querySelector('span.truncate') || btn.querySelector('span.block');
            if (!titleSpan) return;

            const title = titleSpan.innerText.trim();
            const dates = summaryCache.get(title);
            if (dates) {
                const timeEl = document.createElement('div');
                timeEl.className = 'crack-summary-time truncate';
                timeEl.style.cssText = 'font-size: 11.5px; color: var(--text_tertiary, #888); margin-top: 4px; font-weight: normal;';
                timeEl.innerText = `생성: ${formatDateTime(dates.createdAt)} | 수정: ${formatDateTime(dates.updatedAt)}`;
                titleSpan.parentElement.appendChild(timeEl);
            }
        });

        // [단기 기억, 관계도] 단순 리스트 형태 (순서 변경에 강한 선택자 적용)
        modal.querySelectorAll('div.border-b.space-y-4').forEach(item => {
            if (item.querySelector('.crack-summary-time')) return;

            const titleEl = item.querySelector('span[class*="typo-text-"]');
            const contentEl = item.querySelector('p');
            if (!titleEl || !contentEl) return;

            const title = titleEl.innerText.trim();
            const dates = summaryCache.get(title);
            if (dates) {
                const timeEl = document.createElement('div');
                timeEl.className = 'crack-summary-time';
                timeEl.style.cssText = 'font-size: 12px; color: var(--text_tertiary, #888); margin-top: 8px; font-weight: 500;';
                timeEl.innerText = `🕒 생성: ${formatDateTime(dates.createdAt)}  |  ✏️ 수정: ${formatDateTime(dates.updatedAt)}`;
                contentEl.insertAdjacentElement('afterend', timeEl);
            }
        });
    }

    // ==========================================
    // 3. 스크립트 실행 및 화면 변화 감지
    // ==========================================
    let observer = null;
    function initialize() {
        scrapeInitialData();

        if (observer) observer.disconnect();
        observer = new MutationObserver(() => {
            injectMessageTimestamps();
            injectSummaryTimestamps();
        });

        const body = document.querySelector('body');
        if (body) {
            observer.observe(body, { childList: true, subtree: true });
            injectMessageTimestamps();
        }
    }

    // 채팅방(URL) 변경 감지 시 캐시 리셋
    let lastUrl = location.href;
    new MutationObserver(() => {
        const currentUrl = location.href;
        if (currentUrl !== lastUrl) {
            lastUrl = currentUrl;
            summaryCache.clear();
            scrapeInitialData();
            initialize();
        }
    }).observe(document.body, { childList: true, subtree: true });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
})();
