// ==UserScript==
// @name         Safari 입력창 확대 방지 (Viewport 조절)
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Safari에서 입력창 포커스 시 강제 줌 되는 현상을 막습니다.
// @author       Your Name
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use a strict';

    let viewport = document.querySelector("meta[name=viewport]");

    if (viewport) {
        let content = viewport.getAttribute("content");
        if (content && content.indexOf("user-scalable=no") === -1) {
            viewport.setAttribute("content", content + ", user-scalable=no, maximum-scale=1.0");
        }
    } else {
        viewport = document.createElement('meta');
        viewport.name = "viewport";
        viewport.content = "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no";
        document.getElementsByTagName('head')[0].appendChild(viewport);
    }
})();