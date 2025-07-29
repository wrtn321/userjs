// ==UserScript==
// @name         wrtn 채팅 스크롤 캡처
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  wrtn.ai 채팅방의 내부 스크롤 영역을 이미지로 캡처합니다. (정밀 조절 버전)
// @author       Your Name
// @match        https://crack.wrtn.ai/u/*/c/*
// @grant        none
// @require      https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // UI 버튼 생성 함수
    const createCaptureButton = () => {
        const button = document.createElement('button');
        button.innerText = '💬 채팅 일부 캡처';
        button.style.position = 'fixed';
        button.style.bottom = '60px';
        button.style.right = '20px';
        button.style.zIndex = '9999';
        button.style.padding = '10px 15px';
        button.style.backgroundColor = '#28a745';
        button.style.color = 'white';
        button.style.border = 'none';
        button.style.borderRadius = '5px';
        button.style.cursor = 'pointer';
        button.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';

        button.addEventListener('click', captureChat);

        document.body.appendChild(button);
    };

    // 채팅 영역을 캡처하는 함수
    const captureChat = async () => {
        const chatContainer = document.querySelector('#character-message-list');
        if (!chatContainer) {
            alert('채팅 컨테이너를 찾을 수 없습니다.');
            return;
        }

        const button = document.querySelector('button[style*="background-color: rgb(40, 167, 69)"]');
        if(button) button.innerText = '캡처 중...';

        try {
            const canvas = await html2canvas(chatContainer, {
                useCORS: true,
                scrollY: -window.scrollY
            });

            const croppedCanvas = document.createElement('canvas');
            const cropContext = croppedCanvas.getContext('2d');

            const totalHeight = canvas.height;
            const viewportHeight = chatContainer.clientHeight;
            const PIXELS_ABOVE = 400;


            const captureHeight = viewportHeight + PIXELS_ABOVE;

            const finalHeight = Math.min(captureHeight, totalHeight);
            const startY = totalHeight - finalHeight;

            croppedCanvas.width = canvas.width;
            croppedCanvas.height = finalHeight;

            cropContext.drawImage(canvas, 0, startY, canvas.width, finalHeight, 0, 0, canvas.width, finalHeight);

            const link = document.createElement('a');
            link.download = `chat_capture_${Date.now()}.png`;
            link.href = croppedCanvas.toDataURL('image/png');
            link.click();

        } catch (error) {
            console.error('캡처 중 오류 발생:', error);
            alert('이미지를 캡처하는 데 실패했습니다.');
        } finally {
            if(button) button.innerText = '💬 채팅 일부 캡처';
        }
    };

    setTimeout(createCaptureButton, 3000);

})();