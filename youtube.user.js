// ==UserScript==
// @name         YouTube Video Screenshot
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  유튜브 화면을 캡쳐하여 저장. (단축키: S)
// @match        https://www.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 캡처 단축키 설정 (원하는 키로 변경 가능)
    const TRIGGER_KEY = 's';

    // 파일명 금지 문자 제거 함수
    function sanitizeFilename(name) {
        return name.replace(/[\/\\?%*:|"<>]/g, '').trim();
    }

    // 재생 시간을 '00분00초' 포맷으로 변환하는 함수
    function formatVideoTime(seconds) {
        const totalSeconds = Math.floor(seconds);
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        return `${String(mins).padStart(2, '0')}분${String(secs).padStart(2, '0')}초`;
    }

    // 토스트 메시지
    function showToast(message) {
        const existingToast = document.getElementById('yt-capture-toast');
        if (existingToast) existingToast.remove();

        let toast = document.createElement('div');
        toast.id = 'yt-capture-toast';
        toast.textContent = message;
        toast.style.position = 'fixed';
        toast.style.top = '10%';
        toast.style.left = '50%';
        toast.style.transform = 'translate(-50%, -50%)';
        toast.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        toast.style.color = 'white';
        toast.style.padding = '10px 20px';
        toast.style.borderRadius = '5px';
        toast.style.zIndex = '99999';
        toast.style.fontSize = '16px';
        toast.style.fontWeight = 'bold';
        toast.style.pointerEvents = 'none';

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.transition = 'opacity 0.5s';
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 500);
        }, 1500);
    }

    // 캡처 로직
    function captureVideo() {
        const video = document.querySelector('video');

        if (!video) return;

        // 캔버스 생성
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        if (canvas.width === 0 || canvas.height === 0) {
            showToast("⚠️ 영상을 재생한 후 시도해주세요.");
            return;
        }

        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // 1. 영상 제목 가져오기
        // (유튜브 제목 뒤에 붙는 불필요한 알림 숫자나 텍스트 정리)
        let rawTitle = document.title.replace(/^\(\d+\)\s*/, '').replace(' - YouTube', '');
        let videoTitle = sanitizeFilename(rawTitle);

        // 2. 현재 재생 시간 가져오기
        let currentTimeString = formatVideoTime(video.currentTime);

        // 3. 파일명 조합: 제목_05분30초.jpg
        let fileName = `${videoTitle}_${currentTimeString}.jpg`;

        // 다운로드
        const dataURL = canvas.toDataURL('image/jpg');
        const link = document.createElement('a');
        link.download = fileName;
        link.href = dataURL;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast(`📸 저장됨: ${currentTimeString}`);
    }

    // 키보드 이벤트
    document.addEventListener('keydown', function(e) {
        const activeTag = document.activeElement.tagName.toUpperCase();
        const isEditable = document.activeElement.isContentEditable;
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || isEditable) {
            return;
        }

        if (e.key.toLowerCase() === TRIGGER_KEY) {
            captureVideo();
        }
    });

})();
