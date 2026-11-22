'use strict';
const expedition = {
  worlds: ['Hidden Trap World','Sky Warfare','Wild Animal Survival','Zombie Apocalypse','Mechanical Nightmare','Rift Frontier'],
  populations: [['adder','hound','kite'],['kite','drone','raptor'],['adder','hound','stalker'],['walker','runner','burrower'],['turret','drone','sentinel'],['raptor','sentinel','burrower']],
  guns: [
    {name:'Pulse',cooldown:.28,speed:560,damage:1,color:'#9fffe6'},
    {name:'Twin arc',cooldown:.21,speed:620,damage:1,color:'#cda8ff'},
    {name:'Flux lance',cooldown:.43,speed:780,damage:3,color:'#ffca7d'}
  ],
  setup() {
    const z=chapter.zoneIndex;
    const modifiers=['Ashfall','Moonlit','Overgrown','Flooded','Obsidian','Stormbound','Frozen'];
    this.world=chapter.episode===1n?this.worlds[z]:modifiers[Number((chapter.episode+BigInt(z))%7n)]+' '+this.worlds[z]+' / '+chapter.episode;
    this.aim=null;
    this.tier=highest>=10n?2:highest>=4n?1:0;
    this.gun=this.tier;
    this.kills=0;
    this.shots=0;
    this.sceneTimer=0;
    this.hostiles=[];
    this.ledges=[];
    const route=chapter.platforms;
    const options=route.slice(2,-1).filter(p=>!p.checkpoint);
    const site=options[Number((number*17n+segment*13n)%BigInt(options.length))];
    this.trap={x:site.x+site.w*(.32+Number((number*29n)%49n)/100),y:site.y,age:-1,delay:.38+Number(number%19n)*.015,kind:Number(number%3n)};
    for(let i=2;i<route.length-1;i++) {
      const p=route[i];
      if(i%7===2) this.ledges.push({x:p.x+p.w-15,y:376,w:route[i+1].x-p.x-p.w+42});
      if(p.checkpoint || (i%4!==2 && !(z===3 && i%4===3))) continue;
      const kinds=this.populations[z];
      const kind=kinds[(i+Number(number%3n))%kinds.length];
      this.hostiles.push({kind,home:p.x+p.w*.56,floor:p.y,left:p.x+6,right:p.x+p.w-6,
        strength:kind==='sentinel'?4:z===3?2:1, flying:['drone','raptor','kite'].includes(kind)});
    }
    if(z===3){
      for(const p of route.filter(p=>p.checkpoint && p.section===3).slice(0,2)){
        for(let j=0;j<3;j++)this.hostiles.push({kind:['walker','runner','burrower'][j],home:p.x+p.w-24-j*18,
          floor:p.y,left:p.x+105,right:p.x+p.w-5,strength:2,flying:false,waveDelay:j*.6});
      }
    }
    this.warden=null;
    if(chapter.level===20 && segment===chapter.segments-1n){
      const deck=route.at(-1);
      this.warden={kind:'warden',home:deck.x+deck.w*.52,floor:deck.y,left:deck.x+30,right:deck.x+deck.w-24,
        strength:12,flying:true};
      this.hostiles.push(this.warden);
    }
    this.items=route.filter(p=>p.checkpoint).map(p=>({x:p.x+82,y:p.y-16}));
  },
  reset() {
    this.ammo=12;this.reload=0;this.recoil=0;this.shake=0;this.cool=0;this.pulse=0;this.bolts=[];
    this.trap.age=-1;
    for(const c of creatures)c.wounds=0;
    for(const item of this.items)item.used=false;
    for(const e of this.hostiles)Object.assign(e,{hp:e.strength,x:e.home,y:e.floor-(e.flying?65:12),age:0,flash:0,reload:1.5});
  },
  hurt() {
    if(field)return false;
    fail();
    return true;
  },
  hit(e,power) {
    if(e.hp<=0)return;
    e.hp-=power;e.flash=.18;
    burst(e.x,e.y,e.hp>0?'#ffdbad':'#91ffce',e.hp>0?6:18);
    tone(e.hp>0?260:430,e.hp>0?150:76,.13);
    if(e.hp<=0)this.kills++;
  },
  tick(dt) {
    this.cool-=dt;this.recoil-=dt;this.shake-=dt;this.pulse-=dt;
    const px=player.x+10,py=player.y+15;
    const live=this.hostiles.filter(e=>e.hp>0 && Math.abs(e.home-px)<460);
    if(this.reload>0){this.reload-=dt;if(this.reload<=0)this.ammo=12;}
    if(held('shoot') && this.cool<=0 && this.ammo>0){
      if(--this.ammo===0)this.reload=.8;
      const gun=this.guns[this.gun],dir=player.facing;
      let target=null;
      for(const e of live)if((e.x-px)*dir>0 && Math.abs(e.x-px)<360 && (!target||Math.abs(e.x-px)<Math.abs(target.x-px)))target=e;
      for(const c of creatures)if(!c.dead && (c.x-px)*dir>0 && Math.abs(c.x-px)<300 && (!target||Math.abs(c.x-px)<Math.abs(target.x-px)))target=c;
      const angle=this.aim ?? (target?Math.atan2(target.y-py,target.x-px):dir>0?0:Math.PI);
      for(const offset of this.gun===1?[-.055,.055]:[0])this.bolts.push({x:px,y:py,vx:Math.cos(angle+offset)*gun.speed,vy:Math.sin(angle+offset)*gun.speed,t:.8,power:gun.damage,color:gun.color});
      this.cool=gun.cooldown;this.recoil=.11;this.shots++;tone(650,170,.09,'triangle'); 
    }
    if(held('nova') && highest>=4n && this.pulse<=0){
      this.pulse=4;this.shake=.16;burst(px,py,'#e8a8ff',30);
      for(const e of live)if(Math.hypot(e.x-px,e.y-py)<130)this.hit(e,3);
    }
    for(const e of live){
      if(e.hp<=0)continue;
      if(e.waveDelay!==undefined && Math.abs(px-e.home)>210 && !e.age)continue;
      e.age+=dt;e.flash-=dt;e.reload-=dt;
      if(e.waveDelay!==undefined && e.age<e.waveDelay)continue;
      if(e.kind==='burrower' && Math.abs(px-e.home)>110){e.y=e.floor+18;continue;}
      const speed=e.kind==='runner'||e.kind==='hound'?115:e.flying?90:44;
      if(e.kind!=='turret' && e.kind!=='warden')e.x+=clamp(px-e.x,-speed*dt,speed*dt);
      e.x=clamp(e.x,e.left,e.right);
      e.y=e.floor-(e.flying?59+34*Math.sin(e.age*3):12);
      if(e.kind==='warden'){
        const enraged=e.hp<=e.strength/2;
        e.x=e.home+Math.sin(e.age*(enraged?2.2:1.4))*46;
        e.y=e.floor-70+Math.cos(e.age*2)*28;
        if(e.reload<=0 && Math.abs(px-e.x)<320){
          const aim=Math.atan2(py-e.y,px-e.x);
          for(const spread of enraged?[-.28,0,.28]:[0]){
            this.bolts.push({x:e.x,y:e.y,vx:145*Math.cos(aim+spread),vy:145*Math.sin(aim+spread),t:2.2,enemy:true,color:'#ff8068'});
          }
          e.reload=enraged?1.25:1.8;tone(165,72,.12);
        }
      }
      if((e.kind==='turret'||e.kind==='drone') && e.reload<=0 && Math.abs(px-e.x)<270){
        const a=Math.atan2(py-e.y,px-e.x);
        this.bolts.push({x:e.x,y:e.y,vx:170*Math.cos(a),vy:170*Math.sin(a),t:1.6,enemy:true,color:'#ff745e'});e.reload=2.3;
      }
      if(Math.hypot(e.x-px,e.y-py)<24){
        if(field)this.hit(e,3);
        else if(this.hurt())return true;
      }
    }
    for(const b of this.bolts){
      const dx=b.vx*dt,dy=b.vy*dt;
      const intersects=(x,y,r)=>{const u=clamp(((x-b.x)*dx+(y-b.y)*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(x-b.x-u*dx,y-b.y-u*dy)<r;};
      if(b.enemy){if(intersects(px,py,16)){b.t=0;if(this.hurt())return true;}}
      else for(const e of live)if(e.hp>0 && intersects(e.x,e.y,17)){this.hit(e,b.power);b.t=0;break;}
      if(!b.enemy && b.t>0)for(const c of creatures){
        if(!c.dead && intersects(c.x,c.y,16)){
          c.wounds+=b.power;c.dead=c.wounds>=1;
          if(c.dead)this.kills++;
          burst(c.x,c.y,'#ffc77f',12);tone(240,70,.14);b.t=0;break;
        }
      }
      b.x+=dx;b.y+=dy;b.t-=dt;
    }
    this.bolts=this.bolts.filter(b=>b.t>0);
    const t=this.trap;
    if(t.age<0 && Math.abs(px-t.x)<105)t.age=0;
    if(t.age>=0)t.age+=dt;
    const surge=t.age-t.delay;
    if(surge>0 && surge<.65){
      const tx=t.x+(t.kind===1?(surge-.32)*160:0);
      const ty=t.y-(t.kind===2?108-surge*166:18);
      if(Math.abs(px-tx)<24 && Math.abs(py-ty)<24 && this.hurt())return true;
    }
    for(const i of this.items)if(!i.used && this.ammo<12 && Math.hypot(px-i.x,py-i.y)<28){i.used=true;this.ammo=12;this.reload=0;tone(390,760,.18);}
    return false;
  },
  draw() {
    for(const p of this.ledges){rect(p.x,p.y,p.w,5,'#729690');rect(p.x+4,p.y+5,p.w-8,8,'#243d42');}
    for(const i of this.items)if(!i.used){rect(i.x-7,i.y-7,14,14,'#275751');rect(i.x-4,i.y-1,9,3,'#afffe4');rect(i.x-1,i.y-4,3,9,'#afffe4');}
    for(const b of this.bolts){ctx.strokeStyle=b.color;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(b.x-b.vx*.013,b.y-b.vy*.013);ctx.stroke();}
    for(const e of this.hostiles){
      if(e.hp<=0 || e.waveDelay!==undefined && e.age<=e.waveDelay || e.x<camera-35||e.x>camera+width+35)continue;
      ctx.save();ctx.translate(e.x,e.y);ctx.scale(player.x<e.x?-1:1,1);
      const color=e.flash>0?'#fff':e.flying?'#c77f70':['walker','runner','burrower'].includes(e.kind)?'#86a976':'#b49982';
      if(e.kind==='warden'){
        poly(color,[[-26,-8],[-13,-20],[12,-20],[27,-3],[17,12],[-17,12]]);
        rect(-12,-7,24,5,e.reload<.4?'#fff6ab':'#ff9071');
        rect(-23,-29,46,4,'#311e2e');rect(-23,-29,46*e.hp/e.strength,4,'#ffd07a');
      } else if(e.flying){const flap=Math.sin(e.age*11)*8;poly(color,[[-20,-7-flap],[-7,-3],[0,-6],[19,-9+flap],[8,3],[-3,6]]);}
      else if(['walker','runner','burrower','sentinel'].includes(e.kind)){rect(-5,-13,11,11,color);rect(-7,-2,15,13,color);rect(5,0,13,3,color);rect(-6,10,4,5+Math.sin(e.age*9)*3,color);rect(3,10,4,5-Math.sin(e.age*9)*3,color);}
      else if(e.kind==='turret'){rect(-12,0,24,12,color);rect(0,-4,21,5,color);}
      else poly(color,[[-21,5],[-12,-3],[2,-1],[8,-9],[17,-5],[7,2],[0,7]]);
      rect(5,-6,4,2,'#ffd49e');ctx.restore();
    }
    const t=this.trap;
    if(t.age>=0 && t.age<t.delay+.65){
      const surge=t.age-t.delay;
      if(surge<0)rect(t.x-18,t.y-3,36,3,'#ffc080');
      else if(t.kind===2)rect(t.x-18,t.y-120+surge*166,36,24,'#dc8b65');
      else {
        const tx=t.x+(t.kind===1?(surge-.32)*160:0);
        poly('#ff9c58',[[tx-16,t.y],[tx,t.y-40],[tx+16,t.y]]);
      }
    }
  }
};
