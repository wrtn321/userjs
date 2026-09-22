// ==UserScript==
// @name         NovelAI 다이스 금지어/solo,aged up 자동추가
// @version      1.0.0
// @description  다이스 결과의 원치 않는 태그를 제거 및 boy/girl 뒤에 solo, aged up을 선택적으로 삽입
// @match        https://novelai.net/image*
// @match        https://www.novelai.net/image*
// @run-at       document-start
// @grant        none
// @license      MIT
// ==/UserScript==

(function (root, factory) {
    'use strict';

    const api = factory();

    // Node에서 변환 로직을 테스트할 수 있게 하되, 브라우저에서는 바로 설치합니다.
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        api.install(root.document, root);
    }
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
    'use strict';

    //금지어 목록
    const BLOCKED_TAGS = new Set([
        'afro',
        'mohawk',
        'pompadour',
        'dreadlocks',
        'plump',
        'fat',
        'beard',
        'bald',
        'green skin',
        'purple skin',
        'pink skin',
        'yellow skin',
        'androgynous',
        'gigantic breast',
        'gigantic breasts',
        'tusks'
    ]);

    const GENDER_TAGS = new Set(['boy', 'girl']);
    const INSERT_TAGS = ['solo', 'aged up'];
    const STORAGE_KEY = 'nai-character-randomizer-insert-solo-aged-up';
    const TOGGLE_ID = 'nai-character-randomizer-toggle';
    const STYLE_ID = 'nai-character-randomizer-style';
    const EDITABLE_SELECTOR = 'textarea, input:not([type]), input[type="text"], [contenteditable="true"]';

    function normalizeTag(tag) {
        return String(tag).trim().toLocaleLowerCase('en-US');
    }

    /**
     * 쉼표로 분리된 태그만 다룹니다. 따라서 부분 문자열이나 중괄호가 붙은
     * 태그는 삭제/삽입 대상으로 보지 않습니다.
     */
    function transformPrompt(prompt, insertSoloAndAgedUp) {
        const filtered = String(prompt)
            .split(',')
            .map((tag) => tag.trim())
            .filter((tag) => tag && !BLOCKED_TAGS.has(normalizeTag(tag)));

        if (!insertSoloAndAgedUp) {
            return filtered.join(', ');
        }

        const genderIndex = filtered.findIndex((tag) => GENDER_TAGS.has(normalizeTag(tag)));
        if (genderIndex === -1) {
            return filtered.join(', ');
        }

        // 위치까지 보장하면서 중복은 만들지 않도록 기존 두 태그를 옮깁니다.
        const withoutInsertTags = filtered.filter(
            (tag) => !INSERT_TAGS.includes(normalizeTag(tag))
        );
        const adjustedGenderIndex = withoutInsertTags.findIndex((tag) =>
            GENDER_TAGS.has(normalizeTag(tag))
        );
        withoutInsertTags.splice(adjustedGenderIndex + 1, 0, ...INSERT_TAGS);
        return withoutInsertTags.join(', ');
    }

    function isEditable(element) {
        const view = element?.ownerDocument?.defaultView;
        const style = view?.getComputedStyle ? view.getComputedStyle(element) : null;
        return Boolean(
            element &&
            element.matches &&
            element.matches(EDITABLE_SELECTOR) &&
            !element.disabled &&
            !element.readOnly &&
            style?.display !== 'none' &&
            style?.visibility !== 'hidden' &&
            element.getClientRects().length > 0
        );
    }

    function readEditor(element) {
        if (!element) return '';
        return element.isContentEditable ? element.textContent || '' : element.value || '';
    }

    function writeEditor(element, value, win, forceEvent) {
        if (readEditor(element) === value && !forceEvent) return false;

        if (element.isContentEditable) {
            element.textContent = value;
        } else {
            const prototype = element instanceof win.HTMLTextAreaElement
                ? win.HTMLTextAreaElement.prototype
                : win.HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
            if (setter) setter.call(element, value);
            else element.value = value;
        }

        element.dispatchEvent(new win.InputEvent('input', {
            bubbles: true,
            composed: true,
            inputType: 'insertReplacementText',
            data: value
        }));
        element.dispatchEvent(new win.Event('change', { bubbles: true }));
        return true;
    }

    function controlLabel(control) {
        return [
            control?.getAttribute?.('aria-label'),
            control?.getAttribute?.('title'),
            control?.getAttribute?.('data-testid'),
            control?.textContent
        ].filter(Boolean).join(' ');
    }

    function hasIcon(control, pattern) {
        const view = control?.ownerDocument?.defaultView;
        if (!view?.getComputedStyle) return false;
        return Array.from(control.querySelectorAll('*')).some((element) => {
            const style = view.getComputedStyle(element);
            const images = [
                style.maskImage,
                style.webkitMaskImage,
                style.backgroundImage
            ].filter(Boolean).join(' ');
            return pattern.test(images);
        });
    }

    function getButton(target) {
        const control = target?.closest?.('button, [role="button"]');
        if (!control || control.id === TOGGLE_ID) return null;
        return control;
    }

    function hasCharacterPromptMarker(element) {
        return /character\s+prompts?/i.test(element?.textContent || '');
    }

    function hasCharacterPromptDescription(element) {
        return /create\s+a\s+separate\s+prompt\s+for\s+characters/i.test(
            element?.textContent || ''
        );
    }

    function findCharacterCard(control) {
        let current = control;
        for (let depth = 0; current && depth < 9; depth += 1, current = current.parentElement) {
            if (
                current.querySelector?.('input[placeholder^="Character "]') &&
                current.querySelector?.('[contenteditable="true"]')
            ) {
                let section = current;
                for (let sectionDepth = 0; section && sectionDepth < 8; sectionDepth += 1) {
                    if (
                        hasCharacterPromptMarker(section) &&
                        hasCharacterPromptDescription(section)
                    ) {
                        return current;
                    }
                    section = section.parentElement;
                }
                return null;
            }
        }
        return null;
    }

    function findCharacterHeader(control) {
        let current = control;
        for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) {
            if (
                hasCharacterPromptMarker(current) &&
                hasCharacterPromptDescription(current) &&
                !/quality\s+tags|uc\s+preset|image2image/i.test(current.textContent || '')
            ) {
                return current;
            }
        }
        return null;
    }

    /**
     * 캐릭터 카드 또는 Character Prompts 제목 옆 버튼만 허용합니다.
     * 메인 Prompt의 주사위는 어느 쪽에도 속하지 않아 항상 제외됩니다.
     */
    function findCharacterContainer(control) {
        const card = findCharacterCard(control);
        if (card) return card;

        const header = findCharacterHeader(control);
        if (!header) return null;

        // 현재 DOM에서 헤더 → 위치 설정 → 캐릭터 카드 목록의 두 단계입니다.
        return header.parentElement?.parentElement || header.parentElement || header;
    }

    function getCharacterPromptEditors(doc) {
        const editors = new Set();

        // NovelAI가 부여하는 의미 있는 클래스명을 우선 사용합니다.
        doc.querySelectorAll(
            '[class*="prompt-input-box-character-prompts-"]:not([class*="undesired-content"]) [contenteditable="true"]'
        ).forEach((editor) => editors.add(editor));

        // 클래스명이 바뀌는 경우를 위한 구조 기반 보조 탐색입니다.
        doc.querySelectorAll('input[placeholder^="Character "]').forEach((nameInput) => {
            let card = nameInput.parentElement;
            for (let depth = 0; card && depth < 8; depth += 1, card = card.parentElement) {
                const candidates = Array.from(
                    card.querySelectorAll?.('[contenteditable="true"]') || []
                ).filter((editor) => !editor.closest('[class*="undesired-content"]'));
                if (candidates.length) {
                    candidates.forEach((editor) => editors.add(editor));
                    break;
                }
            }
        });

        return Array.from(editors).filter(isEditable);
    }

    function isVisible(element) {
        const view = element?.ownerDocument?.defaultView;
        const style = view?.getComputedStyle ? view.getComputedStyle(element) : null;
        return Boolean(
            element &&
            style?.display !== 'none' &&
            style?.visibility !== 'hidden' &&
            element.getClientRects().length > 0
        );
    }

    function promptEditorsInside(element) {
        const primary = Array.from(element?.querySelectorAll?.(
            '[class*="prompt-input-box-character-prompts-"]:not([class*="undesired-content"]) [contenteditable="true"]'
        ) || []);
        if (primary.length) return primary;

        return Array.from(element?.querySelectorAll?.('[contenteditable="true"]') || [])
            .filter((editor) => !editor.closest('[class*="undesired-content"]'));
    }

    /**
     * 화면에 실제로 존재하는 현재 Character 카드만 찾습니다. NovelAI가 보관하는
     * 이전 랜덤 결과/반응형 복제본은 카드 전체가 숨겨져 있으므로 여기서 제외됩니다.
     */
    function findVisibleCard(nameInput) {
        let current = nameInput?.parentElement;
        let card = null;

        for (let depth = 0; current && depth < 12; depth += 1, current = current.parentElement) {
            const names = current.querySelectorAll?.('input[placeholder^="Character "]') || [];
            if (names.length > 1) break;
            if (names.length === 1 && promptEditorsInside(current).length && isVisible(current)) {
                // 가장 안쪽의 보이는 조상을 카드로 사용합니다.
                card = current;
                break;
            }
        }
        return card;
    }

    function characterKey(nameInput, index) {
        return nameInput?.getAttribute?.('placeholder') || `Character ${index + 1}`;
    }

    function getVisibleCharacterEntries(doc) {
        const entries = [];
        const usedCards = new Set();

        Array.from(doc.querySelectorAll('input[placeholder^="Character "]')).forEach(
            (nameInput, index) => {
                const card = findVisibleCard(nameInput);
                if (!card || usedCards.has(card)) return;

                const editor = promptEditorsInside(card)[0];
                if (!editor) return;

                usedCards.add(card);
                entries.push({
                    key: characterKey(nameInput, index),
                    card,
                    editor
                });
            }
        );
        return entries;
    }

    function findPromptPreview(card, prompt) {
        const expected = String(prompt).trim().replace(/\s+/g, ' ');
        const buttons = Array.from(card?.querySelectorAll?.('button, [role="button"]') || [])
            .filter((button) => isVisible(button) && button.id !== TOGGLE_ID);

        return buttons.find((button) =>
            String(button.textContent || '').trim().replace(/\s+/g, ' ') === expected
        ) || null;
    }

    function wait(win, delay) {
        return new Promise((resolve) => win.setTimeout(resolve, delay));
    }

    async function waitForVisibleEditor(doc, key, win) {
        for (let attempt = 0; attempt < 8; attempt += 1) {
            const entry = getVisibleCharacterEntries(doc).find((item) => item.key === key);
            if (entry && isEditable(entry.editor)) return entry;
            await wait(win, 25);
        }
        return null;
    }

    function isCharacterHeaderAddButton(control, characterContainer) {
        if (!hasIcon(control, /(?:^|\/)plus\.[^/"')]+\.svg/i)) return false;
        return Boolean(findCharacterHeader(control) && characterContainer);
    }

    function isCharacterRandomizeButton(control, characterContainer) {
        return (
            /randomi[sz]e/i.test(controlLabel(control)) ||
            hasIcon(control, /(?:dice_alt|randomi[sz]e)/i) ||
            isCharacterHeaderAddButton(control, characterContainer)
        );
    }

    function getStoredToggle(storage) {
        try {
            const saved = storage.getItem(STORAGE_KEY);
            return saved === null ? true : saved === 'true';
        } catch (_) {
            return true;
        }
    }

    function setStoredToggle(storage, enabled) {
        try {
            storage.setItem(STORAGE_KEY, String(enabled));
        } catch (_) {
            // 저장소가 차단돼도 현재 탭에서의 토글은 계속 작동합니다.
        }
    }

    function findChunksPlacement(doc) {
        const chunksButton = Array.from(doc.querySelectorAll('button')).find(
            (button) => button.textContent?.trim() === 'Chunks'
        );
        const host = chunksButton?.parentElement;
        if (
            !host ||
            !Array.from(host.children).some((element) => element.textContent?.trim() === 'Prompt') ||
            !Array.from(host.children).some(
                (element) => element.textContent?.trim() === 'Reference Images'
            )
        ) {
            return null;
        }
        return { host, after: chunksButton, placement: 'mobile' };
    }

    function findModelModePlacement(doc) {
        const labels = Array.from(doc.querySelectorAll('span'));
        const modelLabel = labels.find((element) => element.textContent?.trim() === 'Model');
        const modeLabel = labels.find((element) => element.textContent?.trim() === 'Mode');
        if (!modelLabel || !modeLabel) return null;

        let common = modelLabel.parentElement;
        while (common && !common.contains(modeLabel)) common = common.parentElement;
        if (!common || !common.querySelector('[role="combobox"]')) return null;
        return { host: common, after: null, placement: 'desktop' };
    }

    function installToggle(doc, win, state) {
        if (!doc.head || !doc.body) return;

        const useDesktopPlacement = win.matchMedia('(min-width: 769px)').matches;
        const target = useDesktopPlacement
            ? findModelModePlacement(doc) || findChunksPlacement(doc)
            : findChunksPlacement(doc) || findModelModePlacement(doc);
        if (!target) return;

        if (!doc.getElementById(STYLE_ID)) {
            const style = doc.createElement('style');
            style.id = STYLE_ID;
            style.textContent = `
                #${TOGGLE_ID} {
                    flex: 0 0 auto; align-self: center;
                    min-width: 42px; border: 1px solid rgba(255,255,255,.2);
                    border-radius: 5px; padding: 4px 9px; color: #fff;
                    background: #5b5b66; cursor: pointer;
                    font: 600 11px/1.2 system-ui, sans-serif;
                    transition: background-color .15s ease, opacity .15s ease;
                }
                #${TOGGLE_ID}[data-placement="mobile"] { margin-left: 6px; }
                #${TOGGLE_ID}[data-placement="desktop"] { margin-left: auto; margin-right: 2px; }
                #${TOGGLE_ID}[aria-pressed="true"] { background: #6c4ed9; }
                #${TOGGLE_ID}:hover { opacity: .88; }
                #${TOGGLE_ID}:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
            `;
            doc.head.appendChild(style);
        }

        let button = doc.getElementById(TOGGLE_ID);
        if (!button) {
            button = doc.createElement('button');
            button.id = TOGGLE_ID;
            button.type = 'button';
            button.setAttribute('aria-label', 'solo, aged up 자동 삽입 켜기/끄기');

            const render = () => {
                button.setAttribute('aria-pressed', String(state.insertEnabled));
                button.title = `boy/girl 뒤에 solo, aged up 자동 삽입: ${
                    state.insertEnabled ? 'ON' : 'OFF'
                }`;
                button.textContent = 'solo';
            };
            button.addEventListener('click', () => {
                state.insertEnabled = !state.insertEnabled;
                setStoredToggle(win.localStorage, state.insertEnabled);
                render();
            });
            render();
        }

        button.dataset.placement = target.placement;
        if (target.after) {
            if (button.previousElementSibling !== target.after) {
                target.after.insertAdjacentElement('afterend', button);
            }
        } else if (button.parentElement !== target.host || button !== target.host.lastElementChild) {
            target.host.appendChild(button);
        }
    }

    function install(doc, win) {
        if (!doc || !win || doc.__naiCharacterRandomizerInstalled) return;
        doc.__naiCharacterRandomizerInstalled = true;

        const state = {
            insertEnabled: getStoredToggle(win.localStorage),
            randomizeRunId: 0,
            processQueue: Promise.resolve()
        };

        const ensureControls = () => installToggle(doc, win, state);
        if (doc.readyState === 'loading') {
            doc.addEventListener('DOMContentLoaded', ensureControls, { once: true });
        } else {
            ensureControls();
        }
        new win.MutationObserver(ensureControls).observe(doc.documentElement, {
            childList: true,
            subtree: true
        });
        win.addEventListener('resize', ensureControls, { passive: true });

        doc.addEventListener('click', (event) => {
            const control = getButton(event.target);
            if (!control) return;

            const characterContext = findCharacterContainer(control);
            if (!characterContext) return;
            if (!isCharacterRandomizeButton(control, characterContext)) return;

            const runId = ++state.randomizeRunId;
            const before = new Map(
                getVisibleCharacterEntries(doc).map((entry) => [entry.key, readEditor(entry.editor)])
            );

            const processResult = async () => {
                if (runId !== state.randomizeRunId) return;

                // DOM이 카드 전환 때 교체될 수 있어 key 목록만 고정하고 매번 다시 찾습니다.
                const keys = getVisibleCharacterEntries(doc).map((entry) => entry.key);
                for (const key of keys) {
                    if (runId !== state.randomizeRunId) return;

                    let entry = getVisibleCharacterEntries(doc).find((item) => item.key === key);
                    if (!entry) continue;

                    const current = readEditor(entry.editor);
                    if (!current || (before.has(key) && before.get(key) === current)) continue;

                    const transformed = transformPrompt(current, state.insertEnabled);
                    if (transformed === current) {
                        before.set(key, current);
                        continue;
                    }

                    if (isEditable(entry.editor)) {
                        if (writeEditor(entry.editor, transformed, win)) before.set(key, transformed);
                        continue;
                    }

                    // 접힌 카드도 우선 숨은 편집기에 직접 반영합니다. 성공하면 카드가
                    // 열리지 않으므로 레이아웃·스크롤·포커스가 전혀 움직이지 않습니다.
                    const preview = findPromptPreview(entry.card, current);
                    writeEditor(entry.editor, transformed, win);
                    await wait(win, 45);

                    if (findPromptPreview(entry.card, transformed)) {
                        before.set(key, transformed);
                        continue;
                    }

                    // 사이트가 숨은 편집기의 이벤트를 무시한 경우에만 해당 카드의
                    // 미리보기를 코드로 클릭합니다. HTMLElement.click()은 포커스를
                    // 옮기지 않으며 scrollIntoView도 호출하지 않습니다.
                    if (!preview?.isConnected) {
                        entry = getVisibleCharacterEntries(doc).find((item) => item.key === key);
                    }
                    const currentPreview = preview?.isConnected
                        ? preview
                        : findPromptPreview(entry?.card, current);
                    if (!currentPreview) continue;

                    currentPreview.click();
                    const opened = await waitForVisibleEditor(doc, key, win);
                    if (!opened || runId !== state.randomizeRunId) continue;

                    const openedValue = readEditor(opened.editor);
                    const openedTransformed = transformPrompt(openedValue, state.insertEnabled);
                    if (openedValue) {
                        // 숨은 상태에서 DOM 글자만 먼저 바뀌었더라도, 이제 보이는
                        // ProseMirror에 input 이벤트를 다시 보내 내부 상태까지 확정합니다.
                        writeEditor(opened.editor, openedTransformed, win, true);
                    }
                    before.set(key, openedTransformed || transformed);
                }
            };

            // 랜덤 결과가 만들어진 직후 한 번, 느린 렌더를 대비해 다시 확인합니다.
            [100, 350, 900, 1600].forEach((delay) => {
                win.setTimeout(() => {
                    // 여러 확인 시점이 겹쳐 같은 카드를 동시에 여는 일을 막습니다.
                    state.processQueue = state.processQueue
                        .catch(() => undefined)
                        .then(() => processResult());
                }, delay);
            });
        }, true);
    }

    return {
        BLOCKED_TAGS,
        transformPrompt,
        getVisibleCharacterEntries,
        install
    };
});
