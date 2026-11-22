'use strict';
const el = id => document.getElementById(id);
const canvas = el('view');
const ctx = canvas.getContext('2d');
const keys = new Set();
const fingers = new Map();
const aimOrigins=new Map();
const bindings = {KeyF:'shoot',KeyC:'nova',KeyA:'left', ArrowLeft:'left', KeyD:'right', ArrowRight:'right',
  KeyX:'dash', Space:'jump', KeyW:'jump', ArrowUp:'jump', ShiftLeft:'field', ShiftRight:'field'};
const held = action => [...keys].some(key => bindings[key] === action) || [...fingers.values()].includes(action);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
function read(key, fallback) {
  try { return localStorage.getItem('faultline.' + key) ?? fallback; } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem('faultline.' + key, value); } catch { /* Private browsing can disable storage. */ }
}
const storedChapter = String(read('chapter', '1'));
let number = /^[1-9][0-9]*$/.test(storedChapter) ? BigInt(storedChapter) : 1n;
let highest = BigInt(read('highest', number.toString()) .match(/^[1-9][0-9]*$/)?.[0] ?? number);
if (highest < number) highest = number;
let segment = 0n;
let nextDelay = 0, musicBeat = -1, sceneFlash = 0, secret = false;
const shield = new TimedShield();
let creatures = [];
function menu() {
  status = 'intro';
  keys.clear(); fingers.clear();
  el('selector').hidden = false;
  el('pick').value = String(number);
  el('firstLevel').onclick = () => { el('pick').value='1'; el('start').onclick(); };
  el('unlocked').textContent = 'Unlocked through level ' + highest;
  dialog('DESCENT PROTOCOL', 'FAULTLINE', 'Choose your route. Shoot wildlife or jump clear. Tap Shield for three seconds of protection. Reach the lit bulkhead to descend.', 'Play level');
}
el('menu').onclick = menu;
let chapter, checkpoint, player, time, camera, charge, jumpBuffer, coyote, deaths, section;
let elapsed = 0, launchSurface, noticeTime = 0;
let particles = [], status = 'intro', phase = 0, field = false, accumulator = 0;
let previousFrame = 0, width = 900, height = 470, audio;
let muted = read('muted', 'false') === 'true';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

function tone(from, to, duration, kind = 'triangle', volume = .06) {
  if (!audio || muted) return;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const start = audio.currentTime;
  oscillator.type = kind;
  oscillator.frequency.setValueAtTime(from, start);
  oscillator.frequency.exponentialRampToValueAtTime(to, start + duration);
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(.001, start + duration);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + duration);
}
function enableAudio() {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (Audio && !muted) {
    audio ??= new Audio();
    audio.resume().catch(() => {});
  }
}
function updateSound() {
  el('sound').textContent = muted ? 'Sound off' : 'Sound on';
  el('sound').setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
}
el('sound').onclick = () => { muted = !muted; save('muted', muted); updateSound(); enableAudio(); };
updateSound();

function chapterLabel(n) { return String(n).padStart(3, '0'); }
function saveCheckpoint() {
  save('checkpoint-v2', number + ':' + checkpoint.x + ':' + deaths);
}
function showSection() {
  el('section').textContent = 'SECTOR ' + section + ' / 3' + (chapter.segments > 1n ? ' · ROUTE ' + (segment+1n) + '/' + chapter.segments : '');
}
function notifyPlayer(message) {
  el('notice').textContent = message;
  noticeTime = 1.8;
}
function loadChapter() {
  const savedSegment = String(read('route-segment','')).split(':');
  segment = savedSegment[0] === String(number) && /^[0-9]+$/.test(savedSegment[1]) ? BigInt(savedSegment[1]) : 0n;
  chapter = makeChapter(number,segment);
  secret = false; sceneFlash = 1; musicBeat = -1;
  creatures = chapter.platforms.flatMap((p,i) => {
    if (p.checkpoint || i < 3 || i >= chapter.platforms.length-1 || (i-3)%6) return [];
    const kind = ['kite','adder','hound'][(Math.floor(i/6)+chapter.zoneIndex)%3];
    return [{kind,home:p.x+p.w*.65,floor:p.y,age:0,dead:false,x:0,y:0}];
  });
  expedition.setup();
  el('nova').hidden=highest<4n;
  deaths = 0;
  elapsed = 0;
  checkpoint = chapter.platforms[0];
  const [savedLevel, savedX, retries] = String(read('checkpoint-v2', '')).split(':');
  if (savedLevel === String(number)) {
    checkpoint = chapter.platforms.find(p => p.checkpoint && p.x === Number(savedX)) ?? checkpoint;
    deaths = Number.isSafeInteger(Number(retries)) && Number(retries) >= 0 ? Number(retries) : 0;
  }
  el('chapter').textContent = 'EPISODE ' + chapterLabel(chapter.episode) + ' · ' + chapter.episodeTitle +
    ' / CHAPTER ' + (chapter.zoneIndex + 1) + ' · ' + expedition.world + ' / ' + chapter.name;
  el('title').textContent = chapter.title;
  el('story').textContent = chapter.story;
  el('deaths').textContent = String(deaths).padStart(2, '0');
  el('travel').value = 0;
  el('notice').textContent = '';
  respawn();
}
function respawn() {
  player = {x: checkpoint.x + (checkpoint.checkpoint ? 42 : 115), y: checkpoint.y - 32,
    vx:0, vy:0, ground:checkpoint, facing:1};
  for (const platform of chapter.platforms) platform.crack = 0;
  for (const hazard of chapter.hazards) hazard.armedAt = undefined;
  time = 0;
  for (const c of creatures) {c.age=0; c.dead=false; c.x=c.home; c.y=c.floor-(c.kind==='kite'?82:9);}
  expedition.reset();
  shield.reset(held('field'));
  charge = 1;
  field = false;
  coyote = .09;
  launchSurface = checkpoint;
  jumpBuffer = 0;
  section = checkpoint.section;
  showSection();
  camera = Math.max(0, player.x - width * .3);
}
function dialog(label, title, message, button) {
  el('eyebrow').textContent = label;
  el('headline').textContent = title;
  el('message').textContent = message;
  el('start').firstChild.textContent = button + ' ';
  el('overlay').hidden = false;
  el('start').focus({preventScroll:true});
}
el('start').onclick = () => {
  enableAudio();
  if (status === 'dead') respawn();
  if (status === 'intro') {
    const value = String(el('pick').value || number).trim();
    if (!/^[1-9][0-9]*$/.test(value) || BigInt(value)>highest) {
      el('unlocked').textContent = 'Choose level 1 through ' + highest; return;
    }
    number=BigInt(value); save('chapter',number); loadChapter();
  }
  el('selector').hidden = true;
  if (status === 'clear') {
    save('route-segment','');
    number++;
    save('chapter', number);
    loadChapter();
    if (chapter.level===1) {
      status='briefing';
      dialog('CHAPTER '+(chapter.zoneIndex+1),expedition.world,chapter.story,'Enter world');
      return;
    }
  }
  status = 'playing';
  el('overlay').hidden = true;
  el('pause').textContent = 'Pause';
  el('start').blur();
};
if (number > 1n) el('start').firstChild.textContent = 'Resume descent ';
function pause() {
  if (status === 'paused') { el('start').click(); return; }
  if (status !== 'playing') return;
  status = 'paused';
  keys.clear();
  fingers.clear();
  el('pause').textContent = 'Resume';
  dialog('CHAPTER ' + chapterLabel(number), 'Paused', chapter.title, 'Resume');
}
el('pause').onclick = pause;
window.addEventListener('keydown', event => {
  if (event.code === 'KeyX' && !event.repeat) dash();
  if (event.code === 'Escape' && !event.repeat) { pause(); return; }
  if (!bindings[event.code] || status !== 'playing') return;
  if (event.code === 'Space' && event.target instanceof HTMLButtonElement) return;
  event.preventDefault();
  keys.add(event.code);
  if (!event.repeat && bindings[event.code] === 'jump') jumpBuffer = .13;
});
window.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', () => { if (status === 'playing') pause(); });
for (const button of document.querySelectorAll('[data-action]')) {
  button.addEventListener('pointermove', event => {
    const origin=aimOrigins.get(event.pointerId);
    if(!origin)return;
    const dx=event.clientX-origin.x,dy=event.clientY-origin.y;
    expedition.aim=Math.hypot(dx,dy)>10?Math.atan2(dy,dx):null;
  });
  button.addEventListener('pointerdown', event => {
    if (status !== 'playing') return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    if(button.dataset.action==='shoot')aimOrigins.set(event.pointerId,{x:event.clientX,y:event.clientY});
    fingers.set(event.pointerId, button.dataset.action);
    if (button.dataset.action === 'dash') dash();
    if (button.dataset.action === 'jump') jumpBuffer = .13;
  });
  for (const type of ['pointerup','pointercancel','lostpointercapture']) {
    button.addEventListener(type, event => {fingers.delete(event.pointerId);if(aimOrigins.delete(event.pointerId))expedition.aim=null;});
  }
}

function burst(x, y, color, count) {
  if (reduced) return;
  for (let i = 0; i < count && particles.length < 150; i++) {
    particles.push({x,y,color,vx:(Math.random()-.5)*290,vy:-Math.random()*235,life:.22+Math.random()*.45});
  }
}
function fail() {
  if(status!=='playing')return;
  status='dead';
  deaths++;
  saveCheckpoint();
  el('deaths').textContent = String(deaths).padStart(2, '0');
  burst(player.x + 10, Math.min(player.y + 14, 404), '#ff965c', 28);
  tone(110, 39, .27, 'sawtooth');
  keys.clear(); fingers.clear(); aimOrigins.clear(); expedition.aim=null;
  dialog('SIGNAL LOST','Try again', checkpoint.checkpoint ? 'Checkpoint secured.' : 'Restart at the entry platform.', 'Retry');
}
function hazardState(hazard) {
  const ram = (hazard.kind === 'ram' || hazard.kind === 'snare');
  const sweep = hazard.kind === 'sweep';
  const cycle = ram ? time - (hazard.armedAt ?? Infinity) : (time + hazard.offset) % 2.55 - .62;
  const warning = cycle >= 0 && cycle < hazard.warningTime;
  const danger = cycle >= hazard.warningTime && cycle < hazard.warningTime + hazard.activeTime;
  const shift = sweep ? 56 : hazard.kind === 'arc' ? 34 : 0;
  const x = hazard.x + Math.sin((time + hazard.offset) * 3) * shift;
  const height = ram ? 115 : sweep ? 90 : hazard.kind === 'vent' ? 74 : 38;
  return {x, height, danger, warning, w:ram ? 31 : sweep ? 13 : 25};
}
function dash() {
  if (status !== 'playing' || player.ground || player.dashUsed) return;
  player.dashUsed = true;
  player.dashTime = .14;
  burst(player.x + 10, player.y + 16, '#89ffe6', 14);
  tone(390, 110, .14);
}
function step(dt) {
  phase += dt;
  for (const particle of particles) {
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 430 * dt;
  }
  particles = particles.filter(particle => particle.life > 0);
  if (status === 'clear') return;
  if (status !== 'playing') return;
  const wasField=field;
  shield.update(dt,held('field'));
  field=shield.active;
  charge=field?shield.duration/3:1-shield.cooldown/20;
  if(field!==wasField)tone(field?115:320,field?410:95,.18);
  if(expedition.tick(dt))return;
  sceneFlash=Math.max(0,sceneFlash-dt*1.6);
  elapsed += dt;
  const beat=Math.floor(elapsed/.48);
  if (beat!==musicBeat) {
    musicBeat=beat;
    const scores=[[98,147,185,123,98,165,147,110],[196,247,294,370,294,247,220,294],[110,165,110,196,147,110,165,131],[82,87,110,82,98,87,73,82],[123,185,123,246,164,123,185,207],[98,196,233,147,196,131,164,196]];
    const note=scores[chapter.zoneIndex][beat%8]*(1+chapter.zoneIndex*.04);
    tone(note,note*.99,.34,'sine',.018);
    if (beat%8===0) tone(49,36,.75,'triangle',.016);
  }
  if (noticeTime > 0 && (noticeTime -= dt) <= 0) el('notice').textContent = '';
  if (!field) time += dt;
  if (player.ground?.mechanic === 'phase' && !field) player.ground = null;
  if (player.ground) launchSurface = player.ground;
  jumpBuffer -= dt;
  coyote = player.ground ? .09 : coyote - dt;
  const direction = Number(held('right')) - Number(held('left'));
  if (direction) player.facing = direction;
  const target = direction * 315;
  const belt = !field && player.ground?.mechanic === 'belt' ? -65 : 0;
  player.vx += clamp(target + belt - player.vx, -dt * 2600, dt * 2600);
  if (jumpBuffer > 0 && coyote > 0) {
    const boosted = launchSurface?.mechanic === 'spring';
    player.vy = boosted ? -620 : -469;
    player.ground = null;
    jumpBuffer = coyote = 0;
    burst(player.x + 10, player.y + 32, '#b1c7c7', 8);
    tone(170, boosted ? 530 : 274, .14);
  }
  if (player.dashTime > 0) {
    player.dashTime -= dt;
    player.vx = player.facing * 570;
    player.vy = 0;
  }
  const oldBottom = player.y + 32;
  player.x = Math.max(-5, player.x + player.vx * dt);
  if(chapter.zoneIndex===1 && !player.ground) {
    player.x+=Math.sin(time*1.4)*18*dt;
    if(held('jump') && player.vy>86)player.vy=86;
  }
  player.vy += 1090 * dt;
  player.y += player.vy * dt;
  const priorGround = player.ground;
  player.ground = null;
  for (const platform of [...chapter.platforms,...expedition.ledges]) {
    if (platform.crack >= .43 || platform.mechanic === 'phase' && !field) continue;
    if (player.vy >= 0 && player.x + 20 > platform.x && player.x < platform.x + platform.w &&
        oldBottom <= platform.y && player.y + 32 >= platform.y) {
      if(!priorGround && launchSurface && platform.y-launchSurface.y>55) burst(player.x+10,platform.y,'#abbbb8',12);
      player.y = platform.y - 32;
      player.vy = 0;
      player.ground = platform;
      player.dashUsed = false;
      player.dashTime = 0;
      if (!priorGround) tone(90, 53, .09, 'triangle', .037);
      if (platform.checkpoint && platform.x > checkpoint.x) {
        checkpoint = platform;
        if(section !== platform.section) sceneFlash=1;
        section = platform.section;
        showSection();
        saveCheckpoint();
        notifyPlayer('Checkpoint secured');
        tone(280, 690, .24);
      }
      if (platform.fragile && !field) {
        platform.crack += dt;
        if (platform.crack >= .43) {
          player.ground = null;
          burst(player.x + 10, platform.y, '#c4794e', 22);
          tone(85, 37, .2, 'sawtooth');
        }
      }
      break;
    }
  }
  if (!field) for (const hazard of chapter.hazards) {
    if ((hazard.kind === 'ram' || hazard.kind === 'snare') && hazard.armedAt === undefined &&
        Math.abs(player.x + 10 - hazard.x) < 85) hazard.armedAt = time;
    const {x, height, danger, w} = hazardState(hazard);
    if (danger && player.x < x + w && player.x + 20 > x - w &&
      player.y + 31 > hazard.y - height && player.y < hazard.y && expedition.hurt()) return;
  }
  const gate=chapter.platforms[3];
  if (!secret && Math.abs(player.x-gate.x-60)<70 && player.y < gate.y-82) {
    secret=true; sceneFlash=1; expedition.ammo=12; notifyPlayer('Hidden passage · magazine restored'); tone(380,800,.4);
  }
  for (const c of creatures) {
    if (c.dead || Math.abs(c.home-player.x)>300) continue;
    if (!field) {
      c.age+=dt;
      const lunge=Math.max(0,Math.sin(c.age*4));
      const reach=c.kind==='adder'?45:95;
      const target=c.home+clamp(player.x-c.home,-reach,reach)*lunge;
      c.x+=(target-c.x)*Math.min(1,dt*(c.kind==='hound'?14:6));
      c.y=c.floor-(c.kind==='kite'?74-50*lunge+8*Math.sin(c.age*7):c.kind==='hound'?13:7);
    }
    if (Math.abs(player.x+10-c.x)<19 && Math.abs(player.y+18-c.y)<18) {
      if (field) {c.dead=true; expedition.kills++; burst(c.x,c.y,'#f4b675',14); tone(230,80,.12);}
      else if(expedition.hurt())return;
    }
  }
  if (player.y > 470) { fail(); return; }
  if (player.x + 20 >= chapter.exit && player.ground === chapter.platforms.at(-1)) {
    if (segment+1n < chapter.segments) {
      save('route-segment',number + ':' + (segment+1n));
      save('checkpoint-v2','');
      const priorTime=elapsed, priorDeaths=deaths;
      loadChapter(); elapsed=priorTime; deaths=priorDeaths;
      el('deaths').textContent=String(deaths).padStart(2,'0');
      saveCheckpoint(); notifyPlayer('New route opened'); return;
    }
    if(expedition.warden && expedition.warden.hp>0){notifyPlayer('Defeat the Gate Warden to open the exit');return;}
    status = 'clear'; keys.clear(); fingers.clear();
    if (number>=highest) {highest=number+1n;save('highest',highest);}
    save('chapter', number + 1n);
    tone(280, 750, .38);
    const next = makeChapter(number + 1n);
    const milestone = next.episode !== chapter.episode ? 'EPISODE COMPLETE' :
      next.zoneIndex !== chapter.zoneIndex ? 'CHAPTER COMPLETE' : 'LEVEL COMPLETE';
    dialog(milestone, 'Level completed',
      Math.floor(elapsed) + 's · ' + deaths + ' retries · '+expedition.kills+' defeated · Unlocked '+next.title, next.zoneIndex!==chapter.zoneIndex?'Enter next chapter':'Next level');
  }
  camera += (Math.max(0, player.x - width * .31) - camera) * Math.min(1, dt * 8);
}

function rect(x,y,w,h,color) { ctx.fillStyle = color; ctx.fillRect(x,y,w,h); }
function poly(color, points) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (const point of points.slice(1)) ctx.lineTo(...point);
  ctx.closePath();
  ctx.fill();
}
function drawBackground() {
  const hue = (chapter.color + (section-1)*22 + (secret?95:0))%360;
  const gradient = ctx.createLinearGradient(0,0,0,420);
  gradient.addColorStop(0,'#090f16');
  gradient.addColorStop(.62,'hsl(' + hue + ' 30% 17%)');
  gradient.addColorStop(1,'#080e16');
  rect(0,0,width,420,gradient);
  drawScenery(hue);
  for (let layer = 0; layer < 3; layer++) {
    const interval = 180 - layer * 14;
    const offset = (camera * (.10 + layer * .16)) % interval;
    for (let i = -1; i < width / interval + 2; i++) {
      const x = i * interval - offset + layer * 45;
      const top = 55 + (i + 12) % 3 * 28;
      const dark = 'hsl(' + hue + ' ' + (30 - layer * 3) + '% ' + (19 - layer * 4) + '%)';
      poly(dark,[[x,420],[x,top+93],[x+60,top],[x+76,top],[x+76,420]]);
      rect(x+9,top+101,4,252,'#26343e');
      if (layer === 1) rect(x+32,top+72,15,3,i%3===0?'#b17c51':'#51616a');
    }
  }
  for (let y = 59; y < 397; y += 76) {
    rect(0,y,width,1,'#25323d');
    rect(0,y+2,width,3,'#101a22');
  }
  const light = ctx.createRadialGradient(width*.74,138,3,width*.74,138,180);
  light.addColorStop(0,'rgba(155,215,213,.19)');
  light.addColorStop(1,'rgba(155,215,213,0)');
  rect(0,0,width,420,light);
  if (!reduced) for (let i = 0; i < 42; i++) {
    const x = ((i * 193 + phase * (5 + i % 4) - camera * .1) % width + width) % width;
    rect(x, (i * 59 + phase * 4) % 390, i % 3 + 1, 1, i % 5 === 0 ? '#a27655' : '#495a61');
  }
}
function drawScenery(hue) {
  const style = (chapter.zoneIndex+section-1+(secret?3:0))%6;
  const color = 'hsla(' + hue + ',67%,65%,.26)';
  const shadow = 'hsla(' + hue + ',38%,9%,.78)';
  const stride = 190;
  for(let i=-1;i<width/stride+2;i++){
    const x=i*stride-camera*.14%stride;
    if(chapter.zoneIndex===1) {
      for(let j=0;j<5;j++){ctx.fillStyle='rgba(172,211,233,.22)';ctx.beginPath();ctx.ellipse(x+j*18,142+Math.sin(j)*10,37,14,0,0,Math.PI*2);ctx.fill();}
    } else if(chapter.zoneIndex===2) {
      for(let j=0;j<4;j++)poly('#315e47',[[x+j*32,235],[x+20+j*32,54+j*12],[x+46+j*32,235]]);
    } else if(chapter.zoneIndex===3) {
      rect(x,86,68,213,'#3c3744');rect(x+74,136,52,161,'#393643');
      for(let j=0;j<12;j++)rect(x+9+j%3*17,103+Math.floor(j/3)*23,7,11,j%4?'#222637':'#d1a26b');
    }
  }
  for (let i = -1; i < width / stride + 1; i++) {
    const x = i * stride - camera * .07 % stride;
    if (style === 0 || style === 5) {
      poly(shadow, [[x,0],[x+130,0],[x+81,73],[x+106,116],[x+61,98],[x+22,170],[x-17,146]]);
      poly(color, [[x+61,0],[x+81,73],[x+106,116],[x+81,89],[x+73,70]]);
    } else if (style === 1 || style === 4) {
      rect(x+25,12,100,20,shadow);
      rect(x+64,32,7,96,color);
      rect(x+48,128,40,49,shadow);
      rect(x+48,174,40,3,color);
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = style === 2 ? 2 : 7;
      ctx.beginPath();
      ctx.arc(x+86,123,53,0,Math.PI*2);
      ctx.stroke();
      rect(x+80,0,12,71,shadow);
      rect(x+80,175,12,92,shadow);
      rect(x+65,121,43,3,color);
    }
  }
}
function drawPlatform(p) {
  if (p.crack >= .43) return;
  const {x,y,w} = p;
  if (p.mechanic === 'phase' && !field) {
    rect(x,y,w,2,'#d2a6ff');
    for (let i = x; i < x+w-8; i += 15) rect(i,y+5,8,3,'#8e71af');
    return;
  }
  poly('#25323b',[[x,y],[x+w,y],[x+w-15,y+24],[x+12,y+24]]);
  const edge = {fracture:'#ac7550',phase:'#cb9dff',spring:'#79cbff',belt:'#efc272'};
  rect(x,y,w,5,edge[p.mechanic] ?? '#87959a');
  rect(x+9,y+8,w-18,5,'#42505b');
  for (let i = x+17; i < x+w-10; i += 24) rect(i,y+10,3,3,'#111a22');
  poly('#17212a',[[x+16,y+24],[x+42,y+24],[x+24,420],[x+13,420]]);
  if (p.fragile) for (let i = x+22; i < x+w-12; i += 25) {
    poly(p.crack > 0?'#ff9f59':'#694d41',[[i,y],[i+5,y],[i-1,y+15],[i-4,y+15]]);
  }
  if (p.mechanic === 'spring' || p.mechanic === 'belt') {
    const offset = p.mechanic === 'belt' && !field ? 25 - time * 65 % 25 : 0;
    for (let i = x+11+offset; i < x+w-15; i += 25) {
      const points = p.mechanic === 'spring' ? [[i,y+14],[i+6,y+7],[i+12,y+14],[i+6,y+11]] :
        [[i,y+10],[i+8,y+6],[i+10,y+8],[i+6,y+10],[i+10,y+12],[i+8,y+14]];
      poly(edge[p.mechanic], points);
    }
  }
  if (p.checkpoint) {
    rect(x+40,y-29,3,29,'#557c7f');
    rect(x+40,y-32,13,8,p===checkpoint?'#b9fff0':'#617a83');
  }
}
function drawHazard(hazard) {
  const {x,height,danger,warning,w} = hazardState(hazard);
  const y = hazard.y;
  if (hazard.kind==='snare' && !warning && !danger) return;
  const signal = field ? '#80e9db' : danger ? '#ff6042' : warning ? '#ffc077' : '#77543e';
  rect(x-w-3,y-3,w*2+6,3,signal);
  if ((hazard.kind === 'ram' || hazard.kind === 'snare')) {
    const bottom = danger ? y : y-116;
    rect(x-7,45,14,Math.max(0,bottom-53),'#64727a');
    rect(x-w,bottom-17,w*2,17,'#434f56');
    rect(x-w,bottom-4,w*2,4,signal);
    if (warning) rect(x-w,y-height,w*2,height,'rgba(255,181,101,.13)');
  } else if (hazard.kind === 'sweep') {
    rect(x-12,y-5,24,5,signal);
    if (danger || warning) {
      rect(x-2,y-height,4,height,signal);
      if (danger) rect(x-8,y-height,16,height,'rgba(255,110,75,.3)');
    }
  } else if (danger || warning) {
    ctx.globalAlpha = danger ? .8 : .28;
    for (let i = -3; i <= 3; i++) {
      const bend = Math.sin(phase*11+i)*9;
      poly(signal,[[x+i*7-5,y],[x+i*7+3,y-height*.28],[x+i*5+bend,y-height],[x+i*7+7,y]]);
    }
    ctx.globalAlpha = 1;
  }
}
function drawPlayer() {
  const walk = player.ground ? Math.sin(phase * 18) * Math.abs(player.vx)/315 : -.5;
  ctx.save();
  ctx.translate(player.x+10, player.y);
  ctx.scale(player.facing,1);
  if (field) {
    ctx.strokeStyle = '#84f2df';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0,14,42+3*Math.sin(phase*12),0,Math.PI*2);ctx.stroke();
  }
  rect(-11,12,6,12,'#815340');
  poly('#b56849',[[-6,10],[6,9],[9,20],[5,24],[-7,23],[-8,15]]);
  rect(-6,23,5,8+walk*2,'#b7a79b');
  rect(2,23,5,8-walk*2,'#dcc7a6');
  rect(-7+walk*3,29,8,3,'#53545a');
  rect(3-walk*3,29,8,3,'#68656a');
  poly('#e0c4ad',[[-6,3],[-2,0],[6,0],[9,4],[8,11],[-5,10]]);
  rect(0,4,9,3,'#a5f2df');
  rect(3,14,7,8,'#e6aa75');
  rect(expedition.recoil>0?5:8,13,13,4,'#a2c6d3');
  if(expedition.recoil>.055)poly('#fff4b1',[[17,11],[28,15],[17,18]]);

  ctx.restore();
}
function paint() {
  const scale = canvas.height / height;
  ctx.setTransform(scale,0,0,scale,0,0);
  drawBackground();
  ctx.save();
  ctx.translate(-camera + (!reduced && expedition.shake>0 ? Math.sin(phase*90)*2 : 0),0);
  expedition.draw();
  for (const platform of chapter.platforms) {
    if (platform.x + platform.w > camera && platform.x < camera + width) drawPlatform(platform);
  }
  const last = chapter.platforms.at(-1);
  rect(chapter.exit,last.y-56,49,56,'#23383e');
  rect(chapter.exit+5,last.y-50,38,50,'#112529');
  rect(chapter.exit+23,last.y-46,4,42,'#9aeedb');
  rect(chapter.exit+4,last.y-55,41,3,'#9aeedb');
  for (const hazard of chapter.hazards) {
    if (hazard.x > camera-80 && hazard.x < camera+width+80) drawHazard(hazard);
  }
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life*3,0,1);
    rect(p.x,p.y,3,3,p.color);
  }
  ctx.globalAlpha = 1;
  for(const c of creatures) {
    if(c.dead || Math.abs(c.x-camera-width/2)>width/2+30) continue;
    ctx.save();ctx.translate(c.x,c.y);ctx.scale(player.x<c.x?-1:1,1);
    const wing=Math.sin(phase*12)*8;
    if(c.kind==='kite') poly('#db966e',[[-20,-8-wing],[-4,-3],[3,-6],[20,-10+wing],[8,0],[1,6],[-7,3]]);
    else if(c.kind==='adder') poly('#90bc78',[[-22,5],[-14,-2],[-4,1],[5,-9],[12,-9],[16,-4],[6,-3],[0,6],[-12,4]]);
    else poly('#c79179',[[-22,-12],[-10,-7],[6,-7],[10,-16],[15,-8],[20,-5],[12,0],[8,11],[5,0],[-6,1],[-13,10],[-10,-2]]);
    rect(7,-5,3,2,'#ffe2ad');ctx.restore();
  }
  const gate=chapter.platforms[3];
  if (!secret) rect(gate.x+58,gate.y-90,5,5,'#83ffe5');
  if(status!=='dead')drawPlayer();
  ctx.restore();
  if(sceneFlash>0 && !reduced) rect(0,0,width,height,'rgba(127,218,211,'+sceneFlash*.18+')');
  el('shieldState').textContent=field?'Protected '+shield.duration.toFixed(1)+'s':shield.cooldown>0?'Recharge '+Math.ceil(shield.cooldown)+'s':'Shield ready';
  el('vitals').textContent=expedition.guns[expedition.gun].name+' '+expedition.ammo+'/12';
  el('energy').value = charge;
  el('travel').value = clamp(player.x / chapter.exit, 0, 1);
}
function resize() {
  const ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(canvas.clientWidth * ratio));
  canvas.height = Math.max(1, Math.round(canvas.clientHeight * ratio));
  height = canvas.clientWidth < 600 ? 385 : 420;
  width = canvas.width * height / canvas.height;
}
function frame(now) {
  accumulator += Math.min(.065, (now - (previousFrame || now)) / 1000);
  previousFrame = now;
  while (accumulator >= 1/120) {
    step(1/120);
    accumulator -= 1/120;
  }
  paint();
  requestAnimationFrame(frame);
}
loadChapter();
menu();
new ResizeObserver(resize).observe(canvas);
resize();
requestAnimationFrame(frame);


