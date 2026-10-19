// Portable chart-only JSON. Imported data is validated and rebuilt before entering the game.
window.ChartFiles=(()=>{
  const FORMAT='rhythm-theatre-chart',VERSION=1,SCENES=new Set(['football','baby','dance']);
  const error=message=>{throw Error(message);};
  const number=(value,min,max,label)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max?value:error(label+'不合法。');
  const text=(value,fallback,max=160)=>typeof value==='string'&&value.trim()?value.trim().slice(0,max):fallback;
  function validate(input){
    if(!input||input.format!==FORMAT)error('这不是节奏小剧场的曲谱文件。');
    if(input.version!==VERSION)error('暂不支持这个曲谱版本。');
    const raw=input.chart;if(!raw||typeof raw!=='object')error('曲谱内容缺失。');
    const duration=number(raw.duration,8,600,'音乐时长'),bpm=number(raw.bpm,50,200,'BPM'),beat=60/bpm;
    if(!Array.isArray(raw.sections)||raw.sections.length<1||raw.sections.length>32)error('场景编排不合法。');
    let lastEnd=-1;
    const sections=raw.sections.map((s,i)=>{
      if(!s||!SCENES.has(s.scene))error('曲谱包含不支持的场景。');
      const start=number(s.start,0,duration,'场景开始时间'),end=number(s.end,0,duration+.05,'场景结束时间');
      if(end<=start||start<lastEnd-.02)error('场景时间顺序不合法。');lastEnd=end;
      return {scene:s.scene,name:text(s.name,'第 '+(i+1)+' 幕',80),start,end};
    });
    if(!Array.isArray(raw.events)||raw.events.length<1||raw.events.length>10000)error('音符数量不合法。');
    const events=raw.events.map(s=>{
      if(!s||!Number.isInteger(s.segment)||s.segment<0||s.segment>=sections.length)error('音符的场景编号不合法。');
      const section=sections[s.segment],at=number(s.at,.001,duration-.001,'音符时间');
      if(s.scene!==section.scene||at<section.start-Math.max(beat*.65,.12)||at>section.end+.08)error('音符与场景时间不匹配。');
      const e={scene:section.scene,segment:s.segment,role:s.role,at};
      if(e.scene==='dance'){
        if(s.role!=='arrow'||!Number.isInteger(s.dir)||s.dir<0||s.dir>3||!['npc','player'].includes(s.side))error('方向键音符不合法。');
        e.dir=s.dir;e.side=s.side;
      }else{
        if(!(e.scene==='football'?['a','b','g']:['a','b']).includes(s.role))error('人物或奶蛋类型不合法。');
        if(s.role==='b'){e.followAt=number(s.followAt,s.at+.01,Math.min(duration-.001,s.at+beat*1.5),'第二次点击时间');}
        if(s.role==='g'&&s.at+beat>duration+.05)error('长按音符超出了音乐时长。');
      }
      return e;
    }).sort((a,b)=>a.at-b.at);
    if(!events.some(e=>e.side!=='npc'))error('曲谱中没有玩家可操作的音符。');
    const media=input.audio;if(!media||!['builtin','external'].includes(media.kind))error('缺少对应音乐的信息。');
    if(Math.abs(number(media.duration,8,600,'对应音乐时长')-duration)>.1)error('音乐时长和曲谱不匹配。');
    const audio={kind:media.kind,name:text(media.name,'对应音乐',240),duration};
    if(media.kind==='builtin'){if(media.id!=='builtin-show-v1')error('没有找到这首内置音乐。');audio.id=media.id;}
    else{
      if(media.sha256!=null&&!/^[a-f0-9]{64}$/i.test(media.sha256))error('音乐文件指纹不合法。');
      audio.sha256=media.sha256?media.sha256.toLowerCase():null;
      if(media.size!=null)audio.size=number(media.size,1,120*1024*1024,'音乐文件大小');
    }
    const speed=number(input.playbackSpeed??1,.8,3,'播放速度');
    const chart={title:text(raw.title||input.title,'导入曲谱'),duration,bpm,beat,firstBeat:number(raw.firstBeat??events[0].at,0,duration,'第一拍时间'),sections,events,generated:true,imported:true,difficulty:['easy','normal','hard'].includes(raw.difficulty)?raw.difficulty:'normal',analysis:text(raw.analysis,'imported',40)};
    return {format:FORMAT,version:VERSION,title:chart.title,audio,playbackSpeed:speed,chart};
  }
  function create(chart,audio,playbackSpeed=1){
    const clean={title:chart.title,duration:chart.duration,bpm:chart.bpm,firstBeat:chart.firstBeat,sections:chart.sections,events:chart.events,difficulty:chart.difficulty||'normal',analysis:chart.analysis||'authored'};
    const result=validate({format:FORMAT,version:VERSION,title:chart.title,audio:{...audio,duration:chart.duration},playbackSpeed,chart:clean});
    return {...result,createdAt:new Date().toISOString()};
  }
  async function mediaInfo(file,bytes){
    let sha256=null;
    if(window.crypto?.subtle){try{const hash=await window.crypto.subtle.digest('SHA-256',bytes);sha256=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');}catch{}}
    return {kind:'external',name:file.name,size:file.size,sha256};
  }
  function match(expected,actual,duration){
    if(Math.abs(expected.duration-duration)>.25)error('音乐时长不匹配，请选择保存曲谱时使用的原音乐。');
    if(expected.sha256&&actual.sha256){if(expected.sha256!==actual.sha256)error('音乐文件不匹配，请选择保存曲谱时的原文件。');return 'fingerprint';}
    if(expected.size&&actual.size!==expected.size)error('音乐文件大小不匹配，请选择原音乐文件。');
    if(expected.name&&expected.name!==actual.name)error('无法核对这份音乐，请选择原文件名对应的音乐。');
    return 'metadata';
  }
  return {validate,create,mediaInfo,match};
})();
