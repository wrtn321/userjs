// ==UserScript==
// @name         🌍 crack input translator
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  유저의 입력을 원하는 언어로 번역
// @author       뤼붕이
// @match        https://crack.wrtn.ai/*
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
        "deepseek-v4-pro": { input: 0.435, output: 0.87, cacheRead: 0.003625, cacheWrite: 0.435 },
        "deepseek-v4-flash": { input: 0.14, output: 0.28, cacheRead: 0.0028, cacheWrite: 0.14 }
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
        const thoughtsTokens = norm.thoughtsTokenCount || 0;
        const totalOutputTokens = norm.outputTokens || 0;

        // 일반입력 = 총 입력 - 캐시읽기
        let writeTokens = Math.max(0, inputTokens - readTokens);

        // 제미나이는 일반출력과 추론출력이 별도지만, 딥시크는 일반출력 안에 추론이 포함되어 있음
        let pureOutputTokens = totalOutputTokens;
        if (modelOverride && modelOverride.includes("deepseek")) {
            pureOutputTokens = Math.max(0, totalOutputTokens - thoughtsTokens);
        }

        let readCost = readTokens * pricing.cacheRead / 1000000;
        let writeCost = writeTokens * pricing.cacheWrite / 1000000;
        let outputCost = pureOutputTokens * pricing.output / 1000000;
        let thoughtsCost = thoughtsTokens * pricing.output / 1000000;

        const totalUsd = readCost + writeCost + outputCost + thoughtsCost;
        return {
            usd: totalUsd,
            krw: totalUsd * EXCHANGE_RATE,
            str: `캐시읽기 ${readTokens} / 일반입력 ${writeTokens} / 일반출력 ${pureOutputTokens} / 추론 ${thoughtsTokens} (약 ₩${(totalUsd * EXCHANGE_RATE).toFixed(2)})`
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
            const promptEnFull = `[역할 및 목적]
당신은 최상급 웹소설 작가이자 인공지능 캐릭터 롤플레잉 전담 '초월 번역가'입니다. 유저가 입력한 한국어 텍스트를 단순 기계 번역하는 것을 넘어, 캐릭터의 영혼과 감정, 문체, 그리고 상황적 맥락이 생생하게 호흡하는 완벽한 영문 웹소설 문체로 재창조하는 것이 당신의 유일한 목표입니다.

[핵심 번역 원칙: 초월 번역]
1. 완벽한 뉘앙스 현지화: 한국어 특유의 은어, 감정선, 말버릇을 자연스럽게 의역하십시오.
2. 원문의 형태(줄바꿈, 별표*, 따옴표" ", 특수문자 등) 및 구조를 완벽하게 원형대로 유지하십시오.
3. 오직 '초월 번역이 적용된 최종 결과물'만 제공하십시오
- 번역 외의 부연 설명, 인사말, 확인 문구는 절대 출력하지 마십시오.

[출력 형식 가이드]
- 지문/서술 형식: *English description or narration*
- 대사 형식: "English dialogue"

(예시)
입력: 아, 귀찮게 진짜... *머리를 쓸어넘기며 한숨을 쉰다.* 밥은 먹었냐?
출력: "Ah, this is so annoying..." *Sighing, brushing the hair back.* "Have you eaten yet?"`;

            const promptEnDialogue = `[역할 및 목적]
당신은 최상급 웹소설 작가이자 인공지능 캐릭터 롤플레잉 전담 '초월 번역가'입니다. 유저가 입력한 한국어 텍스트를 단순 기계 번역하는 것을 넘어, 캐릭터의 영혼과 감정, 문체, 그리고 상황적 맥락이 생생하게 호흡하는 완벽한 영문 웹소설 문체로 재창조하는 것이 당신의 유일한 목표입니다.

[핵심 번역 원칙: 초월 번역]
1. 완벽한 뉘앙스 현지화: 한국어 특유의 은어, 감정선, 말버릇을 자연스럽게 의역하십시오.
2. 지문과 대사의 극적 분리 및 형식 엄수:
- 지문은 반드시 양끝을 별표(*)로 감싸십시오. 지문 안에는 한국어를 남기지 마십시오.
- 대사(직접 하는 말)는 따옴표(" ") 안에 영문 번역을 넣고, 바로 뒤에 괄호()를 열어 한국어 원문을 병기하십시오.
- 번역 외의 부연 설명, 인사말, 확인 문구는 절대 출력하지 마십시오.
3. 원문의 형태(줄바꿈, 별표*, 따옴표" ", 특수문자 등) 및 구조를 완벽하게 원형대로 유지하십시오.
4. 오직 '초월 번역이 적용된 최종 결과물'만 제공하십시오

[출력 형식 가이드]
- 지문/서술 형식: *English description or narration*
- 대사 형식: "English dialogue" (한국어 원문)

(예시)
입력: 아, 귀찮게 진짜... *머리를 쓸어넘기며 한숨을 쉰다.* 밥은 먹었냐?
출력: "Ah, this is so annoying..." (아, 귀찮게 진짜...) *Sighing, brushing the hair back.* "Have you eaten yet?" (밥은 먹었냐?)

[형식 오류 검토 체크리스트]
1. 대사가 ["English" (Korean)] 형식을 정확히 따르고 있는가?
2. ()인 괄호 안 한국어 원문 옆에 불필요한 " 따옴표가 들어가 있지는 않은가? -> 있다면 제거.
3. 지문 묘사(* * 안)에 한국어가 남아있지는 않은가? -> 지문은 100% 영어로만 출력.
4. 부자연스러운 기계식 직역인가? -> 캐릭터의 성격과 상황에 맞는 자연스러운 영문 의역으로 정정.`;

            const promptJpFull = `[역할 및 목적]
당신은 최상급 웹소설 작가이자 인공지능 캐릭터 롤플레잉 전담 '초월 번역가'입니다. 유저가 입력한 한국어 텍스트를 단순 기계 번역하는 것을 넘어, 캐릭터의 영혼과 감정, 문체, 그리고 상황적 맥락이 생생하게 호흡하는 완벽한 일본어 라이트노벨/웹소설 문체로 재창조하는 것이 당신의 유일한 목표입니다.

[핵심 번역 원칙: 초월 번역]
1. 완벽한 뉘앙스 현지화: 한국어 특유의 은어, 감정선, 말버릇을 자연스럽게 의역하십시오. 유저가 설정을 제시했다면, 설정에 맞는 적절한 어투(반말, 존댓말 등)를 사용하십시오.
2. 원문의 형태(줄바꿈, 별표*, 특수문자 등) 및 구조를 완벽하게 원형대로 유지하십시오. 단, 대사는 "가 아닌 꺽쇠(「 」) 를 사용하십시오.
3. 오직 '초월 번역이 적용된 최종 결과물'만 제공하십시오.
- 번역 외의 부연 설명, 인사말, 확인 문구는 절대 출력하지 마십시오.

[출력 형식 가이드]
- 지문/서술 형식: *日本語の描写やナレーション*
- 대사 형식: 「日本語のセリフ」

(예시)
입력:
아, 귀찮게 진짜... *머리를 쓸어넘기며 한숨을 쉰다.* 밥은 먹었냐?
출력: 「あー、マジでめんどくせぇ…」 *髪をかき上げながらため息をつく。* 「飯は食ったか？」`;

            const promptJpDialogue = `[역할 및 목적]
당신은 최상급 웹소설 작가이자 인공지능 캐릭터 롤플레잉 전담 '초월 번역가'입니다. 유저가 입력한 한국어 텍스트를 단순 기계 번역하는 것을 넘어, 캐릭터의 영혼과 감정, 문체, 그리고 상황적 맥락이 생생하게 호흡하는 완벽한 일본어 라이트노벨/웹소설 문체로 재창조하는 것이 당신의 유일한 목표입니다.

[핵심 번역 원칙: 초월 번역]
1. 완벽한 뉘앙스 현지화: 한국어 특유의 은어, 감정선, 말버릇을 자연스럽게 의역하십시오. 유저가 설정을 제시했다면, 설정에 맞는 적절한 어투(반말, 존댓말 등)를 사용하십시오.
2. 지문과 대사의 극적 분리 및 형식 엄수:
- 지문은 반드시 양끝을 별표(*)로 감싸십시오. 지문 안에는 한국어를 남기지 마십시오.
- 대사(직접 하는 말)는 꺾쇠(「 」) 안에 일본어 번역을 넣고, 줄바꿈을 한 후 괄호()를 열어 한국어 원문을 병기하십시오.
- 번역 외의 부연 설명, 인사말, 확인 문구는 절대 출력하지 마십시오.
3. 원문의 형태(줄바꿈, 별표*, 따옴표, 꺾쇠, 특수문자 등) 및 구조를 완벽하게 원형대로 유지하십시오.
4. 오직 '초월 번역이 적용된 최종 결과물'만 제공하십시오.

[출력 형식 가이드]
- 지문/서술 형식:
*日本語の描写やナレーション*
- 대사 형식:
「日本語のセリフ」
(한국어 원문)

(예시)
입력:
아, 귀찮게 진짜...
*머리를 쓸어넘기며 한숨을 쉰다.*
밥은 먹었냐?
출력:
「あー、マジでめんどくせぇ…」
(아, 귀찮게 진짜...)

*髪をかき上げながらため息をつく。*

「飯は食ったか？」
(밥은 먹었냐?)

[형식 오류 검토 체크리스트]
1. 대사가 [「日本語」 (Korean)] 형식을 정확히 따르고 있는가?
2. ()인 괄호 안 한국어 원문 옆에 불필요한 「 또는 」 꺾쇠가 들어가 있지는 않은가? -> 있다면 제거.
3. 지문 묘사(* * 안)에 한국어가 남아있지는 않은가? -> 지문은 100% 일본어로만 출력.
4. 부자연스러운 기계식 직역인가? -> 캐릭터의 성격과 상황에 맞는 자연스러운 일본어 의역으로 정정.`;

            const def = {
                provider: "google",
                model: "gemini-3-flash-preview",
                geminiKey: "", fbConfig: "", deepseekKey: "",

                prompts: [
                    { id: "default", name: "영어 (전문)", content: promptEnFull },
                    { id: "dialogue_en", name: "영어 (대사병기)", content: promptEnDialogue },
                    { id: "full_jp", name: "일본어 (전문)", content: promptJpFull },
                    { id: "dialogue_jp", name: "일본어 (대사병기)", content: promptJpDialogue }
                ],
                selectedPromptId: "default",

                temperature: 0.7,
                geminiBudget: 128,
                geminiLevel3_1: "low",
                geminiLevel3_x: "low",

                dsThinking: true, dsEffort: "high",
                includeContext: false, contextTurns: 2,
                includePersona: false,
                recentUsageStr: ""
            };

            try { return { ...def, ...JSON.parse(localStorage.getItem("crackTransConfig08") || "{}") }; }
            catch (e) { return def; }
        }
        static setConfig(c) { localStorage.setItem("crackTransConfig08", JSON.stringify(c)); }
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
        if (el) { el.focus(); document.execCommand('selectAll', false, null); document.execCommand('insertText', false, text); }
    }
    function getCookie(name) {
        const value = `; ${document.cookie}`; const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return decodeURIComponent(parts.pop().split(';').shift()); return null;
    }
    function getChatroomId() {
        const m = window.location.pathname.match(/\/stories\/([a-f0-9]+)\/episodes\/([a-f0-9]+)/);
        return m ? m[2] : null;
    }

    async function wrtnApiRequest(url) {
        const token = getCookie('access_token'); const wrtnId = getCookie('__w_id');
        try {
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}`, 'platform': 'web', 'x-wrtn-id': wrtnId || '' } });
            if (!res.ok) return null; const json = await res.json(); return json.data !== undefined ? json.data : json;
        } catch (e) { return null; }
    }


    async function fetchContextAndPersona(turns, includeContext, includePersona) {
        const roomId = getChatroomId();
        if (!roomId) return { history: [], persona: "" };

        let history = []; let persona = "";

        // 1. 과거 대화 가져오기
        if (includeContext && turns > 0) {
            const mRes = await wrtnApiRequest(`${BASE_DOMAIN}/crack-gen/v3/chats/${roomId}/messages?limit=20`);
            if (mRes && mRes.messages) {
                history = mRes.messages.reverse().slice(-(turns * 2)).map(m => ({ role: m.role, content: m.content }));
            }
        }

        // 2. 페르소나 가져오기
        if (includePersona) {
            const cRes = await wrtnApiRequest(`${BASE_DOMAIN}/crack-gen/v3/chats/${roomId}`);
            const pInfo = await wrtnApiRequest(`${BASE_DOMAIN}/crack-api/profiles`);

            if (cRes && pInfo && pInfo._id) {
                const pListRes = await wrtnApiRequest(`${BASE_DOMAIN}/crack-api/profiles/${pInfo._id}/chat-profiles`);
                const list = pListRes?.chatProfiles || [];
                const activeId = cRes.chatProfile?._id;

                const p = list.find(i => i._id === activeId) || list.find(i => i.isRepresentative) || list[0];
                if (p) persona = `## ${p.name}(user) 프로필\n${p.information || ""}`;
            }
        }
        return { history, persona };
    }


    function formatMessages(history, textToTranslate, provider) {
        let result = [];
        let aiRole = provider === 'deepseek' ? 'assistant' : 'model';

        let mapped = history.map(m => ({ role: m.role === 'assistant' ? aiRole : 'user', content: m.content }));

        for (const m of mapped) {
            if (result.length > 0 && result[result.length-1].role === m.role) {
                result[result.length-1].content += `\n\n${m.content}`;
            } else {
                result.push({ role: m.role, content: m.content });
            }
        }

        if (provider !== 'deepseek' && result.length > 0 && result[0].role !== 'user') {
            result.unshift({ role: 'user', content: '(이전 대화 생략)' });
        }

        if (result.length > 0) {
            result[0].content = `[맥락 이해용 최근 채팅로그 시작]\n\n${result[0].content}`;
        }

        // 🌟 history 배열에 데이터가 있는지(문맥이 포함되었는지) 확인하여 텍스트 분기
        let targetText = "";
        if (history.length > 0) {
            // 과거 문맥이 있을 때
            targetText = `[채팅로그 끝]\n\n[번역 지시]\n 롤플레잉 금지. 과거의 대화 문맥과 system prompt에 맞추어 다음 문장을 번역:\n${textToTranslate}`;
        } else {
            // 과거 문맥이 없을 때 (설정만 참고하라고 지시)
            targetText = `[번역 지시]\n system prompt에 맞추어 다음 문장을 번역:\n${textToTranslate}`;
        }

        if (result.length > 0 && result[result.length-1].role === 'user') {
            result[result.length-1].content += `\n\n${targetText}`;
        } else {
            result.push({ role: 'user', content: targetText });
        }

        return result;
    }

    const FIREBASE_APP_NAME = 'mimic-fb-input';
    async function callAI(textToTranslate) {
        const conf = ConfigManager.getConfig();
        const pv = conf.provider;
        const md = conf.model;

        // 컨텍스트 및 페르소나 로드
        const fetched = await fetchContextAndPersona(conf.contextTurns, conf.includeContext, conf.includePersona);

        let systemPrompt = conf.prompts.find(p => p.id === conf.selectedPromptId)?.content || "자연스럽게 번역해 줘.";
        if (conf.includePersona && fetched.persona) {
            systemPrompt += `\n\n[참고: user 프로필]\n${fetched.persona}`;
        }

        const finalMessages = formatMessages(fetched.history, textToTranslate, pv);

        return new Promise(async (resolve, reject) => {
            if (pv === 'deepseek') {
                if (!conf.deepseekKey) return reject(new Error("DeepSeek API 키가 없습니다."));

                let payload = { model: md, messages: [{ role: "system", content: systemPrompt }, ...finalMessages], stream: false };
                if (!conf.dsThinking) { payload.temperature = parseFloat(conf.temperature); payload.thinking = { type: "disabled" }; }
                else { payload.thinking = { type: "enabled" }; payload.reasoning_effort = conf.dsEffort; }

                console.log("🚀 [DeepSeek Payload]:", JSON.stringify(payload, null, 2));

                GM_xmlhttpRequest({
                    method: "POST", url: "https://api.deepseek.com/chat/completions",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${conf.deepseekKey}` },
                    data: JSON.stringify(payload),
                    onload: (res) => {
                        if (res.status !== 200) return reject(new Error(`DeepSeek 오류: ${res.status}`));
                        const data = JSON.parse(res.responseText); resolve({ text: data.choices[0].message.content, usage: data.usage });
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
                    else if (md.includes('gemini-3.1-pro')) { genConfig.thinkingConfig = { thinkingLevel: conf.geminiLevel3_1 }; delete genConfig.temperature; }
                    else if (md.includes('gemini-3')) { genConfig.thinkingConfig = { thinkingLevel: conf.geminiLevel3_x }; delete genConfig.temperature; }

                    const generativeModel = getGenerativeModel(ai, {
                        model: md,
                        safetySettings: [{ category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.OFF }, { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.OFF }, { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.OFF }, { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.OFF }],
                        systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
                        generationConfig: genConfig
                    });

                    const formattedContents = finalMessages.map(m => ({ role: m.role, parts: [{ text: m.content }] }));
                    console.log("🚀 [Firebase Gemini Payload]:", JSON.stringify({systemInstruction: systemPrompt, contents: formattedContents, generationConfig: genConfig}, null, 2));

                    const result = await generativeModel.generateContent({ contents: formattedContents });
                    resolve({ text: result.response.text(), usage: result.response.usageMetadata });
                } catch (e) { reject(new Error(`Firebase 실패: ${e.message}`)); }
            } else {
                // google api
                if (!conf.geminiKey) return reject(new Error("Gemini API 키가 없습니다."));

                const genConfig = { temperature: parseFloat(conf.temperature) };
                if (md.includes('gemini-2.5')) { genConfig.thinkingConfig = { thinkingBudget: Math.max(128, parseInt(conf.geminiBudget) || 128) }; }
                else if (md.includes('gemini-3.1-pro')) { genConfig.thinkingConfig = { thinkingLevel: conf.geminiLevel3_1 }; delete genConfig.temperature; }
                else if (md.includes('gemini-3')) { genConfig.thinkingConfig = { thinkingLevel: conf.geminiLevel3_x }; delete genConfig.temperature; }

                const formattedContents = finalMessages.map(m => ({ role: m.role, parts: [{ text: m.content }] }));

                const requestBody = {
                    systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
                    contents: formattedContents,
                    generationConfig: genConfig,
                    safetySettings: [
                        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                    ]
                };

                console.log("🚀 [Google Gemini Payload]:", JSON.stringify(requestBody, null, 2));

                GM_xmlhttpRequest({
                    method: "POST", url: `https://generativelanguage.googleapis.com/v1beta/models/${md}:generateContent?key=${conf.geminiKey}`,
                    headers: { "Content-Type": "application/json" },
                    data: JSON.stringify(requestBody),
                    onload: (res) => {
                        if (res.status !== 200) return reject(new Error(`Gemini 오류: ${res.status}`));
                        const data = JSON.parse(res.responseText); resolve({ text: data.candidates[0].content.parts[0].text, usage: data.usageMetadata });
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

                        <div style="margin-bottom:15px;">
                            <label style="display:block;font-size:12px;font-weight:bold;color:#4b5563;margin-bottom:6px;">Temperature: <span id="t-temp-val">${config.temperature}</span></label>
                            <input type="range" id="t-temp" min="0" max="2" step="0.1" value="${config.temperature}" style="width:100%;cursor:pointer;">
                        </div>

                        <div id="t-think-box" style="background:#f3f4f6;padding:15px;border-radius:10px;border:1px solid #e5e7eb;margin-bottom:15px;"></div>

                        <!-- ✨ 대화 프로필(페르소나) 포함 토글을 밖으로 뺐습니다! -->
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                            <label style="font-size:13px;font-weight:bold;color:#111827;">이 방의 대화 프로필(페르소나) 반영</label>
                            <input type="checkbox" id="t-ctx-persona" ${config.includePersona?'checked':''} style="width:16px;height:16px;cursor:pointer;">
                        </div>

                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                            <label style="font-size:13px;font-weight:bold;color:#111827;">문맥(최근 대화) 같이 보내기</label>
                            <input type="checkbox" id="t-ctx-toggle" ${config.includeContext?'checked':''} style="width:16px;height:16px;cursor:pointer;">
                        </div>
                        <div id="t-ctx-box" style="display:${config.includeContext?'flex':'none'};flex-direction:column;gap:10px;background:#f9fafb;padding:15px;border-radius:8px;border:1px dashed #d1d5db;margin-bottom:20px;">
                            <div style="display:flex;align-items:center;justify-content:space-between;">
                                <span style="font-size:12px;color:#4b5563;font-weight:bold;">포함할 과거 턴 수 (1~10)</span>
                                <input type="text" id="t-ctx-turns" value="${config.contextTurns}" style="width:60px;padding:6px;border-radius:6px;border:1px solid #d1d5db;text-align:center;font-size:13px;">
                            </div>
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

        document.querySelectorAll('.t-tab-btn').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.t-tab-btn').forEach(b => { b.style.background='transparent'; b.style.color='#6b7280'; b.style.border='none'; b.style.boxShadow='none'; b.style.fontWeight='500'; });
                btn.style.background='#fff'; btn.style.color='#111827'; btn.style.border='1px solid #d1d5db'; btn.style.boxShadow='0 1px 2px rgba(0,0,0,0.05)'; btn.style.fontWeight='bold';
                document.querySelectorAll('.t-tab-content').forEach(c => c.style.display='none');
                document.getElementById('tab-' + btn.dataset.tab).style.display = btn.dataset.tab === 'preset' ? 'flex' : 'block';
            };
        });

        const renderCosts = () => {
            const listDiv = document.getElementById('t-cost-list');
            const costs = getCumulativeCosts();
            if (Object.keys(costs).length === 0) { listDiv.innerHTML = "누적된 요금이 없습니다."; return; }
            listDiv.innerHTML = Object.entries(costs).map(([m, usd]) => `<div style="display:flex;justify-content:space-between;"><span>${m}</span><span style="font-weight:bold;">$${usd.toFixed(4)} (₩${(usd*EXCHANGE_RATE).toFixed(0)})</span></div>`).join('');
        };
        renderCosts();
        document.getElementById('t-reset-cost').onclick = () => { if(confirm("초기화할까요?")){ resetCumulativeCosts(); renderCosts(); }};

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

            if (Array.from(mdSel.options).find(o => o.value === currentSelected)) { mdSel.value = currentSelected; }
            else { mdSel.selectedIndex = 0; }

            const md = mdSel.value;
            const currentDsThinking = document.getElementById('t-ds-thinking') ? document.getElementById('t-ds-thinking').checked : config.dsThinking;

            let html = "";
            if (md === 'gemini-2.5-pro') {
                html = `<label style="display:block;font-size:12px;font-weight:bold;color:#4b5563;margin-bottom:6px;">추론 예산 (Budget: 최소 128)</label><input type="text" id="t-gem-budget" value="${config.geminiBudget}" style="width:100%;padding:8px;border-radius:6px;border:1px solid #d1d5db;box-sizing:border-box;">`;
            } else if (md === 'gemini-3.1-pro-preview') {
                html = `<label style="display:block;font-size:12px;font-weight:bold;color:#4b5563;margin-bottom:6px;">추론 정도</label><select id="t-gem-31" style="width:100%;padding:8px;border-radius:6px;border:1px solid #d1d5db;"><option value="low" ${config.geminiLevel3_1==='low'?'selected':''}>Low</option><option value="medium" ${config.geminiLevel3_1==='medium'?'selected':''}>Medium</option><option value="high" ${config.geminiLevel3_1==='high'?'selected':''}>High</option></select>`;
            } else if (md.includes('gemini-3')) {
                html = `<label style="display:block;font-size:12px;font-weight:bold;color:#4b5563;margin-bottom:6px;">추론 정도</label><select id="t-gem-3x" style="width:100%;padding:8px;border-radius:6px;border:1px solid #d1d5db;"><option value="minimal" ${config.geminiLevel3_x==='minimal'?'selected':''}>Minimal</option><option value="low" ${config.geminiLevel3_x==='low'?'selected':''}>Low</option><option value="medium" ${config.geminiLevel3_x==='medium'?'selected':''}>Medium</option><option value="high" ${config.geminiLevel3_x==='high'?'selected':''}>High</option></select>`;
            } else if (md.includes('deepseek')) {
                html = `
                    <label style="font-size:13px;cursor:pointer;display:flex;align-items:center;gap:6px;margin-bottom:10px;">
                        <input type="checkbox" id="t-ds-thinking" ${currentDsThinking ? 'checked' : ''} style="width:16px;height:16px;"> 추론(Thinking) 사용
                    </label>
                    <div style="font-size:11px;color:#6b7280;margin-bottom:10px;margin-left:22px;">* 딥시크 추론 모드 시 온도는 무시됩니다.</div>
                    <div id="t-ds-effort-box" style="display:${currentDsThinking ? 'block' : 'none'};margin-left:22px;">
                        <label style="display:block;font-size:12px;font-weight:bold;color:#4b5563;margin-bottom:6px;">Reasoning Effort</label>
                        <select id="t-ds-effort" style="width:100%;padding:8px;border-radius:6px;border:1px solid #d1d5db;"><option value="high" ${config.dsEffort==='high'?'selected':''}>High</option><option value="max" ${config.dsEffort==='max'?'selected':''}>Max</option></select>
                    </div>
                `;
            }
            thinkBox.innerHTML = html;
            if (md.includes('deepseek')) { document.getElementById('t-ds-thinking').onchange = (e) => { document.getElementById('t-ds-effort-box').style.display = e.target.checked ? 'block' : 'none'; }; }
        }

        pvSel.addEventListener('change', updateDynamicUI); mdSel.addEventListener('change', updateDynamicUI); updateDynamicUI();
        document.getElementById('t-ctx-toggle').onchange = (e) => { document.getElementById('t-ctx-box').style.display = e.target.checked ? 'flex' : 'none'; };

        let tempPrompts = JSON.parse(JSON.stringify(config.prompts)); let curId = config.selectedPromptId;
        const pSel = document.getElementById('t-prompt-sel'), pName = document.getElementById('t-prompt-name'), pCon = document.getElementById('t-prompt-content');

        const renderPrompts = () => { pSel.innerHTML = tempPrompts.map(p => `<option value="${p.id}" ${p.id===curId?'selected':''}>${p.name}</option>`).join(''); const cur = tempPrompts.find(x=>x.id===curId); if(cur){ pName.value=cur.name; pCon.value=cur.content; } };
        renderPrompts();
        pSel.onchange = (e) => { const prev = tempPrompts.find(x=>x.id===curId); if(prev){prev.name=pName.value; prev.content=pCon.value;} curId = e.target.value; renderPrompts(); };
        pName.oninput = () => { const cur = tempPrompts.find(x=>x.id===curId); if(cur) {cur.name=pName.value; pSel.options[pSel.selectedIndex].text = pName.value;} };
        pCon.oninput = () => { const cur = tempPrompts.find(x=>x.id===curId); if(cur) cur.content = pCon.value; };

        document.getElementById('t-add-prompt').onclick = () => { const prev = tempPrompts.find(x=>x.id===curId); if(prev){prev.name=pName.value; prev.content=pCon.value;} const nId='p_'+Date.now(); tempPrompts.push({id:nId, name:'새 프리셋', content:''}); curId=nId; renderPrompts(); };
        document.getElementById('t-del-prompt').onclick = () => { if(tempPrompts.length<=1){alert('최소 1개는 필요합니다.');return;} tempPrompts=tempPrompts.filter(x=>x.id!==curId); curId=tempPrompts[0].id; renderPrompts(); };

        document.getElementById('t-save-btn').onclick = () => {
            const cur = tempPrompts.find(x=>x.id===curId); if(cur){ cur.name=pName.value; cur.content=pCon.value; }
            const pv = pvSel.value; const md = mdSel.value;

            let t = parseInt(document.getElementById('t-ctx-turns').value); if (isNaN(t)) t = 3; t = Math.max(1, Math.min(10, t));

            const newConf = { ...config, provider: pv, model: md, temperature: parseFloat(tempSlider.value) || 0.7,
                geminiKey: document.getElementById('t-gemini-key').value, fbConfig: document.getElementById('t-fb-config').value, deepseekKey: document.getElementById('t-ds-key').value,
                prompts: tempPrompts, selectedPromptId: curId, includeContext: document.getElementById('t-ctx-toggle').checked, contextTurns: t,
                includePersona: document.getElementById('t-ctx-persona').checked };

            if (md === 'gemini-2.5-pro') newConf.geminiBudget = Math.max(128, parseInt(document.getElementById('t-gem-budget').value) || 128);
            else if (md === 'gemini-3.1-pro-preview') newConf.geminiLevel3_1 = document.getElementById('t-gem-31').value;
            else if (md.includes('gemini-3')) newConf.geminiLevel3_x = document.getElementById('t-gem-3x').value;
            else if (md.includes('deepseek')) { newConf.dsThinking = document.getElementById('t-ds-thinking').checked; newConf.dsEffort = document.getElementById('t-ds-effort') ? document.getElementById('t-ds-effort').value : 'high'; }

            ConfigManager.setConfig(newConf); modal.remove();
        };
        document.querySelectorAll('.t-close-btn').forEach(b => b.onclick = () => modal.remove());
    }

    // ==========================================
    // 5. 버튼 주입 & 에디터 제어
    // ==========================================
    function injectMagicWand() {
        const targetContainer = document.querySelector('.pb-3.pl-3.pr-2\\.5.pt-1\\.5 .flex.items-center.space-x-2');
        if (!targetContainer || document.getElementById('crack-magic-wand-container')) return;

        const container = document.createElement('div'); container.id = 'crack-magic-wand-container'; container.style.cssText = 'display:flex; align-items:center; gap:8px; margin-left:8px; border-left: 1px solid var(--border); padding-left: 8px;';
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

        const tBtn = document.getElementById('cm-translate-btn'), ctrlGrp = document.getElementById('cm-ctrl-group'), rBtn = document.getElementById('cm-reroll-btn');
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
                if (cost.usd > 0) { addCumulativeCost(ConfigManager.getConfig().model, cost.usd); const c = ConfigManager.getConfig(); c.recentUsageStr = cost.str; ConfigManager.setConfig(c); }
                tBtn.style.display = 'none'; ctrlGrp.style.display = 'flex';
            } catch(e) { alert("번역 실패: " + e.message); }
            finally {
                tBtn.innerHTML = '🌍'; tBtn.style.cursor = 'pointer'; tBtn.disabled = false;
                if (isReroll) { rBtn.textContent = '↺ 리롤'; rBtn.disabled = false; }
            }
        };

        tBtn.onclick = () => doTranslate(getEditorText()); rBtn.onclick = () => { if(originalText) doTranslate(originalText, true); };
        document.getElementById('cm-undo-btn').onclick = () => { if(originalText) { setEditorText(originalText); originalText = null; ctrlGrp.style.display = 'none'; tBtn.style.display = 'flex'; } };

        const editorBox = document.querySelector('.__chat_input_textarea');
        if (editorBox) editorBox.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { originalText = null; ctrlGrp.style.display = 'none'; tBtn.style.display = 'flex'; } });
        const sendBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerHTML.includes('d="M18.77 11.13'));
        if (sendBtn) sendBtn.addEventListener('click', () => { originalText = null; ctrlGrp.style.display = 'none'; tBtn.style.display = 'flex'; });
    }

    function injectSettingsButton() {
        const menuContainer = document.querySelector('.py-4.overflow-y-auto.scrollbar > .px-2:first-of-type');
        if (menuContainer && !document.getElementById('crack-input-trans-settings')) {
            const btn = document.createElement('div'); btn.id = 'crack-input-trans-settings'; btn.className = 'px-2.5 h-4 box-content py-[18px]';
            btn.innerHTML = `<button class="w-full flex h-4 items-center justify-between typo-110-16-med space-x-2 ring-offset-4" style="cursor: pointer;"><span class="flex space-x-2 items-center"><span style="font-size: 16px;">🌍</span><span class="whitespace-nowrap overflow-hidden text-ellipsis typo-text-sm_leading-none_medium">입력 번역기 설정</span></span></button>`;
            btn.onclick = showSettingsModal; menuContainer.appendChild(btn);
        }
    }

    const observer = new MutationObserver(() => { injectSettingsButton(); injectMagicWand(); });
    if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", () => observer.observe(document.body, { childList: true, subtree: true })); }
    else { observer.observe(document.body, { childList: true, subtree: true }); injectSettingsButton(); injectMagicWand(); }
})();
