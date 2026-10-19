// Local signal analysis and rule-based chart arrangement; no external AI/API is called.
window.AutoChart={async analyze(buffer,{difficulty='normal',bpmHint=null,onProgress=()=>{}}={}){
  const wait=()=>new Promise(r=>setTimeout(r,0));
  const duration=buffer.duration;
  if(!Number.isFinite(duration)||duration<8)throw Error('请选择至少 8 秒的音乐。');
  if(duration>600)throw Error('请使用 10 分钟以内的音乐。');
  const sr=8000,n=512,hop=80,length=Math.floor(duration*sr),mono=new Float32Array(length);
  const channels=Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i));
  let rms=0;for(let i=0;i<length;i++){let v=0;const at=Math.min(channels[0].length-1,Math.floor(i*buffer.sampleRate/sr));for(const c of channels)v+=c[at];mono[i]=v/channels.length;rms+=mono[i]*mono[i];}
  if(Math.sqrt(rms/length)<.00005)throw Error('没有检测到有效声音，请换一段音乐。');
  onProgress(.05,'正在分析重音与音色……');await wait();
  const frames=Math.floor((length-n)/hop)+1,flux=new Float32Array(frames),energy=new Float32Array(frames),color=new Float32Array(frames),real=new Float64Array(n),imag=new Float64Array(n),previous=new Float64Array(n/2),hann=Float64Array.from({length:n},(_,i)=>.5-.5*Math.cos(2*Math.PI*i/(n-1)));
  const reverse=new Uint16Array(n);for(let i=0;i<n;i++){let k=i,v=0;for(let b=0;b<9;b++){v=(v<<1)|(k&1);k>>=1;}reverse[i]=v;}
  const twiddles=[];for(let size=2;size<=n;size*=2){const c=new Float64Array(size/2),s=new Float64Array(size/2);for(let j=0;j<size/2;j++){c[j]=Math.cos(-2*Math.PI*j/size);s[j]=Math.sin(-2*Math.PI*j/size);}twiddles.push({size,c,s});}
  for(let f=0;f<frames;f++){
    const at=f*hop;let e=0;for(let i=0;i<n;i++){const x=mono[at+i];real[reverse[i]]=x*hann[i];imag[i]=0;e+=x*x;}energy[f]=Math.sqrt(e/n);
    for(const {size,c,s} of twiddles)for(let i=0;i<n;i+=size)for(let j=0;j<size/2;j++){
      const a=i+j,b=a+size/2,tr=c[j]*real[b]-s[j]*imag[b],ti=s[j]*real[b]+c[j]*imag[b];real[b]=real[a]-tr;imag[b]=imag[a]-ti;real[a]+=tr;imag[a]+=ti;
    }
    let sum=0,low=0,high=0;for(let k=2;k<n/2;k++){const mag=Math.log1p(10*Math.hypot(real[k],imag[k]));sum+=Math.max(0,mag-previous[k]);previous[k]=mag;if(k<20)low+=mag;else if(k>80)high+=mag;}
    flux[f]=sum/(n/2-2);color[f]=high/(low+high+1e-8);
    if(f%256===0){onProgress(.05+.48*f/frames,'正在分析重音与音色……');await wait();}
  }
  const prefix=new Float64Array(frames+1);for(let i=0;i<frames;i++)prefix[i+1]=prefix[i]+flux[i];
  const onset=new Float32Array(frames);let mean=0;
  for(let i=0;i<frames;i++){const a=Math.max(0,i-50),b=Math.min(frames,i+51);onset[i]=Math.max(0,flux[i]-.7*(prefix[b]-prefix[a])/(b-a));mean+=onset[i];}mean/=frames;
  let variance=0;for(const v of onset)variance+=(v-mean)**2;const deviation=Math.sqrt(variance/frames)||1;for(let i=0;i<frames;i++)onset[i]/=deviation;
  onProgress(.55,'正在估计 BPM 和拍点……');await wait();
  const correlations=[];for(let lag=32;lag<=100;lag++){
    let cross=0,aa=0,bb=0;for(let i=lag;i<frames;i++){const a=onset[i]-mean/deviation,b=onset[i-lag]-mean/deviation;cross+=a*b;aa+=a*a;bb+=b*b;}
    correlations.push({lag,bpm:6000/lag,correlation:cross/Math.sqrt(aa*bb+1e-12)});
  }
  const candidates=correlations.filter((x,i,a)=>x.correlation>=(a[i-1]?.correlation??-1)&&x.correlation>=(a[i+1]?.correlation??-1));
  candidates.sort((a,b)=>(b.correlation*(b.bpm>150?.95:1))-(a.correlation*(a.bpm>150?.95:1)));
  const guess=candidates[0]||correlations.sort((a,b)=>b.correlation-a.correlation)[0];
  let coarse=Number(bpmHint)||guess.bpm;if(coarse<50||coarse>200)throw Error('BPM 请填写 50–200 之间的数字。');
  const sample=t=>{const f=(t-n/2/sr)*100,i=Math.floor(f),w=f-i;if(i<0||i+1>=frames)return 0;return onset[i]*(1-w)+onset[i+1]*w;};
  let best={score:-Infinity,bpm:coarse,phase:0};
  const width=bpmHint?0:1.8,step=.02;
  for(let tempo=coarse-width;tempo<=coarse+width+.0001;tempo+=step){
    const beat=60/tempo;
    for(let p=0;p<40;p++){const phase=p*beat/40;let sum=0,count=0;for(let t=phase+beat*2;t<duration-.3;t+=beat){sum+=sample(t)+.25*sample(t+beat/2);count++;}const score=sum/(count||1);if(score>best.score)best={score,bpm:tempo,phase};}
    if(Math.round((tempo-coarse+width)/step)%20===0){onProgress(.57+.18*(tempo-coarse+width)/(width*2||1),'正在估计 BPM 和拍点……');await wait();}
  }
  const bpm=Math.round(best.bpm*100)/100,beat=60/bpm,lead=3*beat;
  const anchor=best.phase+Math.ceil((lead+.25-best.phase)/beat)*beat;
  const bars=Math.max(1,Math.floor((duration-anchor-beat*2)/(beat*4)));
  const count=bars>=30?6:bars>=10?3:1,scenes=['football','baby','dance','football','baby','dance'];
  const sections=[],events=[];let cursor=anchor,lastDirection=-1;
  const snap=t=>{let at=t,score=-Infinity;const center=Math.round((t-n/2/sr)*100),radius=Math.max(1,Math.round(Math.min(.055,beat*.12)*100));for(let f=Math.max(0,center-radius);f<=Math.min(frames-1,center+radius);f++){const time=f/100+n/2/sr,s=onset[f]-32*Math.abs(time-t);if(s>score){score=s;at=time;}}return Math.round(at*10000)/10000;};
  const frameAt=t=>Math.max(0,Math.min(frames-1,Math.round((t-n/2/sr)*100)));
  const difficultyScale={easy:1.5,normal:1,hard:.75}[difficulty]||1;
  for(let part=0;part<count;part++){
    const partBars=Math.floor(bars/count)+(part<bars%count?1:0),end=part===count-1?duration:cursor+partBars*4*beat,scene=scenes[part];
    sections.push({scene,name:({football:'球场节拍',baby:'奶蛙接拍',dance:'方向对拍'})[scene]+(part>=3?' · 返场':''),start:Math.round(cursor*10000)/10000,end:Math.round(end*10000)/10000});
    const lastBeat=(end-cursor)/beat-(part===count-1?2:6);let index=0;
    for(let position=0;position<lastBeat;index++){
      const expected=cursor+position*beat,frame=frameAt(expected),accent=onset[frame],at=snap(expected);
      let role,dir,gap;
      if(scene==='football'){role=['a','a','b','a','g','b','a','b'][index%8];if(difficulty==='easy'&&role==='b'&&index%2)role='a';gap=Math.max(role==='g'?1.5:1,Math.round(([2,2,1.5,2.5][index%4]*difficultyScale)*2)/2);}
      else if(scene==='baby'){role=index>0&&(accent>1.8||index%3===2)?'b':'a';gap=Math.max(1,Math.round(([2,2,1.5,2][index%4]*difficultyScale)*2)/2);}
      else {role='arrow';dir=color[frame]>.65?2:accent>2.5?1:[0,3,1,2][index%4];if(dir===lastDirection)dir=(dir+1)%4;lastDirection=dir;gap=Math.max(.5,Math.round(([1,1,1,.5][index%4]*difficultyScale)*2)/2);}
      const e={scene,segment:part,role,at};
      if(role==='b'){const next=snap(expected+beat/2);e.followAt=next>at+beat*.3?next:Math.round((at+beat/2)*10000)/10000;}
      if(role==='arrow'){e.dir=dir;e.side='player';events.push({...e,side:'npc',dir:(dir+1)%4,at:snap(expected-beat/2)});}
      events.push(e);position+=gap;
    }
    cursor=end;onProgress(.8+.18*(part+1)/count,'正在编排场景与操作……');await wait();
  }
  events.sort((a,b)=>a.at-b.at);
  if(!events.length)throw Error('这段音乐太短，无法生成可玩的谱面。');
  const confidence=Math.max(0,Math.min(1,guess.correlation));
  onProgress(1,'曲谱已生成');
  return {title:'上传音乐',duration,bpm,beat,firstBeat:anchor,sections,events,generated:true,difficulty,confidence,analysis:'local-signal'};
}};
