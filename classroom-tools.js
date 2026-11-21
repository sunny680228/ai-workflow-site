(() => {
  const el = id => document.getElementById('class-' + id);
  const ink = el('ink'), pens = el('pens'), clock = el('clock'), face = el('face');
  let mode = 'pen', stroke = null;
  el('clear').onclick = () => {
    stroke = null;
    ink.replaceChildren();
  };
  const page = () => document.querySelector('[role="tabpanel"].active')?.id || 'home';
  const syncInk = () => {
    ink.style.height = document.body.scrollHeight + 'px';
    for (const line of ink.children) line.style.display = line.dataset.page === page() ? '' : 'none';
  };
  // Exclude the overlay itself from document height when switching to shorter lessons.
  new ResizeObserver(() => {
    ink.style.height = '0px';
    syncInk();
  }).observe(document.body);
  for (const panel of document.querySelectorAll('[role="tabpanel"]'))
    new MutationObserver(syncInk).observe(panel, {attributes:true, attributeFilter:['class']});
  pens.ontoggle = () => {
    ink.classList.toggle('drawing', pens.open);
    if (pens.open && matchMedia('(max-width:580px)').matches) clock.open = false;
    stroke = null;
  };
  clock.ontoggle = () => {
    if (clock.open && matchMedia('(max-width:580px)').matches) pens.open = false;
  };
  for (const b of pens.querySelectorAll('[data-mode]')) b.onclick = () => {
    mode = b.dataset.mode;
    for (const item of pens.querySelectorAll('[data-mode]')) item.setAttribute('aria-pressed', String(item === b));
  };
  function mark(e, first) {
    const rect = ink.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    if (mode === 'erase') {
      for (const line of Array.from(ink.children)) {
        if (line.dataset.page === page() && line.isPointInStroke(new DOMPoint(x,y))) line.remove();
      }
    } else if (first) {
      stroke = document.createElementNS(ink.namespaceURI,'path');
      for (const [key,value] of Object.entries({fill:'none',stroke:el('color').value,'stroke-width':5,'stroke-linecap':'round','stroke-linejoin':'round',d:'M'+x+' '+y+' l0.01 0'})) stroke.setAttribute(key,value);
      stroke.dataset.page = page();
      ink.append(stroke);
    } else if (stroke) stroke.setAttribute('d',stroke.getAttribute('d')+' L'+x+' '+y);
  }
  ink.onpointerdown = e => {
    if (!e.isPrimary || e.button !== 0) return;
    ink.setPointerCapture(e.pointerId);
    mark(e,true);
  };
  ink.onpointermove = e => { if (ink.hasPointerCapture(e.pointerId)) mark(e,false); };
  ink.onlostpointercapture = () => { stroke = null; };

  let total = 180, left = total, end = 0, ticker = 0;
  function paint() {
    const seconds = Math.ceil(left);
    const time = [Math.floor(seconds/60),seconds%60].map(n => String(n).padStart(2,'0')).join(':');
    el('time').textContent = time;
    el('mini').textContent = end || left !== total ? time : '計時';
    el('ring').style.setProperty('--remaining', (total ? 100*left/total : 0)+'%');
    el('ring').classList.toggle('urgent', seconds <= 10);
    el('start').textContent = end ? '暫停' : left === 0 || left === total ? '開始' : '繼續';
    el('start').disabled = !total;
    el('min').disabled = el('sec').disabled = !!end;
  }
  function stop() { clearInterval(ticker); end = 0; }
  function tick() {
    left = Math.max(0,(end-Date.now())/1000);
    if (!left) stop();
    paint();
  }
  function reset() {
    stop();
    const value = (id,max) => Math.min(max, Math.max(0, Math.floor(Number(el(id).value)||0)));
    left = total = 60*value('min',999) + value('sec',59);
    paint();
  }
  for (const id of ['min','sec']) {
    el(id).oninput = reset;
    el(id).onchange = () => { reset(); el('min').value = Math.floor(total/60); el('sec').value = total%60; };
  }
  el('reset').onclick = reset;
  el('start').onclick = () => {
    if (end) { tick(); stop(); }
    else { if (!left) left = total; end = Date.now()+left*1000; ticker = setInterval(tick,150); }
    paint();
  };
  function large(on) {
    face.classList.toggle('large',on);
    el('full').title = on ? '退出全螢幕' : '全螢幕計時';
    el('full').setAttribute('aria-label',el('full').title);
  }
  el('full').onclick = async () => {
    if (face.classList.contains('large')) {
      if (document.fullscreenElement === face) await document.exitFullscreen();
      large(false);
    } else {
      large(true);
      try { await face.requestFullscreen(); } catch { /* Keep the viewport-sized view. */ }
    }
  };
  document.addEventListener('fullscreenchange',() => large(document.fullscreenElement === face));
  document.addEventListener('keydown',e => { if (e.key === 'Escape' && !document.fullscreenElement) large(false); });
  paint();
})();
