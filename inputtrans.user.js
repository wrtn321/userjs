// ==UserScript==
// @name         🌍 crack input translator
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  유저 입력을 프롬프트를 지정하여 번역
// @match        https://crack.wrtn.ai/stories/*
// @grant        GM_xmlhttpRequest
// @connect      generativelanguage.googleapis.com
// @connect      api.deepseek.com
// @connect      www.gstatic.com
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    const BASE_DOMAIN = "https://crack-api.wrtn.ai";
    const EXCHANGE_RATE = 1500;

    // ==========================================
    // 1. 요금표 및 사용량 계산
    // ==========================================
    const MODEL_PRICING = {
        "gemini-3-flash-preview": { input: 0.50, output: 3.00, cacheRead: 0.05, cacheWrite: 0.50 },
        "gemini-3.5-flash": { input: 1.50, output: 9.00, cacheRead: 0.15, cacheWrite: 1.50 },
        "gemini-3.1-pro-preview": { input: 2.00, output: 12.00, cacheRead: 0.20, cacheWrite: 2.00 },
        "gemini-2.5-pro": { input: 1.25, output: 10.00, cacheRead: 0.125, cacheWrite: 1.25 },
        "deepseek-v4-flash": { input: 0.14, output: 0.28, cacheRead: 0.0028, cacheWrite: 0.14 },
        "deepseek-v4-pro": { input: 0.435, output: 0.87, cacheRead: 0.003625, cacheWrite: 0.435 }
    };

    function normalizeUsage(raw, fallbackModel) {
        if (!raw || typeof raw !== "object") return null;
        const modelName = raw.model || fallbackModel || "";
        return {
            model: String(modelName),
            inputTokens: raw.inputTokens ?? raw.promptTokenCount ?? raw.prompt_tokens ?? 0,
            outputTokens: raw.outputTokens ?? raw.candidatesTokenCount ?? raw.completion_tokens ?? 0,
            cacheReadInputTokens: raw.cacheReadInputTokens ?? raw.cachedContentTokenCount ?? raw.prompt_cache_hit_tokens ?? 0,
            thoughtsTokenCount: raw.thoughtsTokenCount ?? raw.completion_tokens_details?.reasoning_tokens ?? 0
        };
    }

    function calculateCost(usage, modelOverride) {
        const norm = normalizeUsage(usage, modelOverride);
        if (!norm) return { usd: 0, krw: 0, str: "요금 계산 불가" };

        const pricing = MODEL_PRICING[modelOverride];
        if (!pricing) return { usd: 0, krw: 0, str: "가격 정보 없음" };

        const readTokens = norm.cacheReadInputTokens || 0;
        const inputTokens = norm.inputTokens || 0;
        const outputTokens = norm.outputTokens || 0;
        const thoughtsTokens = norm.thoughtsTokenCount || 0;

        let readCost = readTokens * pricing.cacheRead / 1000000;
        let writeCost = Math.max(0, inputTokens - readTokens) * pricing.cacheWrite / 1000000;
        let outputCost = outputTokens * pricing.output / 1000000;
        let thoughtsCost = thoughtsTokens * pricing.output / 1000000;

        const totalUsd = readCost + writeCost + outputCost + thoughtsCost;
        return {
            usd: totalUsd,
            krw: totalUsd * EXCHANGE_RATE,
            str: `입력 ${inputTokens} / 출력 ${Math.max(0, outputTokens - thoughtsTokens)} / 추론 ${thoughtsTokens} (약 ₩${(totalUsd * EXCHANGE_RATE).toFixed(2)})`
        };
    }

    function getCumulativeCosts() { try { return JSON.parse(localStorage.getItem("crackTransCosts") || "{}"); } catch(e) { return {}; } }
    function addCumulativeCost(model, usd) { const costs = getCumulativeCosts(); costs[model] = (costs[model] || 0) + usd; localStorage.setItem("crackTransCosts", JSON.stringify(costs)); }
    function resetCumulativeCosts() { localStorage.setItem("crackTransCosts", JSON.stringify({})); }

    // ==========================================
    // 2. 설정 및 캐시 관리
    // ==========================================
    class ConfigManager {
        static getConfig() {
            const def = {
                provider: "google",
                model: "gemini-3-flash-preview", // ✨ 기본 모델 변경
                geminiKey: "", fbConfig: "", deepseekKey: "",

                prompts: [{ id: "default", name: "기본 번역", content: "내가 입력한 한국어를 캐릭터의 성격과 상황에 맞춰 자연스럽게 번역해 줘. 번역된 결과만 출력해." }],
                selectedPromptId: "default",

                temperature: 0.7,
                geminiBudget: 128,
                geminiLevel3_1: "low",
                geminiLevel3_x: "low",

                dsThinking: true, dsEffort: "high", // ✨ 딥시크 체크박스용 속성 변경
                includeContext: false, contextTurns: 2, recentUsageStr: ""
            };
            try { return { ...def, ...JSON.parse(localStorage.getItem("crackTransConfigV2_4") || "{}") }; }
            catch (e) { return def; }
        }
        static setConfig(c) { localStorage.setItem("crackTransConfigV2_4", JSON.stringify(c)); }
    }

    // ==========================================
    // 3. 에디터 제어 및 통신 모듈
    // ==========================================
    function getEditorText() {
        const el = document.querySelector('.__chat_input_textarea');
        return el ? el.innerText.replace(/\n\n/g, '\n').trim() : '';
    }
    function setEditorText(text) {
        const el = document.querySelector('.__chat_input_textarea');
        if (el) {
            el.focus();
            document.execCommand('selectAll', false, null);
            document.execCommand('insertText', false, text);
        }
    }
    function getCookie(name) {
        const value = `; ${document.cookie}`; const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return decodeURIComponent(parts.pop().split(';').shift()); return null;
    }
    function getChatroomId() {
        const m = window.location.pathname.match(/\/stories\/([a-f0-9]+)\/episodes\/([a-f0-9]+)/);
        return m ? m[2] : null;
    }
    async function fetchContext(turns) {
        const roomId = getChatroomId(); if (!roomId) return "";
        const token = getCookie('access_token'); const wrtnId = getCookie('__w_id');
        const headers = { 'Authorization': `Bearer ${token}`, 'platform': 'web', 'x-wrtn-id': wrtnId || '' };
        try {
            const res = await fetch(`${BASE_DOMAIN}/crack-gen/v3/chats/${roomId}/messages?limit=20`, { headers });
            if (!res.ok) return ""; const json = await res.json();
            const msgs = (json.data ?? json).messages || [];
            const recent = msgs.reverse().slice(-(turns * 2));
            if (recent.length === 0) return "";
            return "[이전 대화 문맥 (참고용)]\n" + recent.map(m => `${m.role === 'assistant' ? 'AI' : 'User'}: ${m.content}`).join("\n\n");
        } catch(e) { return ""; }
    }

    const FIREBASE_APP_NAME = 'mimic-fb-input';
    async function callAI(textToTranslate) {
        const conf = ConfigManager.getConfig();
        const pv = conf.provider;
        const md = conf.model;
        const targetPrompt = conf.prompts.find(p => p.id === conf.selectedPromptId)?.content || "자연스럽게 번역해 줘.";

        let contextStr = "";
        if (conf.includeContext && conf.contextTurns > 0) contextStr = await fetchContext(conf.contextTurns);
        const fullPrompt = `${targetPrompt}\n\n${contextStr ? contextStr + "\n\n---\n" : ""}[번역할 텍스트]\n${textToTranslate}`;

        return new Promise(async (resolve, reject) => {
            if (pv === 'deepseek') {
                if (!conf.deepseekKey) return reject(new Error("DeepSeek API 키가 없습니다."));
                let payload = { model: md, messages: [{ role: "user", content: fullPrompt }], stream: false };

                // ✨ 딥시크 체크박스 분기 처리
                if (!conf.dsThinking) {
                    payload.temperature = parseFloat(conf.temperature);
                    payload.thinking = { type: "disabled" };
                } else {
                    payload.thinking = { type: "enabled" };
                    payload.reasoning_effort = conf.dsEffort;
                    // 온도는 보내지 않음
                }

                // 🔎 콘솔에 페이로드 출력 (F12에서 확인 가능)
                console.log("🚀 [DeepSeek Payload]:", JSON.stringify(payload, null, 2));

                GM_xmlhttpRequest({
                    method: "POST", url: "https://api.deepseek.com/chat/completions",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${conf.deepseekKey}` },
                    data: JSON.stringify(payload),
                    onload: (res) => {
                        if (res.status !== 200) return reject(new Error(`DeepSeek 오류: ${res.status}`));
                        const data = JSON.parse(res.responseText);
                        resolve({ text: data.choices[0].message.content, usage: data.usage });
                    }, onerror: () => reject(new Error("네트워크 오류"))
                });
            } else if (pv === 'firebase') {
                try {
                    if (!conf.fbConfig) throw new Error("Firebase Config 코드가 없습니다.");
                    let fbVersion = '12.12.0';
                    const versionMatch = conf.fbConfig.match(/firebasejs\/([0-9.]+)\/firebase-app\.js/);
                    if (versionMatch?.[1]) fbVersion = versionMatch[1];

                    let configObj;
                    const configMatch = conf.fbConfig.match(/(?:const|let|var)\s+firebaseConfig\s*=\s*({[\s\S]*?});/);
                    if (configMatch?.[1]) configObj = new Function(`return (${configMatch[1]});`)();
                    else throw new Error("Firebase 해독 실패");

                    const appUrl = `https://www.gstatic.com/firebasejs/${fbVersion}/firebase-app.js`;
                    const aiUrl = `https://www.gstatic.com/firebasejs/${fbVersion}/firebase-ai.js`;

                    const { initializeApp, getApps, getApp } = await import(appUrl);
                    const app = getApps().find(a => a.name === FIREBASE_APP_NAME) ? getApp(FIREBASE_APP_NAME) : initializeApp(configObj, FIREBASE_APP_NAME);

                    const { HarmBlockThreshold, HarmCategory, VertexAIBackend, getAI, getGenerativeModel } = await import(aiUrl);
                    const ai = getAI(app, { backend: new VertexAIBackend('global') });

                    const genConfig = { temperature: parseFloat(conf.temperature) };

                    if (md.includes('gemini-2.5')) { genConfig.thinkingConfig = { thinkingBudget: Math.max(128, parseInt(conf.geminiBudget) || 128) }; }
                    else if (md.includes('gemini-3.1-pro')) { genConfig.thinkingConfig = { thinkingLevel: conf.geminiLevel3_1 }; }
                    else if (md.includes('gemini-3')) { genConfig.thinkingConfig = { thinkingLevel: conf.geminiLevel3_x }; }

                    console.log("🚀 [Firebase Gemini Payload Config]:", JSON.stringify(genConfig, null, 2));

                    const generativeModel = getGenerativeModel(ai, {
                        model: md,
                        safetySettings: [{ category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.OFF }, { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.OFF }, { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.OFF }, { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.OFF }],
                        generationConfig: genConfig
                    });

                    const result = await generativeModel.generateContent(fullPrompt);
                    resolve({ text: result.response.text(), usage: result.response.usageMetadata });
                } catch (e) { reject(new Error(`Firebase 실패: ${e.message}`)); }
            } else {
                // google api
                if (!conf.geminiKey) return reject(new Error("Gemini API 키가 없습니다."));

                const genConfig = { temperature: parseFloat(conf.temperature) };

                if (md.includes('gemini-2.5')) { genConfig.thinkingConfig = { thinkingBudget: Math.max(128, parseInt(conf.geminiBudget) || 128) }; }
                else if (md.includes('gemini-3.1-pro')) { genConfig.thinkingConfig = { thinkingLevel: conf.geminiLevel3_1 }; }
                else if (md.includes('gemini-3')) { genConfig.thinkingConfig = { thinkingLevel: conf.geminiLevel3_x }; }

                const requestBody = { contents:[{ parts:[{ text: fullPrompt }] }], generationConfig: genConfig };

                // 🔎 콘솔에 페이로드 출력 (F12에서 확인 가능)
                console.log("🚀 [Google Gemini Payload]:", JSON.stringify(requestBody, null, 2));

                GM_xmlhttpRequest({
                    method: "POST", url: `https://generativelanguage.googleapis.com/v1beta/models/${md}:generateContent?key=${conf.geminiKey}`,
                    headers: { "Content-Type": "application/json" },
                    data: JSON.stringify(requestBody),
                    onload: (res) => {
                        if (res.status !== 200) return reject(new Error(`Gemini 오류: ${res.status}`));
                        const data = JSON.parse(res.responseText);
                        resolve({ text: data.candidates[0].content.parts[0].text, usage: data.usageMetadata });
                    }, onerror: () => reject(new Error("네트워크 오류"))
                });
            }
        });
    }

    // ==========================================
    // 4. 모달 UI
    // ==========================================
    function showSettingsModal() {
        if (document.getElementById("crack-trans-modal")) return;
        const config = ConfigManager.getConfig();

        const modalHTML = `
        <div id="crack-trans-modal" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);z-index:9999;display:flex;justify-content:center;align-items:center;font-family:-apple-system,sans-serif;">
            <div style="width:500px;height:550px;background:#fff;border-radius:16px;display:flex;flex-direction:column;padding:25px;box-sizing:border-box;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);">

                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                    <div style="font-weight:900;font-size:18px;color:#111827;">🌍 입력 번역 설정</div>
                    <button class="t-close-btn" style="background:none;border:none;font-size:22px;cursor:pointer;color:#9ca3af;line-height:1;">✕</button>
                </div>

                <div style="display:flex;background:#f3f4f6;padding:4px;border-radius:10px;margin-bottom:20px;flex-shrink:0;">
                    <button class="t-tab-btn" data-tab="logic" style="flex:1;padding:8px;border-radius:8px;background:#fff;border:1px solid #d1d5db;box-shadow:0 1px 2px rgba(0,0,0,0.05);font-weight:bold;font-size:13px;cursor:pointer;color:#111827;">모델 설정</button>
                    <button class="t-tab-btn" data-tab="preset" style="flex:1;padding:8px;border-radius:8px;background:transparent;border:none;color:#6b7280;font-size:13px;cursor:pointer;font-weight:500;">프롬프트</button>
                    <button class="t-tab-btn" data-tab="apikey" style="flex:1;padding:8px;border-radius:8px;background:transparent;border:none;color:#6b7280;font-size:13px;cursor:pointer;font-weight:500;">API 키</button>
                </div>

                <div style="flex:1;overflow-y:auto;padding-right:5px;position:relative;">

                    <!-- 로직 탭 -->
                    <div class="t-tab-content" id="tab-logic" style="display:block;">
                        <div style="display:flex; gap:10px; margin-bottom:15px;">
                            <div style="flex:1;">
                                <label style="display:block;font-size:12px;font-weight:bold;color:#4b5563;margin-bottom:6px;">제공자 (Provider)</label>
                                <select id="t-provider" style="width:100%;padding:10px;border-radius:8px;border:1px solid #d1d5db;font-size:13px;background:#f9fafb;outline:none;">
                                    <option value="google" ${config.provider==='google'?'selected':''}>Google API</option>
                                    <option value="firebase" ${config.provider==='firebase'?'selected':''}>Firebase Vertex</option>
                                    <option value="deepseek" ${config.provider==='deepseek'?'selected':''}>DeepSeek API</option>
                                </select>
                            </div>
                            <div style="flex:1;">
                                <label style="display:block;font-size:12px;font-weight:bold;color:#4b5563;margin-bottom:6px;">사용 모델</label>
                                <select id="t-model" style="width:100%;padding:10px;border-radius:8px;border:1px solid #d1d5db;font-size:13px;background:#f9fafb;outline:none;"></select>
                            </div>
                        </div>

                        <!-- 온도 설정 슬라이더 -->
                        <div style="margin-bottom:15px;">
                            <label style="display:block;font-size:12px;font-weight:bold;color:#4b5563;margin-bottom:6px;">Temperature: <span id="t-temp-val">${config.temperature}</span></label>
                            <input type="range" id="t-temp" min="0" max="2" step="0.1" value="${config.temperature}" style="width:100%;cursor:pointer;">
                        </div>

                        <!-- 다이나믹 추론 설정 박스 -->
                        <div id="t-think-box" style="background:#f3f4f6;padding:15px;border-radius:10px;border:1px solid #e5e7eb;margin-bottom:15px;"></div>

                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                            <label style="font-size:13px;font-weight:bold;color:#111827;">문맥(최근 대화) 같이 보내기</label>
                            <input type="checkbox" id="t-ctx-toggle" ${config.includeContext?'checked':''} style="width:16px;height:16px;cursor:pointer;">
                        </div>
                        <div id="t-ctx-box" style="display:${config.includeContext?'flex':'none'};align-items:center;justify-content:space-between;background:#f9fafb;padding:10px 15px;border-radius:8px;border:1px dashed #d1d5db;margin-bottom:20px;">
                            <span style="font-size:12px;color:#4b5563;">포함할 과거 턴 수 (1~10)</span>
                            <input type="text" id="t-ctx-turns" value="${config.contextTurns}" style="width:60px;padding:6px;border-radius:6px;border:1px solid #d1d5db;text-align:center;font-size:13px;">
                        </div>

                        <h3 style="font-size:13px;font-weight:bold;color:#111827;margin:0 0 8px;">💰 최근 및 누적 요금</h3>
                        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:12px;font-size:12px;">
                            <div style="color:#059669;font-weight:bold;margin-bottom:10px;">[최근] ${config.recentUsageStr || "기록 없음"}</div>
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;border-top:1px dashed #e5e7eb;padding-top:8px;">
                                <span style="font-weight:bold;color:#4b5563;">누적 사용 금액</span>
                                <button id="t-reset-cost" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:11px;font-weight:bold;">초기화</button>
                            </div>
                            <div id="t-cost-list" style="color:#6b7280;line-height:1.6;"></div>
                        </div>
                    </div>

                    <!-- 프리셋 탭 -->
                    <div class="t-tab-content" id="tab-preset" style="display:none;height:100%;flex-direction:column;">
                        <button id="t-add-prompt" style="width:100%;padding:10px;background:#f3f4f6;color:#111827;border:1px dashed #d1d5db;border-radius:8px;cursor:pointer;font-weight:bold;font-size:13px;margin-bottom:15px;">+ 새 프리셋 추가</button>
                        <div style="display:flex;gap:10px;margin-bottom:10px;">
                            <select id="t-prompt-sel" style="flex:1;padding:8px;border-radius:6px;border:1px solid #d1d5db;font-size:13px;outline:none;background:#f9fafb;"></select>
                            <button id="t-del-prompt" style="padding:8px 12px;background:#fef2f2;color:#ef4444;border:1px solid #fca5a5;border-radius:6px;cursor:pointer;font-size:12px;font-weight:bold;">삭제</button>
                        </div>
                        <input id="t-prompt-name" type="text" placeholder="프리셋 이름" style="width:100%;padding:10px;border-radius:8px;border:1px solid #d1d5db;font-weight:bold;font-size:13px;margin-bottom:10px;box-sizing:border-box;">
                        <textarea id="t-prompt-content" placeholder="프롬프트 내용..." style="flex:1;width:100%;padding:12px;border-radius:8px;border:1px solid #d1d5db;resize:none;font-family:inherit;font-size:13px;line-height:1.5;box-sizing:border-box;"></textarea>
                    </div>

                    <!-- API 키 탭 -->
                    <div class="t-tab-content" id="tab-apikey" style="display:none;">
                        <div style="margin-bottom:15px;">
                            <label style="display:block;font-size:12px;font-weight:bold;color:#4b5563;margin-bottom:6px;">Google Gemini API Key</label>
                            <input id="t-gemini-key" type="text" placeholder="AIza..." value="${config.geminiKey}" style="width:100%;padding:10px;border-radius:8px;border:1px solid #d1d5db;font-size:13px;background:#f9fafb;box-sizing:border-box;">
                        </div>
                        <div style="margin-bottom:15px;">
                            <label style="display:block;font-size:12px;font-weight:bold;color:#4b5563;margin-bottom:6px;">Firebase Config</label>
                            <textarea id="t-fb-config" rows="4" placeholder="const firebaseConfig = { ... };" style="width:100%;padding:10px;border-radius:8px;border:1px solid #d1d5db;font-family:monospace;font-size:11px;background:#f9fafb;box-sizing:border-box;resize:vertical;">${config.fbConfig}</textarea>
                        </div>
                        <div style="margin-bottom:15px;">
                            <label style="display:block;font-size:12px;font-weight:bold;color:#4b5563;margin-bottom:6px;">DeepSeek API Key</label>
                            <input id="t-ds-key" type="text" placeholder="sk-..." value="${config.deepseekKey}" style="width:100%;padding:10px;border-radius:8px;border:1px solid #d1d5db;font-size:13px;background:#f9fafb;box-sizing:border-box;">
                        </div>
                        <p style="font-size:11px;color:#6b7280;">* 로직 탭에서 선택한 '제공자(Provider)'의 키가 번역 시 사용됩니다.</p>
                    </div>

                </div>

                <!-- 하단 버튼 -->
                <div style="margin-top:20px;display:flex;justify-content:flex-end;">
                    <button id="t-save-btn" style="padding:12px 24px;background:#4f46e5;color:#fff;border-radius:8px;border:none;cursor:pointer;font-weight:bold;font-size:14px;transition:0.2s;">설정 저장</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML("beforeend", modalHTML);

        const modal = document.getElementById('crack-trans-modal');
        const pvSel = document.getElementById('t-provider');
        const mdSel = document.getElementById('t-model');
        const thinkBox = document.getElementById('t-think-box');
        const tempSlider = document.getElementById('t-temp');

        tempSlider.oninput = () => document.getElementById('t-temp-val').innerText = tempSlider.value;

        // 알약 탭 디자인 동작
        document.querySelectorAll('.t-tab-btn').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.t-tab-btn').forEach(b => { b.style.background='transparent'; b.style.color='#6b7280'; b.style.border='none'; b.style.boxShadow='none'; b.style.fontWeight='500'; });
                btn.style.background='#fff'; btn.style.color='#111827'; btn.style.border='1px solid #d1d5db'; btn.style.boxShadow='0 1px 2px rgba(0,0,0,0.05)'; btn.style.fontWeight='bold';
                document.querySelectorAll('.t-tab-content').forEach(c => c.style.display='none');
                document.getElementById('tab-' + btn.dataset.tab).style.display = btn.dataset.tab === 'preset' ? 'flex' : 'block';
            };
        });

        // 요금표
        const renderCosts = () => {
            const listDiv = document.getElementById('t-cost-list');
            const costs = getCumulativeCosts();
            if (Object.keys(costs).length === 0) { listDiv.innerHTML = "누적된 요금이 없습니다."; return; }
            listDiv.innerHTML = Object.entries(costs).map(([m, usd]) => `<div style="display:flex;justify-content:space-between;"><span>${m}</span><span style="font-weight:bold;">$${usd.toFixed(4)} (₩${(usd*EXCHANGE_RATE).toFixed(0)})</span></div>`).join('');
        };
        renderCosts();
        document.getElementById('t-reset-cost').onclick = () => { if(confirm("초기화할까요?")){ resetCumulativeCosts(); renderCosts(); }};

        // 다이나믹 UI 업데이트
        function updateDynamicUI() {
            const pv = pvSel.value;
            const currentSelected = mdSel.value || config.model;

            let options = '';
            if (pv === 'deepseek') {
                options = `<option value="deepseek-v4-pro">DeepSeek V4 Pro</option><option value="deepseek-v4-flash">DeepSeek V4 Flash</option>`;
            } else {
                options = `<option value="gemini-3-flash-preview">Gemini 3.0 Flash Preview</option><option value="gemini-3.5-flash">Gemini 3.5 Flash</option><option value="gemini-3.1-pro-preview">Gemini 3.1 Pro Preview</option><option value="gemini-2.5-pro">Gemini 2.5 Pro</option>`;
            }
            mdSel.innerHTML = options;

            if (Array.from(mdSel.options).find(o => o.value === currentSelected)) {
                mdSel.value = currentSelected;
            } else {
                mdSel.selectedIndex = 0;
            }

            const md = mdSel.value;

            // ✨ 딥시크 체크박스 상태 읽기 (없으면 config 값 사용)
            const currentDsThinking = document.getElementById('t-ds-thinking') ? document.getElementById('t-ds-thinking').checked : config.dsThinking;

            let html = "";
            if (md === 'gemini-2.5-pro') {
                html = `<label style="display:block;font-size:12px;font-weight:bold;color:#4b5563;margin-bottom:6px;">추론 예산 (Budget: 최소 128)</label><input type="text" id="t-gem-budget" value="${config.geminiBudget}" style="width:100%;padding:8px;border-radius:6px;border:1px solid #d1d5db;box-sizing:border-box;">`;
            } else if (md === 'gemini-3.1-pro-preview') {
                html = `<label style="display:block;font-size:12px;font-weight:bold;color:#4b5563;margin-bottom:6px;">추론 정도</label><select id="t-gem-31" style="width:100%;padding:8px;border-radius:6px;border:1px solid #d1d5db;"><option value="low" ${config.geminiLevel3_1==='low'?'selected':''}>Low</option><option value="medium" ${config.geminiLevel3_1==='medium'?'selected':''}>Medium</option><option value="high" ${config.geminiLevel3_1==='high'?'selected':''}>High</option></select>`;
            } else if (md.includes('gemini-3')) {
                html = `<label style="display:block;font-size:12px;font-weight:bold;color:#4b5563;margin-bottom:6px;">추론 정도</label><select id="t-gem-3x" style="width:100%;padding:8px;border-radius:6px;border:1px solid #d1d5db;"><option value="minimal" ${config.geminiLevel3_x==='minimal'?'selected':''}>Minimal</option><option value="low" ${config.geminiLevel3_x==='low'?'selected':''}>Low</option><option value="medium" ${config.geminiLevel3_x==='medium'?'selected':''}>Medium</option><option value="high" ${config.geminiLevel3_x==='high'?'selected':''}>High</option></select>`;
            } else if (md.includes('deepseek')) {
                // ✨ 딥시크 체크박스 UI로 교체
                html = `
                    <label style="font-size:13px;cursor:pointer;display:flex;align-items:center;gap:6px;margin-bottom:10px;">
                        <input type="checkbox" id="t-ds-thinking" ${currentDsThinking ? 'checked' : ''} style="width:16px;height:16px;">
                        추론(Thinking) 사용
                    </label>
                    <div style="font-size:11px;color:#6b7280;margin-bottom:10px;margin-left:22px;">* 딥시크 추론 모드 시 온도는 무시됩니다.</div>
                    <div id="t-ds-effort-box" style="display:${currentDsThinking ? 'block' : 'none'};margin-left:22px;">
                        <label style="display:block;font-size:12px;font-weight:bold;color:#4b5563;margin-bottom:6px;">Reasoning Effort</label>
                        <select id="t-ds-effort" style="width:100%;padding:8px;border-radius:6px;border:1px solid #d1d5db;">
                            <option value="high" ${config.dsEffort==='high'?'selected':''}>High</option>
                            <option value="max" ${config.dsEffort==='max'?'selected':''}>Max</option>
                        </select>
                    </div>
                `;
            }
            thinkBox.innerHTML = html;

            // 체크박스 클릭 시 노력도 박스 숨김/표시
            if (md.includes('deepseek')) {
                document.getElementById('t-ds-thinking').onchange = (e) => {
                    document.getElementById('t-ds-effort-box').style.display = e.target.checked ? 'block' : 'none';
                };
            }
        }

        pvSel.addEventListener('change', updateDynamicUI);
        mdSel.addEventListener('change', updateDynamicUI);
        updateDynamicUI();

        document.getElementById('t-ctx-toggle').onchange = (e) => { document.getElementById('t-ctx-box').style.display = e.target.checked ? 'flex' : 'none'; };

        // 프리셋 관리
        let tempPrompts = JSON.parse(JSON.stringify(config.prompts)); let curId = config.selectedPromptId;
        const pSel = document.getElementById('t-prompt-sel'), pName = document.getElementById('t-prompt-name'), pCon = document.getElementById('t-prompt-content');

        const renderPrompts = () => {
            pSel.innerHTML = tempPrompts.map(p => `<option value="${p.id}" ${p.id===curId?'selected':''}>${p.name}</option>`).join('');
            const cur = tempPrompts.find(x=>x.id===curId); if(cur){ pName.value=cur.name; pCon.value=cur.content; }
        };
        renderPrompts();
        pSel.onchange = (e) => { const prev = tempPrompts.find(x=>x.id===curId); if(prev){prev.name=pName.value; prev.content=pCon.value;} curId = e.target.value; renderPrompts(); };
        pName.oninput = () => { const cur = tempPrompts.find(x=>x.id===curId); if(cur) {cur.name=pName.value; pSel.options[pSel.selectedIndex].text = pName.value;} };
        pCon.oninput = () => { const cur = tempPrompts.find(x=>x.id===curId); if(cur) cur.content = pCon.value; };

        document.getElementById('t-add-prompt').onclick = () => { const prev = tempPrompts.find(x=>x.id===curId); if(prev){prev.name=pName.value; prev.content=pCon.value;} const nId='p_'+Date.now(); tempPrompts.push({id:nId, name:'새 프리셋', content:''}); curId=nId; renderPrompts(); };
        document.getElementById('t-del-prompt').onclick = () => { if(tempPrompts.length<=1){alert('최소 1개는 필요합니다.');return;} tempPrompts=tempPrompts.filter(x=>x.id!==curId); curId=tempPrompts[0].id; renderPrompts(); };

        // 저장 로직
        const saveAll = () => {
            const cur = tempPrompts.find(x=>x.id===curId); if(cur){ cur.name=pName.value; cur.content=pCon.value; }
            const pv = pvSel.value;
            const md = mdSel.value;

            let t = parseInt(document.getElementById('t-ctx-turns').value);
            if (isNaN(t)) t = 2;
            t = Math.max(1, Math.min(10, t));

            const newConf = { ...config, provider: pv, model: md,
                temperature: parseFloat(tempSlider.value) || 0.7,
                geminiKey: document.getElementById('t-gemini-key').value, fbConfig: document.getElementById('t-fb-config').value, deepseekKey: document.getElementById('t-ds-key').value,
                prompts: tempPrompts, selectedPromptId: curId, includeContext: document.getElementById('t-ctx-toggle').checked, contextTurns: t };

            if (md === 'gemini-2.5-pro') newConf.geminiBudget = parseInt(document.getElementById('t-gem-budget').value) || 128;
            else if (md === 'gemini-3.1-pro-preview') newConf.geminiLevel3_1 = document.getElementById('t-gem-31').value;
            else if (md.includes('gemini-3')) newConf.geminiLevel3_x = document.getElementById('t-gem-3x').value;
            else if (md.includes('deepseek')) {
                newConf.dsThinking = document.getElementById('t-ds-thinking').checked;
                newConf.dsEffort = document.getElementById('t-ds-effort') ? document.getElementById('t-ds-effort').value : 'high';
            }

            ConfigManager.setConfig(newConf); modal.remove();
        };
        document.getElementById('t-save-btn').onclick = saveAll;
        document.querySelectorAll('.t-close-btn').forEach(b => b.onclick = () => modal.remove());
    }

    // ==========================================
    // 5. 버튼 주입 & 에디터 제어
    // ==========================================
    function injectMagicWand() {
        const targetContainer = document.querySelector('.pb-3.pl-3.pr-2\\.5.pt-1\\.5 .flex.items-center.space-x-2');
        if (!targetContainer || document.getElementById('crack-magic-wand-container')) return;

        const container = document.createElement('div');
        container.id = 'crack-magic-wand-container';
        container.style.cssText = 'display:flex; align-items:center; gap:8px; margin-left:8px; border-left: 1px solid var(--border); ';

        const btnStyle = 'width:28px; height:28px; border-radius:50%; border:1px solid var(--border); background:var(--card); cursor:pointer; display:flex; justify-content:center; align-items:center; color:#4582ff; font-size:14px; transition:0.2s;';

        container.innerHTML = `
            <button id="cm-translate-btn" title="입력 번역" style="${btnStyle}">🌍</button>
            <div id="cm-ctrl-group" style="display:none; gap:4px; background:var(--card); padding:2px 8px; border-radius:16px; border:1px solid var(--border); align-items:center;">
                <button id="cm-reroll-btn" style="border:none;background:transparent;color:#4582ff;font-size:12px;font-weight:bold;cursor:pointer;padding:4px;">↺ 리롤</button>
                <div style="width:1px;height:10px;background:var(--border);"></div>
                <button id="cm-undo-btn" style="border:none;background:transparent;color:var(--text_primary);font-size:12px;font-weight:bold;cursor:pointer;padding:4px;">↩ 원문</button>
            </div>
        `;
        targetContainer.appendChild(container);

        const tBtn = document.getElementById('cm-translate-btn');
        const ctrlGrp = document.getElementById('cm-ctrl-group');
        const rBtn = document.getElementById('cm-reroll-btn');
        let originalText = null;

        const doTranslate = async (textToUse, isReroll = false) => {
            if (!textToUse.trim()) return;

            tBtn.innerHTML = '<span style="font-size:12px;">⏳</span>'; tBtn.style.cursor = 'default'; tBtn.disabled = true;
            if (isReroll) { rBtn.textContent = '⏳ 리롤 중...'; rBtn.disabled = true; }

            try {
                const res = await callAI(textToUse);
                if (!originalText) originalText = textToUse;
                setEditorText(res.text);

                const cost = calculateCost(res.usage, ConfigManager.getConfig().model);
                if (cost.usd > 0) {
                    addCumulativeCost(ConfigManager.getConfig().model, cost.usd);
                    const c = ConfigManager.getConfig(); c.recentUsageStr = cost.str; ConfigManager.setConfig(c);
                }
                tBtn.style.display = 'none'; ctrlGrp.style.display = 'flex';
            } catch(e) { alert("번역 실패: " + e.message); }
            finally {
                tBtn.innerHTML = '🌍'; tBtn.style.cursor = 'pointer'; tBtn.disabled = false;
                if (isReroll) { rBtn.textContent = '↺ 리롤'; rBtn.disabled = false; }
            }
        };

        tBtn.onclick = () => doTranslate(getEditorText());
        rBtn.onclick = () => { if(originalText) doTranslate(originalText, true); };
        document.getElementById('cm-undo-btn').onclick = () => { if(originalText) { setEditorText(originalText); originalText = null; ctrlGrp.style.display = 'none'; tBtn.style.display = 'flex'; } };

        const editorBox = document.querySelector('.__chat_input_textarea');
        if (editorBox) {
            editorBox.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) { originalText = null; ctrlGrp.style.display = 'none'; tBtn.style.display = 'flex'; }
            });
        }
        const sendBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerHTML.includes('d="M18.77 11.13'));
        if (sendBtn) sendBtn.addEventListener('click', () => { originalText = null; ctrlGrp.style.display = 'none'; tBtn.style.display = 'flex'; });
    }

    // ==========================================
    // 6. 설정 버튼 주입 및 옵저버
    // ==========================================
    function injectSettingsButton() {
        const menuContainer = document.querySelector('.py-4.overflow-y-auto.scrollbar > .px-2:first-of-type');
        if (menuContainer && !document.getElementById('crack-input-trans-settings')) {
            const btn = document.createElement('div');
            btn.id = 'crack-input-trans-settings'; btn.className = 'px-2.5 h-4 box-content py-[18px]';
            btn.innerHTML = `<button class="w-full flex h-4 items-center justify-between typo-110-16-med space-x-2 ring-offset-4" style="cursor: pointer;"><span class="flex space-x-2 items-center"><span style="font-size: 16px;">🌍</span><span class="whitespace-nowrap overflow-hidden text-ellipsis typo-text-sm_leading-none_medium">입력 번역기 설정</span></span></button>`;
            btn.onclick = showSettingsModal;
            menuContainer.appendChild(btn);
        }
    }

    const observer = new MutationObserver(() => { injectSettingsButton(); injectMagicWand(); });
    if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", () => observer.observe(document.body, { childList: true, subtree: true })); }
    else { observer.observe(document.body, { childList: true, subtree: true }); injectSettingsButton(); injectMagicWand(); }
})();
