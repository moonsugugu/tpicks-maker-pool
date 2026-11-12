'use strict';
// 구글 로그인 버튼. 구글이 준 증표(credential)는 서버(Apps Script)가 구글에 다시 물어 확인한다.
const GOOGLE_CLIENT_ID = '997629372614-gniisffeh138bqcripcej3ricus7u15p.apps.googleusercontent.com';
let googleScript = null, googleReady = false, googleCallback = null;
function googleButton(box, onCredential) {
  googleScript ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = resolve;
    s.onerror = () => { googleScript = null; reject(new Error('구글 로그인 창을 불러오지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.')); };
    document.head.append(s);
  });
  return googleScript.then(() => {
    googleCallback = onCredential;
    if (!googleReady) { google.accounts.id.initialize({client_id: GOOGLE_CLIENT_ID, callback: r => googleCallback?.(r.credential)}); googleReady = true; }
    google.accounts.id.renderButton(box, {theme: 'outline', size: 'large', text: 'signin_with', shape: 'rectangular', locale: 'ko', width: Math.min(300, box.clientWidth || 300)});
  });
}
