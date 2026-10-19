const $=id=>document.getElementById(id),WIN=.18,ARROWS=['←','↓','↑','→'];
const DEFAULT_SONG=window.SHOW_CHART;let SONG=DEFAULT_SONG;let playbackRate=1,bpm=SONG.bpm,BEAT=60/bpm,LEAD=BEAT*3,musicEpoch=0,musicSession=null,songBufferPromise;
const KEYS={ArrowLeft:0,KeyA:0,ArrowDown:1,KeyS:1,ArrowUp:2,KeyW:2,ArrowRight:3,KeyD:3};
const ROLES={football:{a:{name:'奥利赛',x:24,y:73,note:392},b:{name:'迪亚斯',x:51,y:73,note:523},g:{name:'凯恩',x:79,y:73,note:262}},baby:{a:{name:'一只奶蛋',x:50,y:62,note:587},b:{name:'两只奶蛋',x:50,y:62,note:784}}};
const SCENES={football:'安联球场 · 拜仁节奏夜',baby:'奶蛙 · 一起大笑',dance:'双人对拍 · 方向挑战'};
let ctx,active=false,starting=false,paused=false,mode='music',scene='football',shots=[],targets=[],score=0,combo=0,perfect=0,good=0,miss=0,raf,endTime=0,input=null,holding=null,laughUntil=0,laughPlaying=null;
const directionHeld=new Set();
let laughBufferPromise,laughAnimationTimer,analyzing=false,uploadedBuffer=null,uploadedName="",pendingImport=null,currentAudioInfo={kind:"builtin",id:"builtin-show-v1",name:"内置曲目",duration:DEFAULT_SONG.duration};
function loadLaughAudio(){
  if(!laughBufferPromise){
    const bytes=Uint8Array.from(atob(window.NAIWA_LAUGH_BASE64),c=>c.charCodeAt(0));
    laughBufferPromise=ctx.decodeAudioData(bytes.buffer).catch(error=>{laughBufferPromise=null;throw error;});
  }
  return laughBufferPromise;
}
function sound(t,f,d=.1,type='sine',v=.12){const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.setValueAtTime(f,t);o.frequency.exponentialRampToValueAtTime(f*.7,t+d);g.gain.setValueAtTime(v*.45,t);g.gain.exponentialRampToValueAtTime(.001,t+d);o.connect(g).connect(ctx.destination);o.start(t);o.stop(t+d);}
async function laugh(preview=false){
  try{
    ctx??=new(window.AudioContext||window.webkitAudioContext)();
    await ctx.resume();
    if(!preview&&laughPlaying?.endsAt>ctx.currentTime){laughUntil=laughPlaying.endsAt;return;}
    const buffer=await loadLaughAudio(),duration=preview?buffer.duration:Math.min(3,buffer.duration);
    clearTimeout(laughAnimationTimer);laughPlaying?.pause();
    const source=ctx.createBufferSource(),gain=ctx.createGain(),now=ctx.currentTime;
    source.buffer=buffer;source.playbackRate.value=1;
    gain.gain.setValueAtTime(preview?.9:.42,now);
    gain.gain.setValueAtTime(preview?.9:.42,now+Math.max(0,duration-.12));gain.gain.linearRampToValueAtTime(0,now+duration);
    source.connect(gain).connect(ctx.destination);
    const playback={endsAt:now+duration,pause:()=>{playback.endsAt=0;try{source.stop();}catch{}}};laughPlaying=playback;
    source.onended=()=>{playback.endsAt=0;source.disconnect();gain.disconnect();};
    source.start(now,0,duration);
    laughUntil=now+duration;$('stage').classList.add('frog-laugh');
    $('audio-status').textContent=preview?'正在试听原声（笑声开头已去掉静音）':'奶蛙原声 · 3 秒完整短笑声，连续命中不重播打断';
    if(!active)laughAnimationTimer=setTimeout(()=>$('stage').classList.remove('frog-laugh'),duration*1000);
  }catch{$('audio-status').textContent='笑声加载失败，请刷新页面后再试听';}
}
const footballMarkup='<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="29" fill="#fff" stroke="#101820" stroke-width="3"/><path d="M32 20 43 28 39 41H25L21 28Z" fill="#111820"/><path d="m32 20 0-16M43 28l17-5M39 41l10 15M25 41 15 56M21 28 4 23" stroke="#111820" stroke-width="2.4"/><path d="m20 5 12 5L44 5M60 23l-9 8 7 14M49 56l-16-5-16 6M6 45l7-14-9-8" fill="none" stroke="#111820" stroke-width="5"/></svg>';
function setTempoDisabled(value){setUploadDisabled(value);document.querySelectorAll('[data-tempo], [data-speed]').forEach(b=>b.disabled=value);$('tempo-range').disabled=value;$('tempo-hint').textContent=value?'演出中 · 音乐与判定同步':'调整播放速度，音乐和判定会一起变速';}
function setSpeed(value){if(active||starting)return;const percent=Math.max(80,Math.min(300,Math.round(Number(value)/5)*5));playbackRate=percent/100;bpm=SONG.bpm*playbackRate;BEAT=60/bpm;LEAD=BEAT*3;$('tempo-range').value=percent;$('bpm-label').textContent=playbackRate.toFixed(2)+'×';$('tempo-badge').textContent='音乐串联 · '+bpm.toFixed(1)+' BPM';$('hold-duration').textContent='一拍 = '+BEAT.toFixed(2)+' 秒';document.querySelectorAll('[data-speed]').forEach(b=>b.classList.toggle('selected',Number(b.dataset.speed)===percent));}
$('tempo-range').oninput=e=>setSpeed(e.target.value);document.querySelectorAll('[data-tempo]').forEach(b=>b.onclick=()=>setSpeed(playbackRate*100+Number(b.dataset.tempo)));
document.querySelectorAll('[data-speed]').forEach(b=>b.onclick=()=>setSpeed(b.dataset.speed));
$('music-volume').oninput=e=>musicSession?.setVolume(Number(e.target.value)/100);
function loadSongAudio(){if(!songBufferPromise){const data=Uint8Array.from(atob(window.SHOW_AUDIO_BASE64),c=>c.charCodeAt(0));songBufferPromise=ctx.decodeAudioData(data.buffer).catch(e=>{songBufferPromise=null;throw e;});}return songBufferPromise;}
function playSong(start,buffer){const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffer;source.playbackRate.value=playbackRate;gain.gain.value=Number($('music-volume').value)/100;source.connect(gain).connect(ctx.destination);source.start(start);return {setVolume(v){gain.gain.setTargetAtTime(v,ctx.currentTime,.03);},stop(){try{source.stop();}catch{}source.disconnect();gain.disconnect();}};}
function person(id,label,shirt){const name={a:'奥利赛',b:'迪亚斯',g:'凯恩'}[id],action={a:'一脚射门',b:'停球 · 射门',g:'抱球一拍'}[id];return `<div id="player-${id}" class="player ${id}" aria-label="${name}"><div class="shadow"></div><div class="football-sprite"></div><div class="name"><strong>${name}</strong><span>${action}</span></div></div>`;}
function updateFrogTarget(t,next){
 const marker=$('frog-target'),label=$('frog-target-label');marker.style.left=ROLES.baby.a.x+'%';marker.style.top=ROLES.baby.a.y+'%';
 if(scene!=='baby')return;
 if(t<Number(marker.dataset.hitUntil||0)){marker.dataset.state='hit';label.textContent='命中！';return;}
 if(t<Number(marker.dataset.missUntil||0)){marker.dataset.state='miss';label.textContent='错过了，接下一只';return;}
 if(!next||next.scene!=='baby'){marker.dataset.state='idle';label.textContent='到圆心时点按';return;}
 const second=next.state==='trapped',at=second?targets.find(a=>a.s===next&&a.action==='second')?.t:next.at;
 const ready=Math.abs(t-at)<=Math.min(WIN,BEAT*.2);marker.dataset.state=ready?'ready':second?'waiting':'idle';
 label.textContent=second?(ready?'2/2 · 再按一次！':'2/2 · 等下一拍'):ready?(next.role==='b'?'1/2 · 现在按！':'现在按！'):'到圆心时点按';
}
function setScene(value){scene=value;$('stage').dataset.scene=value;$('scene-title').textContent=SCENES[value];$('round').textContent=SCENES[value]+(mode==='music'?' · ♫ '+bpm.toFixed(1)+' BPM':'');$('players').innerHTML=value==='football'?person('a','9','#efb65a')+person('b','10','#e57457')+person('g','GK','#537eb5'):'';$('tap').style.display=active&&value!=='dance'?'block':'none';$('arrow-controls').hidden=!(active&&value==='dance');$('cue').textContent=value==='dance'?'右侧是你 · 箭头落到光圈时按键':value==='baby'?'奶蛋来啦，准备大笑！':'看清落点，准备接球';$('status').textContent=value==='dance'?'方向键 ↑ ↓ ← → / WASD · 左侧自动，右侧由你操作':value==='baby'?'奶蛋到判定圆心时按 · 一只一下，两只跟随提示按两下':'奥利赛点一次 · 迪亚斯停球再射 · 凯恩按住一拍';$('stage').classList.remove('frog-laugh');$('judge').textContent='';}
function chart(base){return SONG.events.map((s,id)=>({...s,id,at:base+s.at/playbackRate,followAt:s.followAt===undefined?undefined:base+s.followAt/playbackRate,spawn:base+s.at/playbackRate-LEAD,state:'incoming',x:50,y:34,started:false,el:null,flight:null}));}
function makeTargets(list){return list.flatMap(s=>s.side==='npc'?[]:s.role==='arrow'?[{s,t:s.at,action:'arrow',done:false}]:[{s,t:s.at,action:s.role==='g'?'hold':'down',done:false},...(s.role==='b'?[{s,t:s.followAt??s.at+BEAT/2,action:'second',done:false}]:s.role==='g'?[{s,t:Infinity,action:'complete',done:false}]:[])]);}
function showScore(){$('score').textContent=String(score).padStart(4,'0');$('combo').textContent=combo;}
function judge(a,t){if(a.s.scene==='baby'){$('frog-target').dataset.hitUntil=String(t+.12/playbackRate);$('frog-target').dataset.missUntil='0';}a.done=true;a.success=true;const p=a.action==='complete'||Math.abs(t-a.t)<=.09;score+=p?100:60;combo++;p?perfect++:good++;showScore();$('judge').textContent=(p?'Perfect! ':'Good! ')+(a.s.scene==='baby'?'哈哈哈！':a.s.scene==='dance'?'合拍！':'好球！');}
function pose(id,kind){const p=$('player-'+id);if(!p)return;p.classList.remove('kick','trap','catch');if(kind)p.classList.add(kind);}
function fly(s,x,y,t,d=.45,arc=12){d/=playbackRate;s.flight={x:s.x,y:s.y,toX:x,toY:y,t,d,arc};s.state='outgoing';s.removeAt=t+d;}
function fail(s,message){if(s.state==='failed'||s.state==='outgoing')return;if(s.scene==='baby')$('frog-target').dataset.missUntil=String(ctx.currentTime+.18/playbackRate);for(const a of targets.filter(a=>a.s===s&&!a.done)){a.done=true;miss++;}s.state='failed';combo=0;showScore();$('judge').textContent=message;if(holding===s)holding=null;pose(s.role,'');const t=ctx.currentTime;s.flight={x:s.x,y:s.y,toX:s.x+8,toY:105,t,d:.35,arc:0};s.removeAt=t+.35;}
function eggMarkup(count){return '<span class="naidan-sprite"></span>'.repeat(count);}
function spawn(s){if(scene!==s.scene)setScene(s.scene);s.started=true;s.el=document.createElement('div');if(s.role==='arrow'){s.el.className=`fall-arrow lane-${s.dir} ${s.side}`;s.el.textContent=ARROWS[s.dir];}else{s.el.className='ball incoming'+(s.scene==='baby'?' egg':'');if(s.scene==='baby')s.el.innerHTML=eggMarkup(s.role==='b'?2:1);else {s.el.classList.add('soccer-ball');s.el.innerHTML=footballMarkup;};sound(Math.max(ctx.currentTime,s.spawn),ROLES[s.scene][s.role].note,.12,'sine',.13);}$('stage').append(s.el);}
const laneX=(side,dir)=>(side==='npc'?17:59)+dir*8;
function danceMove(side,dir,t){const dancer=$('dancer-'+side);dancer.dataset.move=String(dir);dancer.dataset.until=String(t+.23);const receptor=$(`receptor-${side}-${dir}`);receptor.classList.add('lit');receptor.dataset.until=String(t+.18);}
function draw(t){for(const s of shots){if(!s.started&&t>=s.spawn&&s.state==='incoming')spawn(s);if(!s.el)continue;if(s.removeAt&&t>=s.removeAt){s.el.remove();s.el=null;continue;}if(s.role==='arrow'&&s.state==='incoming'){s.x=laneX(s.side,s.dir);s.y=22+Math.min(1.3,Math.max(0,(t-s.spawn)/LEAD))*55;if(s.side==='npc'&&t>=s.at){danceMove('npc',s.dir,t);sound(t,220+s.dir*70,.09,'triangle',.07);s.state='outgoing';s.removeAt=t+.12;}}else if(s.flight){const f=s.flight,u=Math.max(0,Math.min(1,(t-f.t)/f.d));s.x=f.x+(f.toX-f.x)*u;s.y=f.y+(f.toY-f.y)*u-Math.sin(Math.PI*u)*f.arc;}else if(s.role!=='arrow'){const r=ROLES[s.scene][s.role],u=Math.max(0,Math.min(1,(t-s.spawn)/LEAD));s.x=s.state==='incoming'?50+(r.x-50)*u:r.x;s.y=s.state==='incoming'?34+(r.y-34)*u-Math.sin(Math.PI*u)*9:r.y;}s.el.style.left=`${s.x}%`;s.el.style.top=`${s.y}%`;const scale=s.role==='arrow'?1:s.state==='incoming'?(s.scene==='football'?.6:.25)+(s.scene==='football'?.4:.75)*Math.max(0,Math.min(1,(t-s.spawn)/LEAD)):1;s.el.style.transform=`translate(${s.scene==='baby'&&s.role==='b'&&s.state==='incoming'?'-25%':'-50%'},-50%) scale(${scale}) rotate(${s.scene==='football'&&s.state!=='held'?t*420:0}deg)`;if(s.state==='outgoing')s.el.style.opacity=String(Math.max(0,Math.min(1,(s.removeAt-t)/.18)));}$('stage').classList.toggle('frog-laugh',scene==='baby'&&t<laughUntil);const next=shots.find(s=>s.started&&s.side!=='npc'&&['incoming','trapped','held'].includes(s.state));updateFrogTarget(t,next);if(next){$('order').textContent=`第 ${next.segment+1} 幕 · ${SONG.sections[next.segment].name}`;if(next.scene!=='dance')$('cue').textContent=next.state==='held'?'抱稳一拍……':next.state==='trapped'?(scene==='baby'?'还有一只，再按一下！':'再按一下，射门！'):`${ROLES[next.scene][next.role].name} · ${scene==='baby'?'来了！':'看准落点'}`;}for(const e of document.querySelectorAll('[data-until]'))if(t>=Number(e.dataset.until)){e.classList.remove('lit');delete e.dataset.move;delete e.dataset.until;}const songTime=Math.max(0,Math.min(SONG.duration,(t-musicEpoch)*playbackRate));$('progress').style.width=`${songTime/SONG.duration*100}%`;$('song-clock').textContent=formatClock(songTime)+' / '+formatClock(SONG.duration);document.querySelectorAll('[data-chapter]').forEach(e=>e.classList.toggle('current',Number(e.dataset.chapter)===(next?.segment??Math.max(0,SONG.sections.length-1))));if(!next&&songTime>SONG.events.at(-1).at+1)$('cue').textContent='收尾 · 等音乐结束';$('pulse').style.opacity=.25+.75*(1-(((t-musicEpoch-SONG.firstBeat/playbackRate)%BEAT+BEAT)%BEAT)/BEAT);}
function completeHold(a,t){judge(a,a.t);holding=null;pose('g','kick');fly(a.s,52,30,t,.55,16);sound(t,784,.15,'sine',.15);}
function tick(){if(!active)return;const t=ctx.currentTime;draw(t);for(const a of targets){if(a.done)continue;if(a.action==='complete'){if(a.s.state==='held'&&t>=a.t)completeHold(a,t);}else if(t>a.t+WIN)fail(a.s,a.s.scene==='dance'?'Miss · 箭头错过了':a.s.scene==='baby'?'Miss · 奶蛋溜走啦':'Miss · 球漏过去了');}if(t>endTime){finish();return;}raf=requestAnimationFrame(tick);}
async function start(){
 if(active||starting||analyzing||pendingImport)return;starting=true;
 try{
  ctx??=new(window.AudioContext||window.webkitAudioContext)();await ctx.resume();$('cue').textContent='正在准备音乐……';const songBuffer=await loadSongAudio();await loadLaughAudio().catch(()=>{});
  shots.forEach(s=>s.el?.remove());musicSession?.stop();musicSession=null;musicEpoch=ctx.currentTime+.7;
  shots=chart(musicEpoch,mode);targets=makeTargets(shots);endTime=musicEpoch+songBuffer.duration/playbackRate+.05;
  score=combo=perfect=good=miss=0;input=null;holding=null;directionHeld.clear();paused=false;active=true;
  setScene(shots[0].scene);showScore();$('judge').textContent='';$('start').style.display='none';$('stop').hidden=false;
  document.querySelectorAll('[data-mode]').forEach(b=>b.disabled=true);setTempoDisabled(true);
  musicSession=playSong(musicEpoch,songBuffer);
  tick();
 }catch(e){active=false;$('cue').textContent='启动失败，请重试';$('start').style.display='block';$('stop').hidden=true;setTempoDisabled(false);document.querySelectorAll('[data-mode]').forEach(b=>b.disabled=false);}
 finally{starting=false;}
}
function press(source){if(!active||paused||scene==='dance'||input||ctx.state!=='running')return;input=source;const t=ctx.currentTime,a=targets.find(a=>!a.done&&a.s.scene===scene&&['down','hold','second'].includes(a.action)&&Math.abs(t-a.t)<=WIN&&(a.action!=='second'||a.s.state==='trapped'));if(!a){combo=0;showScore();$('judge').textContent='太早或太晚 · 等它到达再按';return;}const s=a.s;judge(a,t);sound(t,180,.1,'triangle',.18);if(a.action==='hold'){s.state='held';holding=s;pose('g','catch');targets.find(x=>x.s===s&&x.action==='complete').t=t+BEAT;$('judge').textContent='接住了！按住一拍';}else if(s.role==='b'&&a.action==='down'){s.state='trapped';if(s.scene==='baby'&&s.el)s.el.innerHTML=eggMarkup(1);pose('b','trap');}else{pose(s.role,'kick');if(s.scene==='baby'){laugh();fly(s,50,54,t,.22,0);}else fly(s,90,42,t,.5,15);}}
function release(source,cancel=false){if(input!==source)return;input=null;if(!holding)return;const a=targets.find(a=>a.s===holding&&a.action==='complete');if(!cancel&&ctx.currentTime>=a.t)completeHold(a,ctx.currentTime);else fail(holding,cancel?'接球取消':'Miss · 要抱满一拍再松手');}
function pressDirection(dir){if(!active||paused||scene!=='dance')return;const t=ctx.currentTime,a=targets.find(a=>!a.done&&a.action==='arrow'&&a.s.dir===dir&&Math.abs(t-a.t)<=WIN);danceMove('player',dir,t);if(!a){combo=0;showScore();$('judge').textContent='方向或时机不对';return;}judge(a,t);a.s.state='outgoing';a.s.removeAt=t+.13;sound(t,330+dir*100,.14,'triangle',.17);}
function finish(stopped=false){active=false;input=null;holding=null;directionHeld.clear();cancelAnimationFrame(raf);if(stopped){ctx?.suspend();laughPlaying?.pause();shots.forEach(s=>s.el?.remove());}setTempoDisabled(false);musicSession?.stop();musicSession=null;document.querySelectorAll('[data-mode]').forEach(b=>b.disabled=false);$('cue').textContent=stopped?'已停止，准备好后重新演出':score/(targets.length*100)>=.8?'配合漂亮，演出成功！':'再来一次，找到节奏！';$('round').textContent=stopped?'自由练习':'演出结束';$('status').textContent=`Perfect ${perfect} · Good ${good} · Miss ${miss} · 满分 ${targets.length*100}`;$('tap').style.display='none';$('arrow-controls').hidden=true;$('stop').hidden=true;$('start').style.display='block';$('start').textContent='开始演出 ↗';}
$('stop').onclick=()=>{finish(true);ctx?.close();ctx=null;};$('start').onclick=start;$('preview-laugh').onclick=()=>laugh(true);
$('tap').onpointerdown=e=>{if(e.button!==0||!e.isPrimary)return;e.preventDefault();$('tap').setPointerCapture(e.pointerId);press('p'+e.pointerId);};$('tap').onpointerup=e=>{e.preventDefault();release('p'+e.pointerId);};$('tap').onpointercancel=e=>release('p'+e.pointerId,true);$('tap').onlostpointercapture=e=>release('p'+e.pointerId,true);
document.querySelectorAll('[data-dir]').forEach(b=>b.onpointerdown=e=>{e.preventDefault();pressDirection(Number(b.dataset.dir));});
document.addEventListener('keydown',e=>{if(e.target?.closest?.('button')&&e.code==='Space'&&!active)return;if(e.code==='Space'){e.preventDefault();if(!e.repeat)active?press('key'):start();}if(e.code in KEYS&&active){e.preventDefault();const dir=KEYS[e.code];if(!e.repeat&&!directionHeld.has(dir)){directionHeld.add(dir);pressDirection(dir);}}});document.addEventListener('keyup',e=>{if(e.code==='Space'){e.preventDefault();release('key');}if(e.code in KEYS)directionHeld.delete(KEYS[e.code]);});
window.addEventListener('blur',()=>{if(input)release(input,true);directionHeld.clear();});document.addEventListener('visibilitychange',()=>{if(!active)return;if(document.hidden){if(input)release(input,true);paused=true;ctx.suspend();laughPlaying?.pause();$('cue').textContent='已暂停，回来继续';}else{paused=false;ctx.resume();}});
function formatClock(seconds){const t=Math.floor(seconds);return Math.floor(t/60)+':'+String(t%60).padStart(2,'0');}
setSpeed(100);setScene('football');refreshOverview();setUploadDisabled(false);

function setUploadDisabled(value){const busy=value||analyzing;for(const id of ['upload-music','music-file','chart-difficulty','bpm-hint'])$(id).disabled=busy||!!pendingImport;$('regenerate-chart').disabled=busy||!uploadedBuffer||!!pendingImport;$('restore-default').disabled=busy||SONG===DEFAULT_SONG||!!pendingImport;for(const id of ['import-chart','chart-file','match-chart-music','import-music-file','cancel-chart-import'])$(id).disabled=busy;$('export-chart').disabled=busy||!!pendingImport;$('start').disabled=analyzing||!!pendingImport;}
function refreshOverview(){
 $('show-title').textContent=SONG.generated?'♫ 音乐串联 · '+SONG.title:'♫ 音乐串联 · 内置专属编排';
 const count=SONG.events.filter(e=>e.side!=='npc').length;$('show-summary').textContent='完整演出 '+formatClock(SONG.duration)+' · '+SONG.sections.length+' 幕自动切换 · '+count+' 次来物';
 $('song-chapters').innerHTML='';SONG.sections.forEach((section,i)=>{const li=document.createElement('li');li.dataset.chapter=i;li.textContent=formatClock(section.start)+' '+section.name;$('song-chapters').append(li);});
 $('song-clock').textContent='0:00 / '+formatClock(SONG.duration);$('progress').style.width='0%';
}
async function generateChart(file=null){
 if(active||starting||analyzing||pendingImport)return;if(!file&&!uploadedBuffer)return;
 if(file&&file.size>120*1024*1024){$('generation-status').textContent='请选择 120 MB 以内的音乐文件。';return;}
 analyzing=true;setTempoDisabled(true);$('generation-progress').hidden=false;$('generation-progress').value=0;$('generation-status').textContent=file?'正在读取和解码音乐……':'正在重新编排……';
 try{
  ctx??=new(window.AudioContext||window.webkitAudioContext)();await ctx.resume();
  const bytes=file?await file.arrayBuffer():null;
  const media=file?await window.ChartFiles.mediaInfo(file,bytes):currentAudioInfo;
  const buffer=file?await ctx.decodeAudioData(bytes):uploadedBuffer;
  const hint=file?'':$('bpm-hint').value.trim();
  const next=await window.AutoChart.analyze(buffer,{difficulty:$('chart-difficulty').value,bpmHint:hint?Number(hint):null,onProgress:(p,text)=>{$('generation-progress').value=p;$('generation-status').textContent=text+' '+Math.round(p*100)+'%';}});
  const filename=file?file.name:uploadedName,dot=filename.lastIndexOf('.');next.title=(dot>0?filename.slice(0,dot):filename).slice(0,80)||'上传音乐';
  shots.forEach(shot=>shot.el?.remove());shots=[];targets=[];laughPlaying?.pause();
  SONG=next;uploadedBuffer=buffer;uploadedName=filename;currentAudioInfo={...media,duration:buffer.duration};songBufferPromise=Promise.resolve(buffer);score=combo=perfect=good=miss=0;showScore();
  setSpeed(100);setScene(next.sections[0].scene);refreshOverview();$('bpm-hint').value=next.bpm.toFixed(2);
  $('generation-status').textContent='已生成：'+next.bpm.toFixed(1)+' BPM · '+next.sections.length+' 幕 · '+next.events.filter(e=>e.side!=='npc').length+' 次来物'+(next.confidence<.15?'。节拍较弱，可修正 BPM 后再生成。':'。点击“开始演出”试玩。');
  $('cue').textContent='新曲谱准备好了，开始演出吧！';
 }catch(error){$('generation-status').textContent=error?.name==='EncodingError'?'无法解码这段音乐，请尝试 MP3、M4A 或 WAV 文件。':error?.message||'生成失败，请换一个音频文件再试。';}
 finally{analyzing=false;$('generation-progress').hidden=true;setTempoDisabled(false);$('music-file').value='';}
}
$('upload-music').onclick=()=>$('music-file').click();
$('music-file').onchange=e=>{const file=e.target.files?.[0];if(file)generateChart(file);};
$('regenerate-chart').onclick=()=>generateChart();
$('restore-default').onclick=()=>{if(active||starting||analyzing)return;shots.forEach(s=>s.el?.remove());shots=[];targets=[];laughPlaying?.pause();SONG=DEFAULT_SONG;uploadedBuffer=null;uploadedName='';currentAudioInfo={kind:'builtin',id:'builtin-show-v1',name:'内置曲目',duration:DEFAULT_SONG.duration};songBufferPromise=null;score=combo=perfect=good=miss=0;showScore();$('bpm-hint').value='';setSpeed(100);setScene('football');refreshOverview();setUploadDisabled(false);$('generation-status').textContent='已恢复内置曲目。';};

function exportCurrentChart(){
 if(active||starting||analyzing||pendingImport)return;
 try{
  const pack=window.ChartFiles.create(SONG,currentAudioInfo,playbackRate);
  const data=new Blob([JSON.stringify(pack,null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(data),link=document.createElement('a');
  const forbidden=[60,62,58,34,47,92,124,63,42],filename=Array.from(SONG.title||'节奏曲谱').map(c=>c.charCodeAt(0)<32||forbidden.includes(c.charCodeAt(0))?'_':c).join('').slice(0,80);
  link.href=url;link.download=filename+'.rhythm.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  $('chart-file-status').textContent='已下载曲谱文件。文件不包含音乐，分享时请另附对应的音乐文件。';
 }catch(error){$('chart-file-status').textContent=error.message||'下载失败，请换一个浏览器再试。';}
}
function applyImportedChart(pack,buffer,media){
 shots.forEach(s=>s.el?.remove());shots=[];targets=[];laughPlaying?.pause();
 SONG=pack.chart;currentAudioInfo={...media,duration:SONG.duration};
 uploadedBuffer=media.kind==='external'?buffer:null;uploadedName=media.kind==='external'?media.name:'';
 songBufferPromise=buffer?Promise.resolve(buffer):null;pendingImport=null;$('chart-link-music').hidden=true;
 score=combo=perfect=good=miss=0;showScore();setSpeed(pack.playbackSpeed*100);setScene(SONG.sections[0].scene);refreshOverview();
 $('bpm-hint').value=SONG.bpm.toFixed(2);$('chart-difficulty').value=SONG.difficulty||'normal';
 $('generation-status').textContent='已载入保存的曲谱，保持原编排，无需重新制谱。';$('cue').textContent='导入完成，可以开始演出！';setUploadDisabled(false);
}
async function importChartFile(file){
 if(active||starting||analyzing||!file)return;
 if(file.size>6*1024*1024){$('chart-file-status').textContent='曲谱文件过大，请选择导出的 JSON 曲谱文件。';return;}
 analyzing=true;setTempoDisabled(true);$('chart-file-status').textContent='正在读取曲谱……';
 try{
  const pack=window.ChartFiles.validate(JSON.parse(await file.text()));
  if(pack.audio.kind==='builtin'){
   if(Math.abs(pack.audio.duration-DEFAULT_SONG.duration)>.1)throw Error('这份曲谱与当前内置音乐不匹配。');
   applyImportedChart(pack,null,{kind:'builtin',id:'builtin-show-v1',name:'内置曲目'});$('chart-file-status').textContent='内置音乐曲谱已导入，点击“开始演出”即可。';
  }else{
   let reuse=false;
   if(uploadedBuffer&&currentAudioInfo.kind==='external'){try{window.ChartFiles.match(pack.audio,currentAudioInfo,uploadedBuffer.duration);reuse=true;}catch{}}
   if(reuse){applyImportedChart(pack,uploadedBuffer,currentAudioInfo);$('chart-file-status').textContent='曲谱已导入，已匹配当前音乐，可以开始。';}
   else{pendingImport=pack;$('chart-link-music').hidden=false;$('pending-chart-info').textContent='曲谱：'+pack.title+' · 请选音乐：'+pack.audio.name+'（'+formatClock(pack.audio.duration)+'）';$('chart-file-status').textContent='曲谱已读取，还需选择对应的原音乐文件。';}
  }
 }catch(error){$('chart-file-status').textContent=error instanceof SyntaxError?'曲谱文件不是有效的 JSON。':error.message||'无法读取这份曲谱。';}
 finally{analyzing=false;setTempoDisabled(false);$('chart-file').value='';}
}
async function matchImportedMusic(file){
 if(active||starting||analyzing||!pendingImport||!file)return;
 if(file.size>120*1024*1024){$('chart-file-status').textContent='请选择 120 MB 以内的音乐文件。';return;}
 const pack=pendingImport;analyzing=true;setTempoDisabled(true);$('chart-file-status').textContent='正在核对音乐并载入曲谱……';
 try{
  ctx??=new(window.AudioContext||window.webkitAudioContext)();await ctx.resume();
  const bytes=await file.arrayBuffer(),media=await window.ChartFiles.mediaInfo(file,bytes),buffer=await ctx.decodeAudioData(bytes);
  const match=window.ChartFiles.match(pack.audio,media,buffer.duration);applyImportedChart(pack,buffer,media);
  $('chart-file-status').textContent=match==='fingerprint'?'音乐文件已核对，曲谱导入完成，可以开始演出。':'已按音乐时长和文件信息匹配，曲谱导入完成。';
 }catch(error){$('chart-file-status').textContent=error?.name==='EncodingError'?'无法播放这份音乐，请选择保存曲谱时的原音乐文件。':error.message||'音乐匹配失败，请重新选择。';}
 finally{analyzing=false;setTempoDisabled(false);$('import-music-file').value='';}
}
$('export-chart').onclick=exportCurrentChart;
$('import-chart').onclick=()=>{if(!active&&!starting&&!analyzing)$('chart-file').click();};
$('chart-file').onchange=e=>{const file=e.target.files?.[0];if(file)importChartFile(file);};
$('match-chart-music').onclick=()=>{if(!active&&!starting&&!analyzing)$('import-music-file').click();};
$('import-music-file').onchange=e=>{const file=e.target.files?.[0];if(file)matchImportedMusic(file);};
$('cancel-chart-import').onclick=()=>{if(analyzing)return;pendingImport=null;$('chart-link-music').hidden=true;setUploadDisabled(false);$('chart-file-status').textContent='已取消导入，仍使用当前曲谱。';};
