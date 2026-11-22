import type Phaser from 'phaser';
import type { Chapter } from '../types';

export const encounterTips = [
  'Dust falls before the ceiling slab drops. Cross after impact.',
  'Cloud rings mark an updraft. Ride the rising air across the gap.',
  'Amber buds open before thorn vines spread. Jump over their tips.',
  'The searchlight tracks the street. Cross beneath its moving beam.',
  'Sparks mark a lava basin. Wait for the molten surface to recede.',
  'Frost gathers on hanging icicles. Cross after the cascade falls.',
];

const colors = [0xbfa27a, 0xa2efff, 0x94cd63, 0xe7bb67, 0xff7232, 0xa5eaff];

export function encounter(ch: Chapter, time: number) {
  const zone = ch.zoneIndex;
  const pad = ch.platforms[3];
  const gap = ch.platforms[4].x - pad.x - pad.w;
  const x = zone === 1 || zone === 4 ? pad.x + pad.w : pad.x + pad.w * 0.35;
  const w = zone === 1 || zone === 4 ? gap : 56;
  const t = (time + Number(ch.number % 5n) * 0.27) % 5;
  const strength = Math.max(0, Math.min(1, (t - 2) * 3, (4 - t) * 2));
  const y = pad.y;
  let bx = x, by = y, bw = w, bh = 0;
  switch (zone) {
    case 0: by = y - 150 + 132 * strength; bh = 18; break;
    case 1: by = y - 96; bh = 120; break;
    case 2: bh = 40 * strength; by = y - bh; break;
    case 3: bx += Math.sin(time * 1.8) * 42; bw = 18; by = y - 75; bh = 75; break;
    case 4: by = y + 63 - 97 * strength; bh = 580 - by; break;
    case 5: by = y - 134 + 157 * strength; bh = 32; break;
  }
  return {zone, x,y,w,t,strength,bx,by,bw,bh};
}

export function drawEncounter(g: Phaser.GameObjects.Graphics, e: ReturnType<typeof encounter>, cam: number) {
  const x = e.bx - cam, y = e.by, c = colors[e.zone];
  g.fillStyle(c, e.t > 1 && e.t < 2 ? 0.85 : 0.35);
  for (let i = 0; i < 5; i++) g.fillCircle(e.x - cam + (i + 0.5) * e.w / 5, e.y - 4 - (e.t * 12 + i * 7) % 23, 2);
  g.fillStyle(c, 0.9);
  switch(e.zone) {
    case 0: g.fillRect(x,y,e.bw,e.bh); g.lineStyle(2,0x595046); g.lineBetween(x+12,y,x+26,y+18); break;
    case 1: for(let i=0;i<4;i++) g.strokeEllipse(x+e.w/2,y+(i*28+120-e.t*24)%112,e.w*0.75,9).lineStyle(2,c,0.6); break;
    case 2: for(let i=0;i<4;i++) g.fillTriangle(x+i*14,e.y,x+14+i*14,e.y,x+8+i*14,y); break;
    case 3: g.fillStyle(c,e.strength>0?0.7:0.18); g.fillRect(x,y,e.bw,e.bh); g.fillStyle(0x535f65); g.fillRect(x-3,y-6,24,6); break;
    case 4: g.fillStyle(0xc73e16); g.fillRect(x,y,e.w,e.bh); g.fillStyle(0xffc051); g.fillRect(x,y,e.w,5); break;
    case 5: for(let i=0;i<4;i++) g.fillTriangle(x+i*14,y,x+14+i*14,y,x+7+i*14,y+32); break;
  }
}

export function skyline(g: Phaser.GameObjects.Graphics, zone:number, cam:number, width:number, time:number) {
  const offset = (cam * 0.18) % 280;
  for(let x = -280-offset; x < width; x+=280) {
    g.fillStyle(colors[zone], 0.24);
    switch(zone) {
      case 0: g.fillRect(x+35,90,18,145); g.fillRect(x+112,90,20,145); g.fillRect(x+29,80,110,13); break;
      case 1: g.fillEllipse(x+105,135,160,32); g.fillEllipse(x+115,126,84,37); break;
      case 2: g.fillRect(x+88,104,13,120); for(let i=0;i<4;i++) g.fillEllipse(x+58+i*24,97+Math.sin(i)*18,70,41); break;
      case 3: g.fillRect(x+62,83,65,122); g.fillRect(x+133,116,43,99); g.fillStyle(0xffc26d,0.4); for(let i=0;i<4;i++) g.fillRect(x+74+i%2*28,100+Math.floor(i/2)*32,8,12); break;
      case 4: g.fillTriangle(x,224,x+115,93,x+245,224); g.fillStyle(0xff702d,0.6); g.fillTriangle(x+115,93,x+126,105,x+163,172); for(let i=0;i<4;i++) g.fillCircle(x+117+i*6,86-(time*10+i*13)%52,2); break;
      case 5: g.fillTriangle(x,226,x+117,65,x+237,226); g.fillStyle(0xb2ebff,0.55); g.fillTriangle(x+87,107,x+117,65,x+148,107); break;
    }
  }
}
