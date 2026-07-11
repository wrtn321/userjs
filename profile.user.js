// ==UserScript==
// @name         👤 뤼튼 개별 대화프로필
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  crack의 맨 마지막 대화프로필을 이용하여 방 개별 대화프로필 설정
// @author       뤼붕이
// @match        https://crack.wrtn.ai/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const BASE_DOMAIN = "https://crack-api.wrtn.ai";

    // ===================================================================================
    // 유틸리티 및 API 로직
    // ===================================================================================
    function getCookie(name) {
        const value = `; ${document.cookie}`; const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return decodeURIComponent(parts.pop().split(';').shift());
        return null;
    }

    function getChatroomId() {
        const m = window.location.pathname.match(/\/stories\/([a-f0-9]+)\/episodes\/([a-f0-9]+)/);
        return m ? m[2] : null;
    }

    async function wrtnApiRequest(url, method = "GET", data = null) {
        const token = getCookie('access_token');
        const wrtnId = getCookie('__w_id');
        const headers = {
            'Authorization': `Bearer ${token}`,
            'platform': 'web',
            'x-wrtn-id': wrtnId || '',
            'Content-Type': 'application/json'
        };
        const response = await fetch(url, { method, headers, credentials: 'omit', body: data ? JSON.stringify(data) : null });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        if (!text) return {};
        const parsed = JSON.parse(text);
        return parsed.data !== undefined ? parsed.data : parsed;
    }

    // ===================================================================================
    // 실시간 상태 캐싱 및 사이드바 렌더링 (UI 락킹 적용)
    // ===================================================================================
    let sidebarCache = { roomId: null, name: "", isLast: false };
    let isSidebarLocked = false;

    function renderSidebar() {
        const menuSpans = document.querySelectorAll('span.typo-text-sm_leading-none_medium');
        let targetSpan = Array.from(menuSpans).find(el => el.textContent.startsWith('대화 프로필'));
        if (!targetSpan) return;

        let displayName = "대화 프로필";
        const currentRoomId = getChatroomId();

        if (sidebarCache.roomId === currentRoomId && sidebarCache.name) {
            const overrides = JSON.parse(localStorage.getItem("wrtn_room_profiles") || "{}");
            const roomData = overrides[currentRoomId];
            const isActive = roomData ? (roomData.isActive !== false) : false;

            const nameColor = (sidebarCache.isLast && isActive) ? "#3b82f6" : "var(--text_primary, #000)";
            displayName = `대화 프로필 <span style="color:${nameColor}; font-size:11px; margin-left:4px;">[${sidebarCache.name}]</span>`;
        }

        if (targetSpan.innerHTML !== displayName) {
            targetSpan.innerHTML = displayName;
        }
    }

    async function refreshSidebarCache() {
        if (isSidebarLocked) return;

        const roomId = getChatroomId();
        if (!roomId) return;
        try {
            const chatData = await wrtnApiRequest(`${BASE_DOMAIN}/crack-gen/v3/chats/${roomId}`);
            const currentProfileId = chatData?.chatProfile?._id;
            if (!currentProfileId) return;

            const pInfo = await wrtnApiRequest(`${BASE_DOMAIN}/crack-api/profiles`);
            const listRes = await wrtnApiRequest(`${BASE_DOMAIN}/crack-api/profiles/${pInfo._id}/chat-profiles`);
            const profiles = listRes.chatProfiles || [];

            if (profiles.length === 0) return;

            const currentProfile = profiles.find(p => p._id === currentProfileId);
            const isLast = (currentProfileId === profiles[profiles.length - 1]._id);

            sidebarCache = { roomId, name: currentProfile ? currentProfile.name : "알 수 없음", isLast };
            renderSidebar();
        } catch(e) { console.error("[V13] 상태 갱신 실패:", e); }
    }

    // ===================================================================================
    // 핵심 로직: 맨 마지막 프로필 타겟 덮어쓰기
    // ===================================================================================
    let isSyncing = false;

    async function syncRoomProfile(roomId) {
        if (isSyncing || !roomId) return;
        const overrides = JSON.parse(localStorage.getItem("wrtn_room_profiles") || "{}");
        const roomData = overrides[roomId];

        if (!roomData || roomData.isActive === false) {
            await refreshSidebarCache();
            return;
        }

        isSyncing = true;
        try {
            const pInfo = await wrtnApiRequest(`${BASE_DOMAIN}/crack-api/profiles`);
            const userId = pInfo._id;

            const listRes = await wrtnApiRequest(`${BASE_DOMAIN}/crack-api/profiles/${userId}/chat-profiles`);
            const profiles = listRes.chatProfiles || [];

            if (profiles.length === 0) throw new Error("프로필이 하나도 없습니다.");

            const targetProfile = profiles[profiles.length - 1];
            const truncatedInfo = roomData.information.substring(0, 100);

            await wrtnApiRequest(`${BASE_DOMAIN}/crack-api/profiles/${userId}/chat-profiles/${targetProfile._id}`, "PATCH", {
                name: roomData.name,
                information: truncatedInfo
            });

            await wrtnApiRequest(`${BASE_DOMAIN}/crack-gen/v3/chats/${roomId}`, "PATCH", {
                chatProfileId: targetProfile._id
            });

        } catch(e) {
            console.error("[V13] 동기화 실패:", e);
        } finally {
            isSyncing = false;
        }
    }

    let lastRoomId = null;
    function checkUrlChange() {
        const currentRoomId = getChatroomId();
        if (currentRoomId && currentRoomId !== lastRoomId) {
            lastRoomId = currentRoomId;
            refreshSidebarCache().then(() => syncRoomProfile(currentRoomId));
        }
    }

    const originalPush = history.pushState;
    history.pushState = function() { originalPush.apply(this, arguments); setTimeout(checkUrlChange, 100); };
    const originalReplace = history.replaceState;
    history.replaceState = function() { originalReplace.apply(this, arguments); setTimeout(checkUrlChange, 100); };
    window.addEventListener('popstate', () => setTimeout(checkUrlChange, 100));

    // ===================================================================================
    // ✨ 모달창 [현재] 배지 및 테두리 강제 동기화
    // ===================================================================================
    setInterval(() => {
        if (!document.getElementById('jit-custom-profile-card')) return;
        const roomId = getChatroomId();
        if (!roomId) return;

        const data = JSON.parse(localStorage.getItem("wrtn_room_profiles") || "{}");
        const isActive = data[roomId] ? (data[roomId].isActive !== false) : false;

        const listContainer = document.querySelector('div[role="dialog"] .overflow-y-scroll > div > .flex-col.gap-4');
        if (!listContainer) return;

        const cards = listContainer.querySelectorAll('.flex-col.p-4.gap-2.rounded-lg.bg-surface_tertiary:not(#jit-custom-profile-card)');
        if (cards.length === 0) return;

        cards.forEach((card, index) => {
            // 뤼튼 순정 [현재] 배지
            const nativeBadge = Array.from(card.querySelectorAll('div')).find(div => div.textContent.trim() === '현재' && div.className.includes('bg-surface_chat_primary'));
            const customBadge = card.querySelector('.jit-custom-current-badge');
            const headerLeft = card.querySelector('.flex.flex-row.items-center.gap-2');

            if (isActive) {
                // [커스텀 ON] 순정 배지 숨기기 & 순정 검은 테두리 지우기
                if (nativeBadge && nativeBadge.style.display !== 'none') {
                    nativeBadge.style.display = 'none';
                }
                if (card.classList.contains('border-outline_primary')) {
                    card.classList.remove('border', 'border-outline_primary');
                }

                // 맨 마지막 더미 프로필에만 파란색 [현재] 배지 주입
                if (index === cards.length - 1) {
                    if (!customBadge && headerLeft) {
                        const blueBadge = document.createElement('div');
                        blueBadge.className = 'flex flex-row px-2 h-[22px] rounded items-center jit-custom-current-badge';
                        blueBadge.style.backgroundColor = '#3b82f6';
                        blueBadge.innerHTML = '<span class="typo-text-sm_leading-none_medium" style="color:#ffffff;">현재</span>';
                        headerLeft.prepend(blueBadge);
                    }
                } else {
                    if (customBadge) customBadge.remove();
                }
            } else {
                // [커스텀 OFF] 순정 배지 복구 및 파란 배지 삭제
                if (nativeBadge && nativeBadge.style.display === 'none') {
                    nativeBadge.style.display = '';
                }
                // 배지가 있는 순정 카드는 테두리 복구
                if (nativeBadge && !card.classList.contains('border-outline_primary')) {
                    card.classList.add('border', 'border-outline_primary');
                }
                if (customBadge) customBadge.remove();
            }
        });

        // 커스텀 카드의 테두리 동기화 (켜짐: 파란색, 꺼짐: 회색)
        const customCard = document.getElementById('jit-custom-profile-card');
        if (customCard) {
            customCard.style.border = isActive ? '2px solid #3b82f6' : '1px solid var(--outline_primary, #ccc)';
        }
    }, 100);

    // ===================================================================================
    // UI
    // ===================================================================================
    function injectProfileEditor() {
        const modalHeader = document.querySelector('div[role="dialog"] h2');
        if (!modalHeader || modalHeader.textContent !== '대화 프로필') return;

        const listContainer = document.querySelector('div[role="dialog"] .overflow-y-scroll > div > .flex-col.gap-4');
        if (!listContainer) return;

        const roomId = getChatroomId();
        if (!roomId) return;

        const existingCards = listContainer.querySelectorAll('.flex-col.p-4.gap-2.rounded-lg.bg-surface_tertiary:not(#jit-custom-profile-card)');
        existingCards.forEach(card => {

            // 수동 클릭(변경) 감지 로직
            if (!card.dataset.listenerAttached) {
                card.addEventListener('click', (e) => {
                    if(e.target.closest('button')) return;

                    let data = JSON.parse(localStorage.getItem("wrtn_room_profiles") || "{}");
                    if (data[roomId] && data[roomId].isActive !== false) {
                        data[roomId].isActive = false;
                        localStorage.setItem("wrtn_room_profiles", JSON.stringify(data));

                        const badge = document.getElementById('jit-status-badge');
                        if(badge) {
                            badge.style.backgroundColor = '#9ca3af';
                            badge.textContent = '자동설정 OFF';
                            document.getElementById('jit-display-name').style.color = 'var(--text_secondary, #888)';
                            document.getElementById('jit-display-name').style.textDecoration = 'line-through';
                        }
                    }

                    isSidebarLocked = true;
                    const nameSpan = card.querySelector('span.typo-text-base_leading-none_semibold');
                    if(nameSpan) {
                        sidebarCache.roomId = roomId;
                        sidebarCache.name = nameSpan.textContent.trim();
                        const allCards = listContainer.querySelectorAll('.flex-col.p-4.gap-2.rounded-lg.bg-surface_tertiary:not(#jit-custom-profile-card)');
                        sidebarCache.isLast = (card === allCards[allCards.length - 1]);
                        renderSidebar();
                    }

                    setTimeout(() => {
                        isSidebarLocked = false;
                        refreshSidebarCache();
                    }, 2000);
                });
                card.dataset.listenerAttached = "true";
            }

            if (card.querySelector('.jit-import-btn')) return;

            const headerWrapper = card.querySelector('.flex.flex-row.gap-2.justify-between.items-center');
            const dotsBtn = card.querySelector('button[aria-haspopup="menu"]');

            if (!headerWrapper || !dotsBtn) return;

            const importBtn = document.createElement('button');
            importBtn.className = 'jit-import-btn';
            importBtn.title = "이 프로필을 설정창으로 복사해오기";
            importBtn.style.cssText = "margin-right:8px; margin-left:auto; cursor:pointer; background:none; border:none; padding:4px; display:flex; align-items:center; justify-content:center; border-radius:4px; transition:background 0.2s;";
            importBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>`;

            importBtn.onmouseover = () => importBtn.style.background = 'rgba(59, 130, 246, 0.15)';
            importBtn.onmouseout = () => importBtn.style.background = 'none';

            importBtn.onclick = (e) => {
                e.stopPropagation();
                const nameSpan = card.querySelector('span.typo-text-base_leading-none_semibold');
                const infoP = card.querySelector('p.typo-text-md_leading-none_medium');
                const nameInput = document.getElementById('jit-input-name');
                const infoInput = document.getElementById('jit-input-info');

                if (nameInput && infoInput) {
                    nameInput.value = nameSpan ? nameSpan.textContent.trim() : "";
                    infoInput.value = infoP ? infoP.textContent.trim() : "";

                    document.getElementById('jit-view-mode').style.display = 'none';
                    document.getElementById('jit-edit-mode').style.display = 'flex';
                    document.getElementById('jit-btn-cancel').style.display = 'block';

                    setTimeout(() => { infoInput.dispatchEvent(new Event('input')); }, 10);
                }
            };

            headerWrapper.insertBefore(importBtn, dotsBtn);
        });

        if (document.getElementById('jit-custom-profile-card')) return;

        const overrides = JSON.parse(localStorage.getItem("wrtn_room_profiles") || "{}");
        const roomData = overrides[roomId];
        const hasProfile = !!roomData;
        const isActive = hasProfile ? (roomData.isActive !== false) : false;

        const pName = hasProfile ? roomData.name : "";
        const pInfo = hasProfile ? roomData.information : "";

        const presets = JSON.parse(localStorage.getItem("wrtn_local_presets") || "[]");
        let presetOptions = `<option value="" style="background:#2e2d2b; color:#f0efeb;">💾 프리셋</option>`;
        presets.forEach((p, idx) => {
            presetOptions += `<option value="${idx}" style="background:#2e2d2b; color:#f0efeb;">${p.name}</option>`;
        });

        // customCard 스타일에서 border는 100ms 옵저버가 관리하므로 초기값만 부여
        const customCardHTML = `
            <div id="jit-custom-profile-card" style="display:flex; flex-direction:column; padding:16px; gap:12px; border-radius:8px; border:${isActive ? '2px solid #3b82f6' : '1px solid var(--outline_primary, #ccc)'}; background:var(--surface_tertiary, #f9fafb); margin-bottom:12px;">

                <div style="font-size:12px; color:#ef4444; font-weight:700; margin-bottom:-4px;">
                    ⚠️ 맨 마지막 대화프로필이 아래 내용으로 덮어써집니다. 기존의 마지막 프로필은 지워집니다.
                </div>

                <div id="jit-view-mode" style="display: ${hasProfile ? 'block' : 'none'};">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span id="jit-status-badge" style="background-color:${isActive ? '#3b82f6' : '#9ca3af'}; color:#ffffff; padding:4px 8px; border-radius:4px; font-size:12px; font-weight:700; line-height:1; cursor:pointer;" title="클릭하여 상태 전환">
                                ${isActive ? '자동설정 ON' : '자동설정 OFF'}
                            </span>
                            <span id="jit-display-name" style="font-size:16px; font-weight:700; color:${isActive ? 'var(--text_primary, #000)' : 'var(--text_secondary, #888)'}; text-decoration:${isActive ? 'none' : 'line-through'};">${pName}</span>
                        </div>
                    </div>
                    <p id="jit-display-info" style="font-size:14px; font-weight:500; color:var(--text_secondary, #555); white-space:pre-wrap; margin:0;">${pInfo}</p>

                    <div style="display:flex; gap:8px; margin-top:12px; justify-content:flex-end;">
                        <button id="jit-btn-edit" style="padding:6px 14px; border-radius:6px; background-color:#3b82f6; color:#ffffff; border:none; font-size:13px; font-weight:700; cursor:pointer;">수정</button>
                    </div>
                </div>

                <div id="jit-edit-mode" style="display: ${hasProfile ? 'none' : 'flex'}; flex-direction: column; gap: 8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; background:transparent; border:1px solid var(--outline_primary, #ccc); padding:6px; border-radius:6px;">
                        <select id="jit-preset-select" style="padding:4px; border-radius:4px; border:none; background:transparent; color:var(--text_primary, #000); font-size:12px; font-weight:600; outline:none; max-width:180px;">
                            ${presetOptions}
                        </select>
                        <div style="display:flex; gap:4px;">
                            <button id="jit-preset-del" title="선택한 프리셋 삭제" style="padding:4px 8px; border-radius:4px; border:none; background:#ef4444; color:#fff; font-size:11px; font-weight:bold; cursor:pointer;">삭제</button>
                            <button id="jit-preset-save" title="현재 입력창 내용을 프리셋으로 저장" style="padding:4px 8px; border-radius:4px; border:none; background:#10b981; color:#fff; font-size:11px; font-weight:bold; cursor:pointer;">+프리셋 추가</button>
                        </div>
                    </div>
                    <input type="text" id="jit-input-name" placeholder="페르소나 이름" value="${pName}" style="padding:10px; border-radius:6px; border:1px solid var(--outline_primary, #ccc); background:transparent; color:var(--text_primary, #000); font-size:14px; font-weight:600; outline:none;" />
                    <textarea id="jit-input-info" placeholder="페르소나 설명" style="padding:10px; border-radius:6px; border:1px solid var(--outline_primary, #ccc); background:transparent; color:var(--text_primary, #000); font-size:14px; font-weight:500; min-height:80px; resize:none; overflow:hidden; outline:none;">${pInfo}</textarea>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span id="jit-char-count" style="font-size:12px; font-weight:bold; color:var(--text_secondary, #888);">0 / 100자 (초과분은 서버 전송 시 잘림)</span>
                    </div>
                    <div style="display:flex; gap:8px; margin-top:4px; justify-content:flex-end;">
                        <button id="jit-btn-cancel" style="display: ${hasProfile ? 'block' : 'none'}; padding:8px 16px; border-radius:6px; background:transparent; color:var(--text_primary, #000); border:1px solid var(--outline_primary, #ccc); font-size:13px; font-weight:600; cursor:pointer;">취소</button>
                        <button id="jit-btn-apply" style="padding:8px 16px; border-radius:6px; background-color:#3b82f6; color:#ffffff; border:none; font-size:13px; font-weight:700; cursor:pointer;">저장 및 덮어쓰기</button>
                    </div>
                </div>
            </div>
            <div class="w-full h-[1px] bg-outline_primary my-2"></div>
        `;

        listContainer.insertAdjacentHTML('afterbegin', customCardHTML);

        document.getElementById('jit-status-badge').onclick = async () => {
            let data = JSON.parse(localStorage.getItem("wrtn_room_profiles") || "{}");
            if (!data[roomId]) return;

            const badge = document.getElementById('jit-status-badge');
            const nameEl = document.getElementById('jit-display-name');

            data[roomId].isActive = !data[roomId].isActive;
            localStorage.setItem("wrtn_room_profiles", JSON.stringify(data));

            isSidebarLocked = true;

            if (data[roomId].isActive) {
                badge.textContent = "동기화 중...";
                sidebarCache.roomId = roomId;
                sidebarCache.name = data[roomId].name;
                sidebarCache.isLast = true;
                renderSidebar();

                await syncRoomProfile(roomId);

                badge.style.backgroundColor = '#3b82f6';
                badge.textContent = '자동설정 ON';
                nameEl.style.color = 'var(--text_primary, #000)';
                nameEl.style.textDecoration = 'none';
            } else {
                badge.style.backgroundColor = '#9ca3af';
                badge.textContent = '자동설정 OFF';
                nameEl.style.color = 'var(--text_secondary, #888)';
                nameEl.style.textDecoration = 'line-through';
                renderSidebar();
            }

            setTimeout(() => {
                isSidebarLocked = false;
                refreshSidebarCache();
            }, 2000);
        };

        const infoInput = document.getElementById('jit-input-info');
        const countSpan = document.getElementById('jit-char-count');
        const updateTextarea = () => {
            infoInput.style.height = 'auto';
            infoInput.style.height = (infoInput.scrollHeight) + 'px';
            const len = infoInput.value.length;
            countSpan.textContent = `${len} / 100자 (초과분은 서버 전송 시 잘림)`;
            countSpan.style.color = len > 100 ? '#ef4444' : 'var(--text_secondary, #888)';
        };
        infoInput.addEventListener('input', updateTextarea);
        setTimeout(updateTextarea, 10);

        const presetSelect = document.getElementById('jit-preset-select');
        presetSelect.addEventListener('change', (e) => {
            const idx = e.target.value;
            if (idx === "") return;
            const currentPresets = JSON.parse(localStorage.getItem("wrtn_local_presets") || "[]");
            if (currentPresets[idx]) {
                document.getElementById('jit-input-name').value = currentPresets[idx].name;
                document.getElementById('jit-input-info').value = currentPresets[idx].information;
                updateTextarea();
            }
        });

        document.getElementById('jit-preset-save').onclick = () => {
            const name = document.getElementById('jit-input-name').value.trim();
            const info = document.getElementById('jit-input-info').value.trim();
            if(!name) return alert("프리셋으로 저장할 이름을 입력하세요.");

            let currentPresets = JSON.parse(localStorage.getItem("wrtn_local_presets") || "[]");
            currentPresets.push({ name, information: info });
            localStorage.setItem("wrtn_local_presets", JSON.stringify(currentPresets));

            const newOptions = `<option value="" style="background:#2e2d2b; color:#f0efeb;">💾 프리셋</option>` +
                currentPresets.map((p, i) => `<option value="${i}" style="background:#2e2d2b; color:#f0efeb;">${p.name}</option>`).join('');
            presetSelect.innerHTML = newOptions;
            presetSelect.value = currentPresets.length - 1;
            alert("프리셋에 추가되었습니다!");
        };

        document.getElementById('jit-preset-del').onclick = () => {
            const idx = presetSelect.value;
            if (idx === "") return alert("삭제할 프리셋을 드롭다운에서 선택하세요.");
            let currentPresets = JSON.parse(localStorage.getItem("wrtn_local_presets") || "[]");
            if(confirm(`'${currentPresets[idx].name}' 프리셋을 삭제할까요?`)) {
                currentPresets.splice(idx, 1);
                localStorage.setItem("wrtn_local_presets", JSON.stringify(currentPresets));
                presetSelect.innerHTML = `<option value="" style="background:#2e2d2b; color:#f0efeb;">💾 프리셋</option>` +
                    currentPresets.map((p, i) => `<option value="${i}" style="background:#2e2d2b; color:#f0efeb;">${p.name}</option>`).join('');
                document.getElementById('jit-input-name').value = "";
                document.getElementById('jit-input-info').value = "";
                updateTextarea();
            }
        };

        const viewMode = document.getElementById('jit-view-mode');
        const editMode = document.getElementById('jit-edit-mode');

        document.getElementById('jit-btn-edit').onclick = () => {
            viewMode.style.display = 'none';
            editMode.style.display = 'flex';
            document.getElementById('jit-btn-cancel').style.display = 'block';
            setTimeout(updateTextarea, 10);
        };

        document.getElementById('jit-btn-cancel').onclick = () => {
            viewMode.style.display = 'block';
            editMode.style.display = 'none';
            document.getElementById('jit-input-name').value = document.getElementById('jit-display-name').textContent;
            document.getElementById('jit-input-info').value = document.getElementById('jit-display-info').textContent;
        };

        document.getElementById('jit-btn-apply').onclick = async () => {
            const newName = document.getElementById('jit-input-name').value.trim();
            const newInfo = document.getElementById('jit-input-info').value.trim();
            if (!newName) return alert("이름을 입력해주세요!");

            const btn = document.getElementById('jit-btn-apply');
            const originalText = btn.textContent;
            btn.textContent = "서버 동기화 중...";
            btn.disabled = true;

            let data = JSON.parse(localStorage.getItem("wrtn_room_profiles") || "{}");
            data[roomId] = { name: newName, information: newInfo, isActive: true };
            localStorage.setItem("wrtn_room_profiles", JSON.stringify(data));

            isSidebarLocked = true;
            sidebarCache.roomId = roomId;
            sidebarCache.name = newName;
            sidebarCache.isLast = true;
            renderSidebar();

            await syncRoomProfile(roomId);

            document.getElementById('jit-display-name').textContent = newName;
            document.getElementById('jit-display-info').textContent = newInfo;
            const badge = document.getElementById('jit-status-badge');
            badge.style.backgroundColor = '#3b82f6';
            badge.textContent = '자동설정 ON';
            document.getElementById('jit-display-name').style.color = 'var(--text_primary, #000)';
            document.getElementById('jit-display-name').style.textDecoration = 'none';

            viewMode.style.display = 'block';
            editMode.style.display = 'none';
            btn.textContent = originalText;
            btn.disabled = false;

            setTimeout(() => {
                isSidebarLocked = false;
                refreshSidebarCache();
            }, 2000);
        };
    }

    const observer = new MutationObserver(() => injectProfileEditor());
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
            observer.observe(document.body, { childList: true, subtree: true });
            setTimeout(checkUrlChange, 500);
        });
    } else {
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(checkUrlChange, 500);
    }

})();
