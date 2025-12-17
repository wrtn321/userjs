// ==UserScript==
// @name         TeapotChat 확대 방지
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  TeapotChat 사이트의 입력창 확대 현상을 방지합니다.
// @author       Your Name
// @match        https://teapotchat.com/*
// @match        https://*.openai.com/* 
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // 1. Viewport 메타 태그 강제 설정
    const forceViewport = () => {
        let viewport = document.querySelector("meta[name=viewport]");
        if (!viewport) {
            viewport = document.createElement('meta');
            viewport.name = "viewport";
            (document.head || document.documentElement).appendChild(viewport);
        }
        viewport.setAttribute("content", "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no");
    };

    // 2. 입력창 폰트 사이즈 16px 강제 스타일 주입
    const addGlobalStyle = () => {
        const styleId = 'anti-zoom-style-teapot';
        if (document.getElementById(styleId)) return;

        const css = `
            textarea, select, input {
                font-size: 16px !important;
            }
        `;
        
        const style = document.createElement('style');
        style.id = styleId;
        style.type = 'text/css';
        style.appendChild(document.createTextNode(css));
        (document.head || document.documentElement).appendChild(style);
    };

    // 실행 로직
    const run = () => {
        forceViewport();
        addGlobalStyle();
    };

    run();

    new MutationObserver(run).observe(document.documentElement, {
        childList: true,
        subtree: true
    });

})();
