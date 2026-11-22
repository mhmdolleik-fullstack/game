const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { makeChapter } = require('../dist/chapters.js');

let lastLength = 0;
for (let number = 1; number <= 10000; number++) {
  const stage = makeChapter(number);
  assert.notEqual(stage.title, makeChapter(number + 1).title);
  assert.ok(stage.exit > stage.platforms.at(-1).x);
  if (number <= 25) assert.ok(stage.platforms.length > lastLength);
  lastLength = stage.platforms.length;
  assert.deepEqual([...new Set(stage.platforms.filter((p,i) => i === 0 || p.checkpoint).map(p => p.section))], [1,2,3]);
  for (let index = 1; index < stage.platforms.length; index++) {
    const previous = stage.platforms[index - 1];
    const current = stage.platforms[index];
    const gap = current.x - previous.x - previous.w;
    const impulse = previous.mechanic === 'spring' ? 620 : 469;
    const landingTime = (impulse + Math.sqrt(impulse ** 2 - 2180 * (previous.y - current.y))) / 1090;
    assert.ok(315 * landingTime > gap + 40, 'Jump must leave room for takeoff and landing');
    assert.ok(previous.mechanic !== 'phase' || current.mechanic !== 'phase');
  }
}
assert.match(makeChapter(10n ** 50n).title, /100000000000000000000000000000000000000000000000000/);

const nodes = new Map();
const store = new Map();
const context = vm.createContext({
  makeChapter,
  document: {
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, {
        getContext: () => ({}), setAttribute() {}, focus() {}, blur() {},
        clientWidth: 960, clientHeight: 500, firstChild: {}
      });
      return nodes.get(id);
    },
    querySelectorAll: () => []
  },
  window: { addEventListener() {} },
  localStorage: {getItem: key => store.get(key), setItem: (key, value) => store.set(key, String(value))},
  matchMedia: () => ({matches: true}),
  ResizeObserver: class {observe() {}},
  requestAnimationFrame() {},
  devicePixelRatio: 1
});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/survival.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist/combat.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist/game.js'), 'utf8'), context);
const run = code => vm.runInContext(code, context);
run("el('start').onclick(); keys.add('KeyD'); keys.add('KeyF')");
for (let index = 0; index < 4000 && run("status === 'playing'"); index++) {
  run(`if (player.ground && player.ground !== chapter.platforms.at(-1) &&
    player.x + 18 >= player.ground.x + player.ground.w - 83) jumpBuffer = .13;
    if (creatures.some(c => !c.dead && Math.abs(c.x-player.x-10)<75) || chapter.hazards.some(h => Math.abs(h.x - player.x - 10) < 72 && hazardState(h).danger) ||
      player.ground?.fragile && player.ground.crack > .23) keys.add('ShiftLeft');
    else keys.delete('ShiftLeft');
    step(1/120);`);
}
assert.equal(run('status'), 'clear');
assert.equal(store.get('faultline.chapter'), '2');
run("for (let i=0;i<152;i++) step(1/120); keys.clear()");
assert.equal(run('number'), 1n);
run("el('start').onclick()");
assert.equal(run('number'), 2n);
run(`number = 21n; loadChapter();
  const press = chapter.hazards.find(h => h.kind === 'ram');
  press.armedAt = 0;
  time = press.warningTime + .06;
  player.x = press.x;
  player.y = press.y - 32;
  player.ground = null;
  keys.add('ShiftLeft');
  step(1/120);`);
assert.equal(run('deaths'), 0);
assert.equal(run('shield.active'),true);
run("keys.clear(); shield.update(3,false); step(1/120)");
assert.equal(run('status'),'dead');
assert.equal(run('deaths'),1);
run("el('start').onclick()");
assert.equal(run('status'),'playing');
run(`number = 41n; loadChapter();
  const bridge = chapter.platforms.find(p => p.mechanic === 'phase');
  player = {x:bridge.x + 40,y:bridge.y - 33,vx:0,vy:200,facing:1};
  step(1/120);`);
assert.equal(run('player.ground'), null);
run(`player.y = bridge.y - 33; keys.add('ShiftLeft'); step(1/120);`);
assert.equal(run('player.ground === bridge'), true);
run(`keys.clear(); number = 61n; loadChapter();
  launchSurface = player.ground = chapter.platforms.find(p => p.mechanic === 'spring');
  jumpBuffer = .13; step(1/120);`);
assert.ok(run('player.vy < -600'));
run('dash(); step(1/120)');
assert.equal(run('player.dashUsed'), true);
assert.ok(run('player.vx > 500'));
run('player.dashTime = 0; dash()');
assert.equal(run('player.dashTime'), 0);
assert.ok(makeChapter(64).platforms.length > makeChapter(25).platforms.length);
run(`checkpoint = chapter.platforms.find(p => p.checkpoint && p.section === 2);
  saveCheckpoint(); loadChapter();`);
assert.equal(run('section'), 2);
assert.equal(run('player.ground === checkpoint'), true);
assert.equal(makeChapter(121).episode, 2n);
console.log('10,000 generated routes, first level, chapter mechanics and checkpoint persistence passed.');






run(`number=61n; loadChapter(); keys.clear(); keys.add('KeyF');
  const dummy=expedition.hostiles[0];
  player.x=dummy.home-85; player.y=dummy.floor-28; player.facing=1;
  for(let i=0;i<120;i++)expedition.tick(1/120);`);
assert.ok(run('expedition.shots>0 && dummy.hp<dummy.strength'));
assert.ok(run('expedition.hostiles.some(e=>e.waveDelay!==undefined)'));
for(let n=1;n<80;n++){
  run('number='+n+'n; loadChapter()');
  assert.ok(run('Number.isFinite(expedition.trap.x) && expedition.trap.age===-1'));
}
console.log('Shooting, zombie waves and guaranteed secret encounters passed.');

run(`const timer=new TimedShield(); timer.update(0,true); timer.update(2.99,true)`);
assert.equal(run('timer.active'),true);
run('timer.update(.02,true)');
assert.equal(run('timer.active'),false);
assert.ok(run('timer.cooldown>19.98'));
run('timer.update(21,true)');
assert.equal(run('timer.active'),false);
run('timer.update(0,false); timer.update(0,true)');
assert.equal(run('timer.active'),true);
run("number=20n;loadChapter();status='playing';keys.clear();player.ground=chapter.platforms.at(-1);player.x=chapter.exit;player.y=player.ground.y-32;step(1/120)");
assert.equal(run('status'),'playing');
run('expedition.hit(expedition.warden,12);step(1/120)');
assert.equal(run('status'),'clear');
run("el('start').onclick()");
assert.equal(run('status'),'briefing');
run("el('start').onclick();keys.add('ShiftLeft');player.y=490;player.ground=null;step(1/120)");
assert.equal(run('status'),'dead');
console.log('Shield timing, held-input lockout, boss exit, chapter briefing and lethal pit passed.');
run("number=61n;loadChapter();status='playing';keys.clear();const walker=expedition.hostiles[0];walker.x=player.x+10;walker.home=walker.x;walker.floor=player.y+27;walker.y=player.y+15;walker.left=walker.x;walker.right=walker.x;step(1/120)");
assert.equal(run('status'),'dead');
run("el('start').onclick();player.dashTime=.14;expedition.bolts.push({x:player.x+10,y:player.y+15,vx:2,vy:0,enemy:true,t:1});step(1/120)");
assert.equal(run('status'),'dead');
run("el('start').onclick();keys.add('ShiftLeft');expedition.bolts.push({x:player.x+10,y:player.y+15,vx:2,vy:0,enemy:true,t:1});step(1/120)");
assert.equal(run('status'),'playing');
console.log('Enemy contact, projectile contact while dashing, and shield activation on impact passed.');
