/* ============================================================
   PUBG 灵敏度调试助手 — 模块化 JS（动画优化 / 指针锁定校准版）
   ============================================================ */

/* ---- 全局状态 ---- */
const S = {
  dpi: 800,
  dpiCalibrated: false,
  seqRunning: false,
  tests: {
    tracking: { state:'idle', result:null },
    flick:    { state:'idle', result:null },
    turn:     { state:'idle', result:null },
  },
  finalResult: null,
  handlers: {},
  mouseInside: { tracking:false, flick:false, turn:false },
};

/* ---- 工具函数 ---- */
const clamp = (v,a,b)=>Math.min(Math.max(v,a),b);
const mapR  = (v,iMin,iMax,oMin,oMax)=>(v-iMin)*(oMax-oMin)/(iMax-iMin)+oMin;
const $ = id=>document.getElementById(id);

/* ---- Toast ---- */
function toast(msg){
  const t=$('toast');
  t.innerHTML='<span class="icon">✓</span>'+msg;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t=setTimeout(()=>t.classList.remove('show'),2000);
}

/* ---- Canvas 初始化 ---- */
function initCanvas(cv){
  const rect = cv.getBoundingClientRect();
  cv.width = rect.width;
  cv.height = rect.height;
  return cv.getContext('2d');
}

/* ---- 绘制：网格背景 ---- */
function drawGrid(ctx,w,h){
  ctx.fillStyle='#0a0e1a';
  ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='rgba(255,255,255,0.025)';
  ctx.lineWidth=1;
  for(let x=0;x<=w;x+=28){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
  for(let y=0;y<=h;y+=28){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
}

/* ---- 绘制：准星 ---- */
function drawCrosshair(ctx,x,y,color='#f0a020'){
  ctx.save();
  ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=2;
  ctx.shadowColor=color;ctx.shadowBlur=6;
  ctx.beginPath();ctx.moveTo(x-13,y);ctx.lineTo(x-4,y);ctx.moveTo(x+4,y);ctx.lineTo(x+13,y);ctx.stroke();
  ctx.beginPath();ctx.moveTo(x,y-13);ctx.lineTo(x,y-4);ctx.moveTo(x,y+4);ctx.lineTo(x,y+13);ctx.stroke();
  ctx.shadowBlur=0;ctx.fillRect(x-1,y-1,2,2);
  ctx.restore();
}

/* ---- 绘制：目标圆 ---- */
function drawTarget(ctx,x,y,r,glow=true){
  ctx.save();
  if(glow){ctx.shadowColor='#e85d1a';ctx.shadowBlur=12;}
  ctx.strokeStyle='#e85d1a';ctx.lineWidth=2.5;
  ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle='rgba(232,93,26,0.15)';
  ctx.beginPath();ctx.arc(x,y,r-2,0,Math.PI*2);ctx.fill();
  ctx.shadowBlur=0;ctx.fillStyle='#e85d1a';
  ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();
  ctx.restore();
}

/* ---- 绘制：倒计时数字（带动画） ---- */
function drawCountdownAnimated(ctx,w,h,num,scale,alpha,isGo){
  ctx.save();
  ctx.globalAlpha=clamp(alpha,0,1);
  ctx.translate(w/2,h/2);
  ctx.scale(scale,scale);
  ctx.fillStyle=isGo?'rgba(34,197,94,0.95)':'rgba(240,160,32,0.95)';
  ctx.font='bold 72px sans-serif';
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.shadowColor=isGo?'rgba(34,197,94,0.5)':'rgba(240,160,32,0.5)';
  ctx.shadowBlur=20;
  ctx.fillText(num,0,0);
  ctx.restore();
}

/* ---- 绘制：计时器 ---- */
function drawTimer(ctx,w,seconds){
  ctx.save();
  ctx.fillStyle='rgba(255,255,255,0.85)';
  ctx.font='bold 15px Consolas,monospace';
  ctx.textAlign='right';ctx.textBaseline='top';
  ctx.fillText(seconds.toFixed(1)+'s', w-12, 10);
  ctx.restore();
}

/* ---- 绘制：实时数据 ---- */
function drawStat(ctx,text,x,y,color='#94a3b8'){
  ctx.save();
  ctx.fillStyle=color;ctx.font='bold 13px sans-serif';
  ctx.textAlign='left';ctx.textBaseline='top';
  ctx.fillText(text,x,y);
  ctx.restore();
}

/* ---- 绘制：居中结果 ---- */
function drawCenterResult(ctx,w,h,big,small,color='rgba(34,197,94,0.9)'){
  ctx.save();
  ctx.fillStyle=color;ctx.font='bold 28px sans-serif';
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(big,w/2,h/2-8);
  ctx.font='13px sans-serif';ctx.fillStyle='rgba(255,255,255,0.5)';
  ctx.fillText(small,w/2,h/2+18);
  ctx.restore();
}

/* ---- 叠加层淡入淡出 ---- */
function fadeOverlay(ov){ ov.classList.add('fade'); setTimeout(()=>ov.classList.add('hidden'),350); }
function showOverlay(ov,html){
  ov.classList.remove('hidden');
  void ov.offsetWidth;            // 触发重排以重启过渡
  ov.classList.remove('fade');
  if(html) ov.innerHTML=html;
}

/* ============================================================
   DPI 选择 & 校准（指针锁定）
   ============================================================ */
$('dpiSelect').addEventListener('change',e=>{
  if(e.target.value==='calib'){
    $('calibPanel').classList.add('show');
    initCalibCanvas();
    $('btnCalib').classList.add('done');
    $('btnCalib').innerHTML='已选择校准';
  } else {
    S.dpi = parseInt(e.target.value);
    S.dpiCalibrated = false;
    $('calibPanel').classList.remove('show');
    $('btnCalib').classList.remove('done');
    $('btnCalib').innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/></svg>校准';
    updateDpiStatus();
  }
});

function updateDpiStatus(){
  const el=$('dpiStatus');
  if(S.dpiCalibrated){
    el.className='dpi-status';
    el.textContent='已校准 · '+S.dpi+' DPI';
  } else {
    el.className='dpi-status unknown';
    el.textContent='未校准 · 默认 '+S.dpi;
  }
}

$('btnCalib').addEventListener('click',()=>{
  const panel=$('calibPanel');
  if(panel.classList.contains('show')){ panel.classList.remove('show'); }
  else { panel.classList.add('show'); initCalibCanvas(); }
});
$('btnCalibClose').addEventListener('click',()=>{
  if(document.pointerLockElement===$('cv-calib')) document.exitPointerLock();
  $('calibPanel').classList.remove('show');
});

/* ---- 校准 Canvas ---- */
const CALIB_REF = 6000;   // 进度条参考像素（仅视觉反馈，不影响精度）
let calibCtx=null, calibW=0, calibH=0;
let calibMouse={x:-100,y:-100};
let calibMeasuring=false, calibLocked=false, calibPxAcc=0;
let calibVx=0, calibVy=0;
const calibCanvas=$('cv-calib');

function initCalibCanvas(){
  calibCtx=initCanvas(calibCanvas);
  calibW=calibCanvas.width; calibH=calibCanvas.height;
  calibVx=calibW/2; calibVy=calibH/2;
  drawGrid(calibCtx,calibW,calibH);
  calibCtx.save();
  calibCtx.fillStyle='rgba(0,212,255,0.4)';calibCtx.font='13px sans-serif';calibCtx.textAlign='center';
  calibCtx.fillText('点击「开始测量」，光标将锁定在本框内', calibW/2, calibH/2);
  calibCtx.restore();
  $('calibFill').style.width='0%';
}

calibCanvas.addEventListener('mousemove',e=>{
  if(calibMeasuring) return;  // 测量时由 document 监听处理
  const r=calibCanvas.getBoundingClientRect();
  calibMouse.x=e.clientX-r.left; calibMouse.y=e.clientY-r.top;
  drawGrid(calibCtx,calibW,calibH);
  drawCrosshair(calibCtx,calibMouse.x,calibMouse.y,'#00d4ff');
});

document.addEventListener('mousemove',e=>{
  if(!calibMeasuring || !calibW) return;
  const mx=e.movementX||0, my=e.movementY||0;
  calibPxAcc+=Math.abs(mx);
  calibVx=(calibVx+mx)%calibW; if(calibVx<0)calibVx+=calibW;
  calibVy=(calibVy+my)%calibH; if(calibVy<0)calibVy+=calibH;
  const dpiLive=Math.round(calibPxAcc*2.54/10);
  $('calibPx').textContent=calibPxAcc;
  $('calibVal').textContent=dpiLive;
  $('calibFill').style.width=Math.min(100,calibPxAcc/CALIB_REF*100)+'%';
  $('btnCalibConfirm').disabled=calibPxAcc<50;
  drawGrid(calibCtx,calibW,calibH);
  drawCrosshair(calibCtx,calibVx,calibVy,'#00d4ff');
  calibCtx.save();
  calibCtx.fillStyle='rgba(0,212,255,0.65)';calibCtx.font='12px sans-serif';calibCtx.textAlign='center';
  calibCtx.fillText('移动像素 '+calibPxAcc+' → 约 '+dpiLive+' DPI', calibW/2, 14);
  calibCtx.restore();
});

function startCalibMeasure(){
  calibMeasuring=true; calibPxAcc=0; calibVx=calibW/2; calibVy=calibH/2;
  fadeOverlay($('ov-calib'));
  $('calibFill').style.width='0%';
  $('btnCalibConfirm').disabled=true;
  toast('开始测量：移动鼠标完成 10cm');
}
function requestCalibLock(){
  if(calibCanvas.requestPointerLock){
    try{ calibCanvas.requestPointerLock(); return; }catch(err){ /* fall through */ }
  }
  startCalibMeasure();  // 浏览器不支持指针锁定时回退
}

$('btnCalibStart').addEventListener('click',requestCalibLock);
$('btnCalibRetry').addEventListener('click',requestCalibLock);

document.addEventListener('pointerlockchange',()=>{
  if(document.pointerLockElement===calibCanvas){
    calibLocked=true; calibMeasuring=true;
    calibPxAcc=0; calibVx=calibW/2; calibVy=calibH/2;
    fadeOverlay($('ov-calib'));
    $('calibFill').style.width='0%';
    $('btnCalibConfirm').disabled=true;
    toast('指针已锁定在本框内，移动鼠标完成 10cm 后按 ESC');
  } else if(calibLocked){
    calibLocked=false; calibMeasuring=false;  // 退出锁定即暂停，保留已测值
  }
});

$('btnCalibConfirm').addEventListener('click',()=>{
  if(calibLocked){ document.exitPointerLock(); toast('已退出锁定，请点击「采用此 DPI」'); return; }
  if(calibPxAcc<50){ toast('移动距离太短，请重测'); return; }
  const dpi=Math.round(calibPxAcc*2.54/10);
  S.dpi=dpi; S.dpiCalibrated=true; calibMeasuring=false;
  $('dpiSelect').value='calib';
  updateDpiStatus();
  toast('DPI 已校准为 '+dpi);
  $('calibPanel').classList.remove('show');
  $('btnCalib').classList.add('done');
  $('btnCalib').innerHTML='已校准 '+dpi;
});

/* ============================================================
   通用测试控制：统一倒计时 + 触发（动画优化）
   ============================================================ */
function startTest(name, onComplete){
  const card=$('card-'+name);
  const cv=$('cv-'+name);
  const ov=$('ov-'+name);
  const ctx=initCanvas(cv);
  const w=cv.width,h=cv.height;

  S.tests[name]={state:'waiting',result:null};
  card.classList.add('active','waiting');card.classList.remove('done');
  showOverlay(ov,'<div class="hint-icon">🎯</div><div class="hint-text">将鼠标移入此区域</div><div class="hint-sub">准备开始 3 秒倒计时</div>');

  const btn=card.querySelector('.btn-test');
  btn.disabled=true;btn.textContent='测试中...';
  drawGrid(ctx,w,h);

  function runCountdown(){
    const seq=['3','2','1','GO!'];
    let idx=0;
    function showNum(){
      const num=seq[idx];
      const isGo=num==='GO!';
      const start=performance.now();
      const dur=isGo?480:680;
      function anim(){
        const t=Math.min(1,(performance.now()-start)/dur);
        drawGrid(ctx,w,h);
        const scale = isGo ? (1 + (1-t)*0.45) : (1.7 - 0.7*t);
        let alpha = t<0.22 ? t/0.22 : (t>0.82 ? 1-(t-0.82)/0.18*0.7 : 1);
        drawCountdownAnimated(ctx,w,h,num,scale,alpha,isGo);
        if(t<1) requestAnimationFrame(anim);
        else{
          idx++;
          if(idx<seq.length) setTimeout(showNum,110);
          else setTimeout(()=>S.handlers[name].begin(ctx,w,h,cv,onComplete),330);
        }
      }
      requestAnimationFrame(anim);
    }
    showNum();
  }

  if(S.mouseInside[name]){
    setTimeout(runCountdown,300);
  } else {
    const onEnter=()=>{ cv.removeEventListener('mouseenter',onEnter); runCountdown(); };
    cv.addEventListener('mouseenter',onEnter);
  }
}

/* ============================================================
   测试 1：追踪测试
   ============================================================ */
function setupTracking(){
  const cv=$('cv-tracking');
  const ctx=initCanvas(cv);const w=cv.width,h=cv.height;
  let mouse={x:-100,y:-100};
  cv.addEventListener('mousemove',e=>{
    const r=cv.getBoundingClientRect();mouse.x=e.clientX-r.left;mouse.y=e.clientY-r.top;
  });
  cv.addEventListener('mouseenter',()=>S.mouseInside.tracking=true);
  cv.addEventListener('mouseleave',()=>{S.mouseInside.tracking=false;mouse.x=-100;mouse.y=-100;});

  S.handlers.tracking={
    begin(ctx,w,h,cv,onComplete){
      const ov=$('ov-tracking'); fadeOverlay(ov);
      const startTime=Date.now();const duration=10000;
      let target={x:w/2,y:h/2};
      let onTargetTime=0,lastFrame=Date.now(),totalElapsed=0;
      const targetR=26;
      function loop(){
        const now=Date.now();const elapsed=now-startTime;
        const remaining=Math.max(0,duration-elapsed);
        const dt=now-lastFrame;lastFrame=now;totalElapsed=elapsed;
        const t=elapsed/1000;
        target.x=clamp(w/2+Math.sin(t*0.9)*(w*0.32)+Math.cos(t*1.7)*(w*0.08),30,w-30);
        target.y=clamp(h/2+Math.cos(t*1.1)*(h*0.28)+Math.sin(t*2.3)*(h*0.06),30,h-30);
        const dist=Math.hypot(mouse.x-target.x,mouse.y-target.y);
        if(dist<targetR)onTargetTime+=dt;
        drawGrid(ctx,w,h);
        ctx.save();ctx.strokeStyle='rgba(232,93,26,0.08)';ctx.lineWidth=1;ctx.beginPath();
        for(let i=0;i<40;i++){const tt=t-0.4+i*0.02;
          const px=w/2+Math.sin(tt*0.9)*(w*0.32)+Math.cos(tt*1.7)*(w*0.08);
          const py=h/2+Math.cos(tt*1.1)*(h*0.28)+Math.sin(tt*2.3)*(h*0.06);
          if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);}
        ctx.stroke();ctx.restore();
        const isOn=dist<targetR;drawTarget(ctx,target.x,target.y,targetR,isOn);
        if(isOn){ctx.save();ctx.strokeStyle='rgba(34,197,94,0.5)';ctx.lineWidth=2;
          ctx.beginPath();ctx.arc(target.x,target.y,targetR+6,0,Math.PI*2);ctx.stroke();ctx.restore();}
        if(mouse.x>0)drawCrosshair(ctx,mouse.x,mouse.y);
        drawTimer(ctx,w,remaining/1000);
        const acc=totalElapsed>100?Math.round(onTargetTime/totalElapsed*100):0;
        drawStat(ctx,'精准度: '+acc+'%',12,10,'#f0a020');
        if(remaining>0)requestAnimationFrame(loop);
        else finish(ctx,w,h,cv,acc,onComplete);
      }
      requestAnimationFrame(loop);
    }
  };
  function finish(ctx,w,h,cv,acc,onComplete){
    S.tests.tracking.state='completed';
    S.tests.tracking.result={accuracy:clamp(acc,0,100)};
    $('card-tracking').classList.remove('active','waiting');$('card-tracking').classList.add('done');
    const v=S.tests.tracking.result.accuracy;
    const cls=v>=70?'green':(v>=45?'':'red');
    $('res-tracking').innerHTML='追踪精准度: <span class="val '+cls+'">'+v+'%</span>';
    setCardRetake('tracking');
    drawGrid(ctx,w,h);drawCenterResult(ctx,w,h,v+'%','追踪精准度');
    checkAllDone();if(onComplete)onComplete();
  }
}

/* ============================================================
   测试 2：定位测试
   ============================================================ */
function setupFlick(){
  const cv=$('cv-flick');
  const ctx=initCanvas(cv);const w=cv.width,h=cv.height;
  let mouse={x:-100,y:-100};
  cv.addEventListener('mousemove',e=>{
    const r=cv.getBoundingClientRect();mouse.x=e.clientX-r.left;mouse.y=e.clientY-r.top;
  });
  cv.addEventListener('mouseenter',()=>S.mouseInside.flick=true);
  cv.addEventListener('mouseleave',()=>{S.mouseInside.flick=false;mouse.x=-100;mouse.y=-100;});

  S.handlers.flick={
    begin(ctx,w,h,cv,onComplete){
      const ov=$('ov-flick'); fadeOverlay(ov);
      const startTime=Date.now();const duration=10000;
      let target=null,hits=0,reactionTimes=[],spawnTime=0;const targetR=22;
      function spawn(){const m=35;
        target={x:m+Math.random()*(w-m*2),y:m+Math.random()*(h-m*2),r:targetR,spawnTime:Date.now()};
        spawnTime=target.spawnTime;}
      spawn();
      function loop(){
        const now=Date.now();const elapsed=now-startTime;const remaining=Math.max(0,duration-elapsed);
        if(target&&mouse.x>0){
          const d=Math.hypot(mouse.x-target.x,mouse.y-target.y);
          if(d<target.r){hits++;reactionTimes.push(now-spawnTime);spawn();}
        }
        drawGrid(ctx,w,h);
        if(target){
          const age=now-spawnTime;const pulse=1+Math.sin(age*0.005)*0.08;
          drawTarget(ctx,target.x,target.y,target.r*pulse,true);
          if(age<300){ctx.save();ctx.strokeStyle='rgba(240,160,32,'+(1-age/300)*0.6+')';ctx.lineWidth=2;
            ctx.beginPath();ctx.arc(target.x,target.y,target.r+10+age/20,0,Math.PI*2);ctx.stroke();ctx.restore();}
        }
        if(mouse.x>0)drawCrosshair(ctx,mouse.x,mouse.y);
        drawTimer(ctx,w,remaining/1000);
        drawStat(ctx,'命中: '+hits,12,10,'#f0a020');
        const avg=reactionTimes.length?Math.round(reactionTimes.reduce((a,b)=>a+b,0)/reactionTimes.length):0;
        if(avg>0)drawStat(ctx,'平均反应: '+avg+'ms',12,28,'#94a3b8');
        if(remaining>0)requestAnimationFrame(loop);
        else finish(ctx,w,h,cv,hits,avg,onComplete);
      }
      requestAnimationFrame(loop);
    }
  };
  function finish(ctx,w,h,cv,hits,avg,onComplete){
    S.tests.flick.state='completed';
    S.tests.flick.result={hits:hits,avgReaction:avg||9999};
    $('card-flick').classList.remove('active','waiting');$('card-flick').classList.add('done');
    const cls=hits>=12?'green':(hits>=6?'':'red');
    $('res-flick').innerHTML='命中 <span class="val '+cls+'">'+hits+'</span> 次 · 反应 <span class="val">'+(avg||0)+'ms</span>';
    setCardRetake('flick');
    drawGrid(ctx,w,h);drawCenterResult(ctx,w,h,hits+' 命中','平均反应 '+(avg||0)+'ms');
    checkAllDone();if(onComplete)onComplete();
  }
}

/* ============================================================
   测试 3：360° 转身测试
   ============================================================ */
function setupTurn(){
  const cv=$('cv-turn');
  const ctx=initCanvas(cv);const w=cv.width,h=cv.height;
  let mouse={x:-100,y:-100};
  cv.addEventListener('mousemove',e=>{
    const r=cv.getBoundingClientRect();mouse.x=e.clientX-r.left;mouse.y=e.clientY-r.top;
  });
  cv.addEventListener('mouseenter',()=>S.mouseInside.turn=true);
  cv.addEventListener('mouseleave',()=>{S.mouseInside.turn=false;mouse.x=-100;mouse.y=-100;});

  S.handlers.turn={
    begin(ctx,w,h,cv,onComplete){
      const ov=$('ov-turn'); fadeOverlay(ov);
      const startTime=Date.now();const duration=10000;
      let totalPx=0,dialAngle=0;
      function onMove(e){
        const mx=e.movementX||0;
        totalPx+=Math.abs(mx);dialAngle+=mx*0.5;
      }
      cv.addEventListener('mousemove',onMove);
      function loop(){
        const now=Date.now();const elapsed=now-startTime;const remaining=Math.max(0,duration-elapsed);
        drawGrid(ctx,w,h);
        const cx=w/2,cy=h/2-5;
        ctx.save();
        ctx.strokeStyle='#1e2438';ctx.lineWidth=3;ctx.beginPath();ctx.arc(cx,cy,58,0,Math.PI*2);ctx.stroke();
        for(let i=0;i<12;i++){const a=i*Math.PI/6;ctx.strokeStyle='rgba(255,255,255,0.1)';ctx.lineWidth=1;
          ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*50,cy+Math.sin(a)*50);ctx.lineTo(cx+Math.cos(a)*58,cy+Math.sin(a)*58);ctx.stroke();}
        ctx.translate(cx,cy);ctx.rotate(dialAngle*Math.PI/180);
        ctx.strokeStyle='#f0a020';ctx.lineWidth=2.5;ctx.shadowColor='#f0a020';ctx.shadowBlur=8;
        ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-52);ctx.stroke();
        ctx.fillStyle='#f0a020';ctx.beginPath();ctx.moveTo(0,-52);ctx.lineTo(-5,-42);ctx.lineTo(5,-42);ctx.closePath();ctx.fill();
        ctx.restore();
        ctx.save();ctx.fillStyle='#e85d1a';ctx.beginPath();ctx.arc(cx,cy,4,0,Math.PI*2);ctx.fill();ctx.restore();
        ctx.save();ctx.fillStyle='rgba(255,255,255,0.4)';ctx.font='bold 12px sans-serif';ctx.textAlign='center';ctx.fillText('N',cx,cy-68);ctx.restore();
        const totalCm=S.dpiCalibrated?totalPx/S.dpi*2.54:totalPx/800*2.54;
        const speed=elapsed>0?(totalCm/(elapsed/1000)):0;
        drawTimer(ctx,w,remaining/1000);
        drawStat(ctx,'移动距离: '+totalCm.toFixed(1)+' cm',12,10,'#f0a020');
        drawStat(ctx,'速度: '+speed.toFixed(1)+' cm/s',12,28,'#94a3b8');
        ctx.save();ctx.fillStyle='rgba(255,255,255,0.3)';ctx.font='12px sans-serif';ctx.textAlign='center';ctx.fillText('左右移动鼠标进行转身',w/2,h-18);ctx.restore();
        if(remaining>0)requestAnimationFrame(loop);
        else{finish(ctx,w,h,cv,totalPx,totalCm,speed,onMove,onComplete);}
      }
      requestAnimationFrame(loop);
    }
  };
  function finish(ctx,w,h,cv,totalPx,totalCm,speed,onMove,onComplete){
    cv.removeEventListener('mousemove',onMove);
    S.tests.turn.state='completed';
    S.tests.turn.result={totalCm:totalCm,totalPx:totalPx,avgSpeed:speed};
    $('card-turn').classList.remove('active','waiting');$('card-turn').classList.add('done');
    $('res-turn').innerHTML='移动 <span class="val">'+totalCm.toFixed(1)+' cm</span> · '+speed.toFixed(1)+' cm/s';
    setCardRetake('turn');
    drawGrid(ctx,w,h);drawCenterResult(ctx,w,h,totalCm.toFixed(1)+' cm','10秒总移动距离');
    checkAllDone();if(onComplete)onComplete();
  }
}

/* ---- 设置卡片为「重新测试」 ---- */
function setCardRetake(name){
  const card=$('card-'+name);
  const btn=card.querySelector('.btn-test');
  btn.disabled=false;btn.textContent='重新测试';btn.classList.add('retake');
}

/* ============================================================
   顺序执行全部测试
   ============================================================ */
$('btnStartAll').addEventListener('click',()=>{
  if(S.seqRunning)return;
  S.seqRunning=true;
  $('btnStartAll').disabled=true;
  const order=['tracking','flick','turn'];
  const names={tracking:'追踪测试',flick:'定位测试',turn:'360°转身测试'};
  let i=0;
  function runNext(){
    if(i>=order.length){
      S.seqRunning=false;
      $('seqStatus').innerHTML='<span class="now">✓ 全部测试完成</span> · 点击下方生成灵敏度';
      $('btnStartAll').disabled=false;
      $('btnStartAll').innerHTML='重新全部测试';
      return;
    }
    const name=order[i];
    const card=$('card-'+name);
    card.classList.add('active');
    card.scrollIntoView({behavior:'smooth',block:'center'});
    $('seqStatus').innerHTML='测试 <span class="now">'+(i+1)+'/3</span>：'+names[name]+' — 请准备鼠标';
    startTest(name,()=>{ i++; setTimeout(runNext,1600); });
  }
  runNext();
});

/* ---- 单项测试按钮 ---- */
document.querySelectorAll('.btn-test').forEach(btn=>{
  btn.addEventListener('click',()=>{
    if(S.seqRunning)return;
    const name=btn.dataset.test;
    $('card-'+name).scrollIntoView({behavior:'smooth',block:'center'});
    startTest(name,null);
  });
});

/* ============================================================
   检查全部完成
   ============================================================ */
function checkAllDone(){
  const done=S.tests.tracking.result&&S.tests.flick.result&&S.tests.turn.result;
  $('btnGen').disabled=!done;
  if(done){
    $('genStatus').innerHTML='<span class="check">✓ 三项测试已全部完成，点击生成你的专属灵敏度</span>';
  } else {
    const c=[S.tests.tracking.result,S.tests.flick.result,S.tests.turn.result].filter(Boolean).length;
    $('genStatus').textContent='已完成 '+c+'/3 项测试';
  }
}

/* ============================================================
   打法分类 + 灵敏度生成（优化版）
   ============================================================ */
function classifyPlaystyle(acc,flickScore){
  if(acc>=70&&flickScore>=65)return{name:'全能突击型',desc:'追踪与定位俱佳，适合近中距离高强度对抗，灵敏度可偏高'};
  if(acc>=70&&flickScore<50)return{name:'稳定跟枪型',desc:'控枪稳定但甩枪偏慢，适合中远距离点射与压枪'};
  if(acc<50&&flickScore>=65)return{name:'敏捷甩枪型',desc:'瞬时定位强但跟枪不稳，适合贴脸近战与突袭'};
  if(acc<50&&flickScore<50)return{name:'稳健发育型',desc:'整体偏保守，建议较低灵敏度优先保证命中率'};
  return{name:'均衡型',desc:'追踪与定位较为均衡，常规配置即可胜任多数场景'};
}

function generateSensitivity(){
  const tr=S.tests.tracking.result,fl=S.tests.flick.result,tn=S.tests.turn.result;
  const acc=tr.accuracy;
  const hits=fl.hits,react=fl.avgReaction;
  const totalCm=tn.totalCm,totalPx=tn.totalPx;
  const dpi=S.dpi;
  const flickScore=clamp(mapR(hits,0,18,0,60)+mapR(react,1400,280,0,40),0,100);

  /* 常规灵敏度：由 360° 移动幅度主导 */
  let general = S.dpiCalibrated ? mapR(totalCm,5,55,68,30) : mapR(totalPx,2500,16000,68,30);
  general=clamp(general,25,75);
  general+=(acc-50)*0.12;
  general+=(flickScore-50)*0.06;
  general=clamp(Math.round(general),25,75);

  /* 其余按比例推导 */
  let ads=clamp(Math.round(general*0.92),25,75);
  let scope=clamp(Math.round(general*0.85),25,75);
  let zoom=clamp(Math.round(general*0.72),25,75);

  /* 垂直灵敏度增强 */
  let vertical=1.0;
  if(acc<45)vertical+=0.10;else if(acc<60)vertical+=0.05;
  if(flickScore>75)vertical-=0.04;
  if(react>900)vertical-=0.03;
  vertical=clamp(parseFloat(vertical.toFixed(2)),0.70,1.30);

  /* cm/360 */
  const cm360=S.dpiCalibrated
    ? (1440000/(dpi*general)).toFixed(1)
    : ((1440000/(800*general)).toFixed(1)+' (估算)');

  const playstyle=classifyPlaystyle(acc,flickScore);
  return {general,vertical,ads,scope,zoom,cm360,playstyle};
}

/* ============================================================
   建议 + 评分 + 结果
   ============================================================ */
function generateSuggestions(r){
  const tr=S.tests.tracking.result,fl=S.tests.flick.result,tn=S.tests.turn.result;
  const list=[];
  if(tr.accuracy>=75) list.push('追踪精准度 <strong>'+tr.accuracy+'%</strong>，控枪能力出色，当前灵敏度可胜任高强度跟枪。');
  else if(tr.accuracy>=55) list.push('追踪精准度 <strong>'+tr.accuracy+'%</strong>，建议在训练场多练跟枪，可微调常规灵敏度 ±2 点找手感。');
  else list.push('追踪精准度 <strong>'+tr.accuracy+'%</strong>，建议降低常规灵敏度 2-3 点提升跟枪稳定性。');

  if(fl.hits>=14) list.push('定位命中 <strong>'+fl.hits+' 次</strong>、反应 <strong>'+fl.avgReaction+'ms</strong>，快速瞄准出色，适合近战激进打法。');
  else if(fl.hits>=8) list.push('定位命中 <strong>'+fl.hits+' 次</strong>，可提高瞄准灵敏度 2 点加快定位，并加强甩枪练习。');
  else list.push('定位命中 <strong>'+fl.hits+' 次</strong>，建议降低瞄准灵敏度 2-3 点先保精度，熟练后再升。');

  if(tn.totalCm<15) list.push('10秒移动 <strong>'+tn.totalCm.toFixed(1)+' cm</strong>，属<strong>手腕型玩家</strong>，较高灵敏度适合你，注意手腕休息。');
  else if(tn.totalCm>45) list.push('10秒移动 <strong>'+tn.totalCm.toFixed(1)+' cm</strong>，属<strong>手臂型玩家</strong>，较低灵敏度更能发挥优势，确保鼠标垫空间充足。');
  else list.push('10秒移动 <strong>'+tn.totalCm.toFixed(1)+' cm</strong>，属<strong>混合型玩家</strong>，当前配置较为均衡。');

  list.push('操作风格：<strong>'+r.playstyle.name+'</strong> — '+r.playstyle.desc+'。');
  list.push('垂直灵敏度建议与常规灵敏度协调（当前 <strong>'+r.vertical+'</strong>），差值过大易压枪不稳。');
  list.push('倍镜灵敏度建议比开镜模式低 3-5 点（当前倍镜 <strong>'+r.zoom+'</strong> vs 开镜 <strong>'+r.scope+'</strong>），利于远距离精准射击。');
  list.push('预估 cm/360 为 <strong>'+r.cm360+' cm</strong>，可对照职业选手进一步优化。建议在训练场中每次微调不超过 2-3 点验证。');
  return list;
}

function calcPerfScores(){
  const tr=S.tests.tracking.result,fl=S.tests.flick.result,tn=S.tests.turn.result;
  const trackScore=Math.round(tr.accuracy);
  const flickScore=Math.round(clamp(mapR(fl.hits,0,18,0,60)+mapR(fl.avgReaction,1400,280,0,40),0,100));
  const turnScore=Math.round(clamp(100-Math.abs(tn.totalPx-7000)*0.15,20,100));
  const overall=Math.round((trackScore+flickScore+turnScore)/3);
  return {trackScore,flickScore,turnScore,overall};
}

function displayResults(){
  const r=generateSensitivity();
  S.finalResult=r;
  const items=[
    {label:'常规灵敏度',value:r.general},
    {label:'垂直灵敏度增强',value:r.vertical},
    {label:'瞄准灵敏度',value:r.ads},
    {label:'开镜模式灵敏度',value:r.scope},
    {label:'倍镜灵敏度',value:r.zoom},
  ];
  $('sensGrid').innerHTML=items.map(it=>`
    <div class="sens-item">
      <button class="copy-btn" onclick="copySingle('${it.label}', ${it.value})" title="复制">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
      </button>
      <div class="label">${it.label}</div>
      <div class="value">${it.value}</div>
    </div>`).join('');

  $('playstyleName').textContent=r.playstyle.name;
  $('playstyleDesc').textContent=r.playstyle.desc;

  const cmStr=String(r.cm360);
  const estimated=cmStr.includes('(估算)');
  $('cm360Val').textContent=cmStr.replace(' (估算)','')+' cm'+(estimated?'（估算）':'');
  const num=parseFloat(cmStr);
  $('cm360Desc').textContent = num<25?'较高灵敏度 · 适合近战 wrist-aimer' : num>50?'较低灵敏度 · 适合精准 arm-aimer' : '中等灵敏度 · 均衡型配置';

  const scores=calcPerfScores();
  setTimeout(()=>{
    $('bar-track').style.width=scores.trackScore+'%';$('val-track').textContent=scores.trackScore;
    $('bar-flick').style.width=scores.flickScore+'%';$('val-flick').textContent=scores.flickScore;
    $('bar-turn').style.width=scores.turnScore+'%';$('val-turn').textContent=scores.turnScore;
    $('bar-overall').style.width=scores.overall+'%';$('val-overall').textContent=scores.overall;
  },120);

  $('sugList').innerHTML=generateSuggestions(r).map(s=>'<li>'+s+'</li>').join('');
  $('resultsSection').classList.add('show');
  setTimeout(()=>$('resultsSection').scrollIntoView({behavior:'smooth',block:'start'}),200);
}

/* ============================================================
   复制 & 生成
   ============================================================ */
window.copySingle=function(label,value){
  navigator.clipboard.writeText(String(value)).then(()=>toast('已复制: '+label+' = '+value));
};
$('btnCopyAll').addEventListener('click',()=>{
  if(!S.finalResult)return;
  const r=S.finalResult;
  const text=[
    '=== PUBG 专属灵敏度配置 ===',
    '常规灵敏度: '+r.general,
    '垂直灵敏度增强: '+r.vertical,
    '瞄准灵敏度: '+r.ads,
    '开镜模式灵敏度: '+r.scope,
    '倍镜灵敏度: '+r.zoom,
    '预估 cm/360: '+r.cm360+' cm',
    '操作风格: '+r.playstyle.name,
    'DPI: '+(S.dpiCalibrated?S.dpi+' (校准)':S.dpi+' (默认)'),
    '===========================',
  ].join('\n');
  navigator.clipboard.writeText(text).then(()=>toast('已复制全部灵敏度配置'));
});
$('btnGen').addEventListener('click',()=>{displayResults();toast('灵敏度配置已生成');});

/* ============================================================
   初始化 & 自适应
   ============================================================ */
window.addEventListener('load',()=>{
  setupTracking();setupFlick();setupTurn();
  updateDpiStatus();
});
let resizeTimer;
window.addEventListener('resize',()=>{
  clearTimeout(resizeTimer);
  resizeTimer=setTimeout(()=>{
    ['tracking','flick','turn'].forEach(n=>{
      if(S.tests[n].state==='idle'){
        const cv=$('cv-'+n);const ctx=initCanvas(cv);
        drawGrid(ctx,cv.width,cv.height);
      }
    });
    if($('calibPanel').classList.contains('show'))initCalibCanvas();
  },300);
});
