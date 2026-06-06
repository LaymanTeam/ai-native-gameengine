/**
 * Code phase — turn an approved GDD into an actual playable game as a single self-contained HTML
 * file (canvas + inline script, no external deps). The coder MODEL writes it when GOOGLE_API_KEY is
 * present; otherwise (or on failure) a deterministic template themed by the GDD is used, so the code
 * phase always yields a runnable game. Served by app/api/games/[slug] and embedded in the Studio.
 *
 * This is the pragmatic first cut of the coder's output (engine/ai/agents/coder.ts targets the
 * richer multi-file bitECS/PixiJS tree); a single-file build is reliable and instantly playable.
 */
import { createCoderModel } from './providers';
import type { GameDesignDocument } from './agents/designer';

const CODEGEN_LOG_PREFIX = '[engine/ai/codegen]';

/** Deterministic, dependency-free playable game themed by the GDD (keyless + fallback path). */
export function buildLocalGameHtml(gdd: GameDesignDocument): string {
  const isShooter = /shoot|action|surviv|arena|defen/i.test(`${gdd.genre} ${gdd.coreMechanic}`);
  const cfg = JSON.stringify({
    title: gdd.title,
    genre: gdd.genre,
    mechanic: gdd.coreMechanic,
    win: gdd.winCondition,
    lose: gdd.loseCondition,
    shooter: isShooter,
  });
  // NOTE: the embedded <script> uses no ${} interpolation except the injected CFG const below.
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(gdd.title)}</title>
<style>
  html,body{margin:0;height:100%;background:#0d0f14;color:#ecebe4;font-family:system-ui,sans-serif;overflow:hidden}
  #c{display:block;width:100vw;height:100vh}
  #hud{position:fixed;top:14px;left:16px;right:16px;display:flex;justify-content:space-between;pointer-events:none;font-size:13px}
  #t{position:fixed;bottom:12px;left:0;right:0;text-align:center;color:#8f8c82;font-size:12px}
  .hp{width:180px;height:7px;background:rgba(255,255,255,.14);border-radius:4px;overflow:hidden}
  .hp>i{display:block;height:100%;background:linear-gradient(90deg,#c2a77f,#aebf86)}
  #o{position:fixed;inset:0;display:none;place-items:center;background:rgba(0,0,0,.55);text-align:center}
  #o div{font-size:30px;font-weight:600}#o p{color:#cfcdc4}
</style></head>
<body>
<canvas id="c"></canvas>
<div id="hud"><div><div style="font-size:10px;letter-spacing:.15em;color:#9b988f;text-transform:uppercase">HP</div><div class="hp"><i id="hpf"></i></div></div>
<div style="text-align:right"><div id="sc" style="font-size:22px;font-weight:600">0</div><div id="tm" style="color:#9b988f"></div></div></div>
<div id="t">${escapeHtml(gdd.title)} — WASD / arrows to move${isShooter ? ' · auto-fire' : ''} · R to restart</div>
<div id="o"><div><div id="ot"></div><p id="op"></p></div></div>
<script>
const CFG=${cfg};
const cv=document.getElementById('c'),x=cv.getContext('2d'),dpr=devicePixelRatio||1;
let W=0,H=0;function fit(){W=innerWidth;H=innerHeight;cv.width=W*dpr;cv.height=H*dpr;x.setTransform(dpr,0,0,dpr,0,0);}fit();addEventListener('resize',fit);
const keys={};addEventListener('keydown',e=>{keys[e.key.toLowerCase()]=true;if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(e.key.toLowerCase()))e.preventDefault();if(e.key.toLowerCase()==='r'&&over)reset();});
addEventListener('keyup',e=>{keys[e.key.toLowerCase()]=false;});
const ENEMY=['#e71d36','#ffb13d','#8ea1ab'];let P,en,sh,orbs,t,score,over,moved;
function reset(){P={x:W/2,y:H/2,hp:120};en=[];sh=[];orbs=[];t=0;score=0;over=null;moved=false;document.getElementById('o').style.display='none';loop();}
function spawn(){const e=(Math.random()*4)|0;let ex,ey;if(e===0){ex=0;ey=Math.random()*H;}else if(e===1){ex=W;ey=Math.random()*H;}else if(e===2){ex=Math.random()*W;ey=0;}else{ex=Math.random()*W;ey=H;}en.push({x:ex,y:ey,c:ENEMY[(Math.random()*3)|0],s:.6+Math.random()*.6,r:7+Math.random()*4,hp:18});}
function end(w){over=w;document.getElementById('ot').textContent=w?'You win':'You fell';document.getElementById('op').textContent='Score '+score+' · press R to restart';document.getElementById('o').style.display='grid';}
function loop(){if(over)return;t++;const sec=t/60;
 let mx=0,my=0;if(keys['a']||keys['arrowleft'])mx--;if(keys['d']||keys['arrowright'])mx++;if(keys['w']||keys['arrowup'])my--;if(keys['s']||keys['arrowdown'])my++;
 if(mx||my){moved=true;const d=Math.hypot(mx,my);P.x+=mx/d*4.2;P.y+=my/d*4.2;}else if(!moved){P.x=W/2+Math.cos(t*.02)*W*.2;P.y=H/2+Math.sin(t*.025)*H*.18;}
 P.x=Math.max(12,Math.min(W-12,P.x));P.y=Math.max(12,Math.min(H-12,P.y));
 if(t%Math.max(12,40-((sec)|0))===0&&en.length<40)spawn();
 x.fillStyle='#0d0f14';x.fillRect(0,0,W,H);x.strokeStyle='rgba(255,255,255,.05)';for(let i=0;i<W;i+=46){x.beginPath();x.moveTo(i,0);x.lineTo(i,H);x.stroke();}for(let j=0;j<H;j+=46){x.beginPath();x.moveTo(0,j);x.lineTo(W,j);x.stroke();}
 for(const e of en){const dx=P.x-e.x,dy=P.y-e.y,d=Math.hypot(dx,dy)||1;e.x+=dx/d*e.s;e.y+=dy/d*e.s;x.fillStyle=e.c;x.beginPath();x.arc(e.x,e.y,e.r,0,7);x.fill();if(d<e.r+10)P.hp-=.45;}
 if(CFG.shooter&&t%14===0&&en.length){let n=en[0],b=1e9;for(const e of en){const dd=(e.x-P.x)**2+(e.y-P.y)**2;if(dd<b){b=dd;n=e;}}const a=Math.atan2(n.y-P.y,n.x-P.x);sh.push({x:P.x,y:P.y,vx:Math.cos(a)*6,vy:Math.sin(a)*6,l:64});}
 x.fillStyle='#aebf86';for(let i=sh.length-1;i>=0;i--){const s=sh[i];s.x+=s.vx;s.y+=s.vy;s.l--;x.beginPath();x.arc(s.x,s.y,2.6,0,7);x.fill();for(let j=en.length-1;j>=0;j--){const e=en[j];if((e.x-s.x)**2+(e.y-s.y)**2<(e.r+3)**2){e.hp-=10;sh.splice(i,1);if(e.hp<=0){orbs.push({x:e.x,y:e.y,l:80});en.splice(j,1);score+=10;}break;}}if(s.l<=0)sh.splice(i,1);}
 for(let i=orbs.length-1;i>=0;i--){const o=orbs[i];o.l--;const dx=P.x-o.x,dy=P.y-o.y,d=Math.hypot(dx,dy)||1;if(d<90){o.x+=dx/d*3;o.y+=dy/d*3;}if(d<12){score+=5;orbs.splice(i,1);continue;}x.fillStyle='#7bdff2';x.beginPath();x.arc(o.x,o.y,3,0,7);x.fill();if(o.l<=0)orbs.splice(i,1);}
 x.fillStyle='#f6fff8';x.beginPath();x.arc(P.x,P.y,8,0,7);x.fill();x.strokeStyle='rgba(174,191,134,.5)';x.lineWidth=1.5;x.beginPath();x.arc(P.x,P.y,13,0,7);x.stroke();
 document.getElementById('hpf').style.width=Math.max(0,P.hp/120*100)+'%';document.getElementById('sc').textContent=score;document.getElementById('tm').textContent=Math.max(0,60-((sec)|0))+'s';
 if(P.hp<=0)return end(false);if(sec>=60)return end(true);
 requestAnimationFrame(loop);}
reset();
</script></body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? c));
}

/** Extract a complete HTML document from a model reply (strips code fences / prose). */
function extractHtml(raw: string): string | null {
  const fence = raw.match(/```(?:html)?\s*([\s\S]*?)```/i);
  const body = fence?.[1] ?? raw;
  const start = body.search(/<!doctype html>|<html[\s>]/i);
  if (start === -1) return null;
  const html = body.slice(start).trim();
  return html.length > 200 && /<\/html>/i.test(html) ? html : null;
}

/**
 * Generate the game's HTML. Uses the coder model when a key is present; falls back to the
 * deterministic template on no-key, error, or unusable output — so this never fails to return
 * a runnable game.
 */
export async function generateGameHtml(gdd: GameDesignDocument): Promise<{ html: string; source: 'model' | 'template' }> {
  if (!process.env['GOOGLE_API_KEY']) return { html: buildLocalGameHtml(gdd), source: 'template' };
  try {
    const model = createCoderModel();
    const prompt =
      'Write a COMPLETE, self-contained single-file HTML5 game (one <!doctype html> document with ' +
      'inline <canvas> and <script>, NO external resources, NO imports). It must run by opening the ' +
      'file. Implement this design exactly and respect its non-goals.\n\n' +
      `Title: ${gdd.title}\nGenre: ${gdd.genre}\nCore mechanic: ${gdd.coreMechanic}\n` +
      `Win: ${gdd.winCondition}\nLose: ${gdd.loseCondition}\nControls: ${gdd.controls.join(', ')}\n` +
      `Non-goals: ${gdd.nonGoals.join('; ')}\n\n` +
      'Requirements: keyboard controls (WASD/arrows), a visible HUD (health/score), a clear win and ' +
      'lose state with an on-screen message and restart on R, canvas sized to the window. ' +
      'Output ONLY the HTML document — no commentary.';
    const res = await model.invoke([
      { role: 'system', content: 'You are an expert game programmer. Output only a single runnable HTML file.' },
      { role: 'user', content: prompt },
    ]);
    const html = extractHtml(messageText(res));
    if (html) {
      console.log(`${CODEGEN_LOG_PREFIX} model produced HTML (${html.length} chars)`);
      return { html, source: 'model' };
    }
    console.warn(`${CODEGEN_LOG_PREFIX} model output unusable; using template`);
  } catch (error) {
    console.error(`${CODEGEN_LOG_PREFIX} model codegen failed; using template`, error);
  }
  return { html: buildLocalGameHtml(gdd), source: 'template' };
}

/** Flatten a LangChain message's content (string or content-block array) to text. */
function messageText(res: { content: unknown }): string {
  if (typeof res.content === 'string') return res.content;
  if (Array.isArray(res.content)) {
    return res.content
      .map((b) => (typeof b === 'string' ? b : (b && typeof b === 'object' && 'text' in b ? String((b as { text: unknown }).text ?? '') : '')))
      .join('');
  }
  return '';
}

/**
 * Apply a plain-language change to an existing single-file game (the tweak loop). Returns the
 * edited HTML when the model succeeds; otherwise the original unchanged (e.g. no key / failure).
 */
export async function tweakGameHtml(
  currentHtml: string,
  gdd: GameDesignDocument,
  request: string,
): Promise<{ html: string; source: 'model' | 'unchanged' }> {
  if (!process.env['GOOGLE_API_KEY']) return { html: currentHtml, source: 'unchanged' };
  try {
    const model = createCoderModel();
    const prompt =
      `Apply this change to the game: "${request}".\n\n` +
      'Rules: keep it a COMPLETE self-contained single-file HTML document; preserve everything that ' +
      'already works (controls, HUD, win/lose, restart) unless the change requires otherwise; do not ' +
      'add external resources or imports. Output ONLY the full updated HTML document — no commentary.\n\n' +
      `(Game: ${gdd.title} — ${gdd.genre}.)\n\nCURRENT GAME HTML:\n${currentHtml}`;
    const res = await model.invoke([
      { role: 'system', content: 'You are an expert game programmer editing a single-file HTML game. Output only the full updated HTML file.' },
      { role: 'user', content: prompt },
    ]);
    const html = extractHtml(messageText(res));
    if (html) {
      console.log(`${CODEGEN_LOG_PREFIX} tweak produced HTML (${html.length} chars)`);
      return { html, source: 'model' };
    }
    console.warn(`${CODEGEN_LOG_PREFIX} tweak output unusable; keeping current`);
  } catch (error) {
    console.error(`${CODEGEN_LOG_PREFIX} tweak failed; keeping current`, error);
  }
  return { html: currentHtml, source: 'unchanged' };
}
