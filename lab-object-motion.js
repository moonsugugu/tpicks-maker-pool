'use strict';
// 사람 사진 자리의 모형(.lab-object 안의 그림)을 입체 TPICKS 로고처럼 움직인다.
// - 천천히 기울며 떠 있고, 마우스 쪽으로 살짝 기운다(로고와 같은 박자).
// - 모형 모양대로 오린 빛줄기가 천천히 지나가 살짝 광택이 난다.
// - 마우스로 잡으면 움직임이 멈추고 따라오며, 놓으면 제자리로 돌아간다(모형은 링크가 아니라 이동하지 않는다).
// - 움직임 줄이기 설정이면 멈춘 채로 둔다. 터치는 화면 넘기기를 막지 않도록 끌지 않는다.
(() => {
  const css = `
.lab-object .lo-tilt{position:absolute;inset:0;transform-style:preserve-3d;will-change:transform}
.lab-object .lo-tilt img{pointer-events:auto;cursor:grab;-webkit-user-drag:none;user-select:none}
.lab-object.lo-held .lo-tilt img{cursor:grabbing}
.lab-object .lo-shine{position:absolute;pointer-events:none;-webkit-mask-size:contain;mask-size:contain;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:center;mask-position:center;
  background:linear-gradient(112deg,transparent 38%,rgba(255,255,255,.08) 44%,rgba(255,255,255,.42) 50%,rgba(255,255,255,.08) 56%,transparent 62%) 0 0/320% 100% no-repeat;mix-blend-mode:screen}
.lab-object.lo-held{z-index:30!important}`;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const mounted = new Map();  // 모형 → 정리용 AbortController

  function mount(box) {
    const img = box.querySelector('img');
    if (!img || box.dataset.loMotion) return;
    box.dataset.loMotion = '1';
    const ac = new AbortController(), on = { signal: ac.signal };
    mounted.set(box, () => { ac.abort(); stop(); });
    img.draggable = false;
    const tilt = document.createElement('div'); tilt.className = 'lo-tilt';
    const shine = document.createElement('div'); shine.className = 'lo-shine';
    img.replaceWith(tilt); tilt.append(img, shine);
    const setMask = () => { const u = `url("${img.currentSrc || img.src}")`; shine.style.webkitMaskImage = u; shine.style.maskImage = u; };
    // 빛줄기는 그림과 같은 자리·크기에 둔다(그림의 object-fit:contain과 같은 방식으로 오림)
    const fit = () => { shine.style.left = img.offsetLeft + 'px'; shine.style.top = img.offsetTop + 'px'; shine.style.width = img.offsetWidth + 'px'; shine.style.height = img.offsetHeight + 'px'; };
    setMask(); fit();
    img.addEventListener('load', () => { setMask(); fit(); });
    new ResizeObserver(fit).observe(img);

    let raf = 0, last = 0, t = Math.random() * 10, visible = true, held = false;
    const pointer = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
    const draw = () => {
      // 로고(tpicks-logo3d.js)와 같은 박자: 0.52 · 0.41 · 0.48 · 0.86 · 빛 0.34
      const rx = -2 + Math.sin(t * .52) * 2.6 - cur.y * 5;
      const ry = -3 + Math.sin(t * .41) * 5 + cur.x * 8;
      const rz = -.6 + Math.sin(t * .48) * .8;
      const y = Math.sin(t * .86) * 5;
      tilt.style.transform = `perspective(760px) translateY(${y.toFixed(2)}px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) rotateZ(${rz.toFixed(2)}deg)`;
      shine.style.backgroundPositionX = (50 + Math.sin(t * .34) * 55 + cur.x * 12).toFixed(1) + '%';
    };
    const frame = now => {
      raf = 0;
      const dt = Math.min(last ? (now - last) / 1000 : 1 / 60, .05); last = now;
      t += dt;
      const k = 1 - Math.exp(-7.5 * dt);
      cur.x += (pointer.x - cur.x) * k; cur.y += (pointer.y - cur.y) * k;
      draw();
      start();
    };
    const start = () => { if (!raf && !held && visible && !document.hidden && !reduce.matches) { raf = requestAnimationFrame(frame); } };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; last = 0; };
    const still = () => { stop(); tilt.style.transform = ''; shine.style.backgroundPositionX = '30%'; };

    document.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch') return;
      const r = box.getBoundingClientRect();
      pointer.x = Math.max(-1, Math.min(1, (e.clientX - r.left - r.width / 2) / (innerWidth / 2)));
      pointer.y = Math.max(-1, Math.min(1, (e.clientY - r.top - r.height / 2) / (innerHeight / 2)));
    }, on);
    document.documentElement.addEventListener('pointerleave', () => { pointer.x = 0; pointer.y = 0; }, on);
    new IntersectionObserver(es => { visible = es[0]?.isIntersecting ?? true; visible ? start() : stop(); }, { threshold: .01 }).observe(box);
    document.addEventListener('visibilitychange', () => { document.hidden ? stop() : start(); }, on);
    reduce.addEventListener('change', () => { reduce.matches ? still() : start(); }, on);

    // 잡고 끌기
    let sx = 0, sy = 0;
    img.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.pointerType === 'touch') return;
      e.preventDefault();
      held = true; sx = e.clientX; sy = e.clientY; stop();
      box.classList.add('lo-held'); box.style.transition = 'none';
    });
    document.addEventListener('pointermove', e => { if (held) box.style.transform = `translate(${e.clientX - sx}px,${e.clientY - sy}px)`; }, on);
    const release = () => {
      if (!held) return;
      box.style.transition = reduce.matches ? 'none' : 'transform .6s cubic-bezier(.2,.9,.25,1)';
      box.style.transform = '';
      const done = () => { box.classList.remove('lo-held'); box.style.transition = ''; held = false; start(); };
      reduce.matches ? done() : setTimeout(done, 620);
    };
    document.addEventListener('pointerup', release, on);
    document.addEventListener('pointercancel', release, on);
    img.addEventListener('dragstart', e => e.preventDefault());

    reduce.matches ? still() : (draw(), start());
  }

  const boot = () => {
    for (const [box, dispose] of mounted) if (!box.isConnected) { dispose(); mounted.delete(box); }
    const boxes = document.querySelectorAll('.lab-object');
    if (!boxes.length) return false;
    if (!document.getElementById('lo-motion-css')) { const s = document.createElement('style'); s.id = 'lo-motion-css'; s.textContent = css; document.head.append(s); }
    boxes.forEach(mount);
    return true;
  };
  // 전문가 모집처럼 첫 화면을 스크립트가 다시 그리는 페이지도 있어, 새로 생긴 모형도 찾아 붙인다.
  boot();
  new MutationObserver(boot).observe(document.documentElement, { childList: true, subtree: true });
})();
