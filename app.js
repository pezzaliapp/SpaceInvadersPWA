/* Space Invaders (1978) — pezzaliAPP
   MIT License — 2025
*/
(() => {
  'use strict';

  // ===== Canvas & UI =====
  const cvs = document.getElementById('game');
  const ctx = cvs.getContext('2d');
  const btnLeft = document.getElementById('btnLeft');
  const btnRight = document.getElementById('btnRight');
  const btnFire = document.getElementById('btnFire');
  const btnPause = document.getElementById('btnPause');
  const btnRestart = document.getElementById('btnRestart');
  const btnPlay = document.getElementById('btnPlay');
  const overlay = document.getElementById('overlay');
  const lblScore = document.getElementById('score');
  const lblWave = document.getElementById('wave');
  const lblLives = document.getElementById('lives');
  const chkSound = document.getElementById('chkSound');

  // Install SW
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js');
  }

  // ===== Game State =====
  const W = cvs.width, H = cvs.height;
  const state = {
    playing:false, paused:false,
    tick:0, score:0, wave:1, lives:3,
    keys:{left:false,right:false,fire:false},
    shots:[], bombs:[], aliens:[], shields:[], ufo:null,
    player:{x:W/2, y:H-50, w:40, h:16, speed:240, cd:0}
  };

  // ===== Helpers =====
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
  function rect(a,b){
    return !(a.x+a.w < b.x || b.x+b.w < a.x || a.y+a.h < b.y || b.y+b.h < a.y);
  }
  function rand(a,b){ return Math.random()*(b-a)+a; }
  function playBeep(freq=440, dur=0.05, type='square'){
    if (!chkSound.checked) return;
    try {
      const ctxA = new (window.AudioContext||window.webkitAudioContext)();
      const osc = ctxA.createOscillator();
      const g = ctxA.createGain();
      osc.type = type; osc.frequency.value = freq;
      osc.connect(g); g.connect(ctxA.destination);
      g.gain.setValueAtTime(0.06, ctxA.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctxA.currentTime + dur);
      osc.start(); osc.stop(ctxA.currentTime + dur + 0.02);
      osc.onended = () => ctxA.close();
    } catch(e){/* ignore */}
  }

  // ===== Entities =====
  function spawnWave(){
    state.aliens.length = 0;
    const rows = 3 + Math.min(3, state.wave); // 4..6 rows
    const cols = 7 + Math.min(5, state.wave); // 8..12 cols
    const gapX = 14, gapY = 22;
    const cellW = 24, cellH = 18;
    const startX = (W - (cols*cellW + (cols-1)*gapX)) / 2;
    const startY = 80;
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        state.aliens.push({
          x:startX + c*(cellW+gapX),
          y:startY + r*(cellH+gapY),
          w:cellW, h:cellH, alive:true, frame:0, value: 10 + (rows-r)*5
        });
      }
    }
    state.alienDir = 1;
    state.alienSpeed = 24 + state.wave*6; // px/s lateral (group speed factor)
    state.alienStepDown = 18;
    state.alienFireRate = 1.2 + state.wave*0.25; // bullets per second (group)
    state.ufoTimer = rand(8, 16);
  }

  function resetGame(){
    state.score = 0; state.wave = 1; state.lives = 3;
    state.shots.length = 0; state.bombs.length = 0;
    state.ufo = null;
    state.player.x = W/2;
    spawnWave();
    updateHud();
  }

  function nextWave(){
    state.wave++; spawnWave();
    updateHud();
  }

  function updateHud(){
    lblScore.textContent = state.score|0;
    lblWave.textContent = state.wave|0;
    lblLives.textContent = state.lives|0;
  }

  // ===== Input =====
  const keymap = {ArrowLeft:'left', ArrowRight:'right', a:'left', d:'right', A:'left', D:'right', ' ':'fire'};
  document.addEventListener('keydown', (e)=>{
    if (e.key==='p' || e.key==='P'){ togglePause(); return; }
    if (keymap[e.key]){ state.keys[keymap[e.key]] = true; e.preventDefault(); }
    if (!state.playing && (e.key===' ')){ startGame(); }
  });
  document.addEventListener('keyup', (e)=>{
    if (keymap[e.key]){ state.keys[keymap[e.key]] = false; e.preventDefault(); }
  });

  // Touch controls (continuous while pressed)
  function bindHold(btn, prop){
    let t;
    const on = ()=>{ state.keys[prop] = true; };
    const off = ()=>{ state.keys[prop] = false; };
    btn.addEventListener('touchstart', (e)=>{ e.preventDefault(); on(); });
    btn.addEventListener('touchend', (e)=>{ e.preventDefault(); off(); });
    btn.addEventListener('touchcancel', (e)=>{ e.preventDefault(); off(); });
    btn.addEventListener('mousedown', (e)=>{ e.preventDefault(); on(); });
    btn.addEventListener('mouseup', (e)=>{ e.preventDefault(); off(); });
    btn.addEventListener('mouseleave', (e)=>{ off(); });
  }
  bindHold(btnLeft,'left');
  bindHold(btnRight,'right');
  bindHold(btnFire,'fire');

  btnPause.addEventListener('click', togglePause);
  btnRestart.addEventListener('click', ()=>{ resetGame(); showOverlay(true); });
  btnPlay.addEventListener('click', ()=>{ startGame(); });

  function togglePause(){
    if (!state.playing) return;
    state.paused = !state.paused;
    btnPause.textContent = state.paused ? 'Riprendi' : 'Pausa';
    if (!state.paused) last = performance.now(); // resync deltatime
    showOverlay(state.paused);
  }
  function showOverlay(show){
    overlay.classList.toggle('hidden', !show);
  }

  function startGame(){
    resetGame();
    state.playing = true; state.paused = false; showOverlay(false);
    playBeep(660, .08);
  }

  // ===== Game Loop =====
  let last = performance.now();
  function loop(now){
    requestAnimationFrame(loop);
    const dt = Math.min(0.033, (now - last)/1000); // clamp to 30fps max step
    last = now;
    if (!state.playing || state.paused) { draw(); return; }
    update(dt);
    draw();
  }
  requestAnimationFrame(loop);

  // ===== Update =====
  function update(dt){
    state.tick += dt;

    // player move
    const p = state.player;
    const dir = (state.keys.left?-1:0) + (state.keys.right?1:0);
    p.x = clamp(p.x + dir*p.speed*dt, 28, W-28);
    p.cd = Math.max(0, p.cd - dt);
    if (state.keys.fire && p.cd<=0){
      state.shots.push({x:p.x-2, y:p.y-18, w:4, h:10, v:-360});
      playBeep(880,.05);
      p.cd = 0.23;
    }

    // aliens move as block
    const alive = state.aliens.filter(a=>a.alive);
    if (alive.length===0){ playBeep(1040,.08); nextWave(); }
    else {
      // boundaries
      let minX = Infinity, maxX = -Infinity, maxY = -Infinity;
      for(const a of alive){
        minX = Math.min(minX, a.x);
        maxX = Math.max(maxX, a.x + a.w);
        maxY = Math.max(maxY, a.y + a.h);
      }
      const speed = state.alienSpeed * Math.max(1, 1 + (1 - alive.length/state.aliens.length)*1.5);
      const dx = state.alienDir * speed * dt;
      if (minX + dx < 8 || maxX + dx > W-8){
        // step down & reverse
        for(const a of alive){ a.y += state.alienStepDown; }
        state.alienDir *= -1;
      } else {
        for(const a of alive){ a.x += dx; a.frame += dt*8; }
      }
      // lose if aliens reach player line
      if (maxY >= state.player.y - 14){
        loseLife(true);
      }
      // alien shooting (random front-row shooters)
      const frontByCol = new Map();
      for(const a of alive){
        const col = Math.round(a.x/40);
        const prev = frontByCol.get(col);
        if (!prev || a.y > prev.y) frontByCol.set(col, a);
      }
      const shooters = [...frontByCol.values()];
      const fireProb = state.alienFireRate * dt;
      if (Math.random() < fireProb && shooters.length){
        const s = shooters[Math.floor(Math.random()*shooters.length)];
        state.bombs.push({x:s.x+s.w/2-2, y:s.y+s.h, w:4, h:12, v:+180});
        playBeep(220,.05,'sawtooth');
      }
    }

    // UFO spawn
    state.ufoTimer -= dt;
    if (state.ufoTimer <= 0 && !state.ufo){
      const dir = Math.random() < 0.5 ? 1 : -1;
      const x = dir>0 ? -40 : W+40;
      state.ufo = {x, y:48, w:34, h:16, v: 120*dir, value: 50 + 10*state.wave};
      playBeep(320,.12,'triangle');
      state.ufoTimer = rand(10, 20);
    }
    if (state.ufo){
      state.ufo.x += state.ufo.v*dt;
      if (state.ufo.x < -60 || state.ufo.x > W+60) state.ufo = null;
    }

    // shots
    for (const s of state.shots){ s.y += s.v*dt; }
    state.shots = state.shots.filter(s => s.y + s.h > 0);

    // bombs
    for (const b of state.bombs){ b.y += b.v*dt; }
    state.bombs = state.bombs.filter(b => b.y < H+30);

    // collisions: shots vs aliens
    for (const s of state.shots){
      // vs UFO
      if (state.ufo && rect(s, state.ufo)){
        state.score += state.ufo.value; state.ufo = null; s.y = -999;
        playBeep(1180,.09); updateHud();
      }
      for (const a of state.aliens){
        if (!a.alive) continue;
        if (rect(s, a)){
          a.alive = false; s.y = -999; state.score += a.value;
          playBeep(720,.06); updateHud();
          break;
        }
      }
    }
    state.shots = state.shots.filter(s => s.y>-50);

    // bombs vs player
    for (const b of state.bombs){
      if (rect(b, state.player)){ b.y = H+999; loseLife(false); break; }
    }
  }

  function loseLife(instant=false){
    state.lives--;
    updateHud();
    playBeep(140,.15,'sawtooth');
    if (state.lives <= 0){
      gameOver();
      return;
    }
    // reset partial
    state.shots.length = 0; state.bombs.length = 0; state.ufo = null;
    state.player.x = W/2;
    if (instant){
      // also push aliens back a bit
      for(const a of state.aliens){ a.y -= 30; }
    }
  }

  function gameOver(){
    state.playing = false;
    showOverlay(true);
    document.getElementById('title').textContent = 'Game Over';
    document.getElementById('subtitle').innerHTML = `Punteggio: <b>${state.score|0}</b> — Premi <kbd>Spazio</kbd> o <b>Gioca</b> per ripartire.`;
  }

  // ===== Draw =====
  function draw(){
    // backdrop
    ctx.clearRect(0,0,W,H);
    // stars
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for(let i=0;i<60;i++){ ctx.fillRect((i*73)%W, ((i*97)+((state.tick*10)|0))%H, 1, 1); }

    // player
    const p = state.player;
    drawShip(p.x, p.y);

    // shots
    ctx.fillStyle = '#e5f2ff';
    for (const s of state.shots){ ctx.fillRect(s.x, s.y, s.w, s.h); }

    // aliens
    for (const a of state.aliens){
      if (!a.alive) continue;
      drawAlien(a);
    }

    // bombs
    ctx.fillStyle = '#ff5f6d';
    for (const b of state.bombs){ ctx.fillRect(b.x, b.y, b.w, b.h); }

    // UFO
    if (state.ufo){
      drawUfo(state.ufo);
    }
  }

  function drawShip(x,y){
    ctx.fillStyle = '#48e074';
    ctx.beginPath();
    ctx.moveTo(x, y-16);
    ctx.lineTo(x-20, y+10);
    ctx.lineTo(x+20, y+10);
    ctx.closePath();
    ctx.fill();
    // cannon
    ctx.fillRect(x-2, y-22, 4, 8);
  }

  function drawAlien(a){
    const t = (a.frame%1);
    const bob = (t<0.5)?0:2;
    const x=a.x, y=a.y+bob, w=a.w, h=a.h;
    ctx.fillStyle = '#9fb8ff';
    ctx.fillRect(x, y+4, w, h-4);
    ctx.clearRect(x+4, y+8, w-8, 4); // mouth
    ctx.fillRect(x+2, y+2, 4, 4); // eyes
    ctx.fillRect(x+w-6, y+2, 4, 4);
  }

  function drawUfo(u){
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(u.x, u.y, u.w, u.h);
    ctx.fillRect(u.x-6, u.y+4, u.w+12, 6);
  }

  // ===== Resize for DPR clarity (keeps logical size) =====
  function fitCanvas(){
    const dpr = window.devicePixelRatio || 1;
    const w = cvs.width, h = cvs.height;
    cvs.style.width = ''; cvs.style.height = '';
    const cssW = Math.min(540, window.innerWidth*0.96);
    const cssH = cssW*4/3;
    cvs.style.width = cssW+'px';
    cvs.style.height = cssH+'px';
    // keep backing store fixed; drawing is in logical pixels
  }
  window.addEventListener('resize', fitCanvas);
  fitCanvas();

})();
