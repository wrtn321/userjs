// ==UserScript==
// @name         Safari 입력창 확대 방지
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  Safari에서 입력창 포커스 시 강제 줌 되는 현상을 막습니다.
// @author       Your Name
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 뷰포트(viewport) 메타 태그를 설정하여 확대 기능을 비활성화하는 함수
    const forceViewport = () => {
        let viewport = document.querySelector("meta[name=viewport]");

        // 뷰포트 메타 태그가 없으면 새로 생성
        if (!viewport) {
            viewport = document.createElement('meta');
            viewport.name = "viewport";
            document.getElementsByTagName('head')[0].appendChild(viewport);
        }

        // 확대/축소 관련 속성을 강제로 설정 (기존 값을 덮어쓰거나 추가)
        const newContent = "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no";

        // 기존 content와 다를 경우에만 설정하여 불필요한 변경 방지
        if (viewport.getAttribute("content") !== newContent) {
            viewport.setAttribute("content", newContent);
        }
    };

    // 1. 페이지 최초 로드 시 즉시 적용
    forceViewport();

    // 2. 페이지 콘텐츠가 동적으로 변경될 때마다 뷰포트 설정을 다시 강제
    // MutationObserver를 사용하여 DOM의 변경을 감시
    new MutationObserver(forceViewport)
        .observe(document.documentElement, {
            childList: true, // 자식 노드의 추가/제거 감시
            subtree: true    // 모든 하위 노드 감시
        });
})();
