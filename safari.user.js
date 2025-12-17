// ==UserScript==
// @name         Safari 입력창 확대 방지 (최종 강화판)
// @namespace    http://tampermonkey.net/
// @version      0.3
// @description  Viewport 조절 + 입력창 폰트 16px 강제 (모든 사이트 호환)
// @author       Your Name
// @match        *://*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // 1. Viewport 메타 태그 강제 설정 (기존 로직)
    const forceViewport = () => {
        let viewport = document.querySelector("meta[name=viewport]");
        if (!viewport) {
            viewport = document.createElement('meta');
            viewport.name = "viewport";
            document.head.appendChild(viewport);
        }
        
        // 기존 content 값을 가져옴
        let content = viewport.getAttribute("content") || "";
        
        // 필요한 속성들이 없으면 추가하는 방식 (무조건 덮어쓰기보다 안전함)
        let needsUpdate = false;
        if (!content.includes("user-scalable=no")) {
            content += ", user-scalable=no";
            needsUpdate = true;
        }
        if (!content.includes("maximum-scale=1.0")) {
            content += ", maximum-scale=1.0";
            needsUpdate = true;
        }
        if (!content.includes("width=device-width")) {
            content += ", width=device-width";
            needsUpdate = true;
        }

        if (needsUpdate) {
            viewport.setAttribute("content", content);
        }
    };

    // 2. 입력창 폰트 사이즈 16px 강제 스타일 주입 (새로운 로직)
    // iOS Safari는 16px 이상일 때 확대를 하지 않음.
    const addGlobalStyle = () => {
        const styleId = 'anti-zoom-style';
        if (document.getElementById(styleId)) return;

        const css = `
            input[type="text"], input[type="password"], input[type="search"], 
            input[type="email"], input[type="number"], input[type="tel"], 
            input[type="url"], textarea, select {
                font-size: 16px !important; 
            }
        `;
        
        const style = document.createElement('style');
        style.id = styleId;
        style.type = 'text/css';
        style.appendChild(document.createTextNode(css));
        
        // head가 없으면 html에라도 붙임
        (document.head || document.documentElement).appendChild(style);
    };

    // 실행 로직
    const run = () => {
        forceViewport();
        addGlobalStyle();
    };

    // 초기 실행
    run();

    // 동적 변화 감지
    new MutationObserver(run).observe(document.documentElement, {
        childList: true,
        subtree: true
    });

})();
