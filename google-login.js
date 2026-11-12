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

// 로그인 확인(서버 응답에 몇 초 걸릴 수 있음) 동안 화면을 덮는 대기 화면. loginWait(true)로 켜고 loginWait(false)로 끈다.
let loginWaitTimer = 0;
function loginWait(on) {
  clearTimeout(loginWaitTimer);
  document.getElementById('loginWait')?.remove();
  if (!on) return;
  if (!document.getElementById('loginWaitCss')) {
    const css = document.createElement('style'); css.id = 'loginWaitCss';
    css.textContent = '#loginWait{position:fixed;inset:0;z-index:200;display:grid;place-items:center;padding:20px;background:rgba(22,32,53,.55)}#loginWait .lw{background:#fff;border-radius:14px;padding:28px 30px;width:min(320px,100%);text-align:center;color:#241b37;box-shadow:0 18px 60px rgba(0,0,0,.25)}#loginWait .lw-spin{width:34px;height:34px;margin:0 auto 16px;border:3px solid #e2e2e8;border-top-color:#241b37;border-radius:50%;animation:lwspin .9s linear infinite}#loginWait b{display:block;font-size:16px;margin-bottom:6px}#loginWait p{margin:0;font-size:13px;line-height:1.6;color:#6b6b78}@keyframes lwspin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){#loginWait .lw-spin{animation-duration:3s}}';
    document.head.append(css);
  }
  const box = document.createElement('div'); box.id = 'loginWait'; box.setAttribute('role', 'status');
  box.innerHTML = '<div class="lw"><div class="lw-spin"></div><b>로그인을 확인하고 있습니다</b><p>잠시만 기다려 주세요. 처음에는 몇 초 걸릴 수 있습니다.</p></div>';
  document.body.append(box);
  loginWaitTimer = setTimeout(() => { box.querySelector('p').textContent = '평소보다 오래 걸리고 있습니다. 계속 안 되면 새로고침한 뒤 다시 시도해 주세요.'; }, 15000);
}
