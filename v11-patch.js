(() => {
  'use strict';

  const C = window.APP_CONFIG || {
    supabaseUrl: 'https://viwaclirvokwoeqqivgr.supabase.co',
    supabasePublishableKey: 'sb_publishable_OoERhmKw2t5PSwMiYX2I0A_DZE04otZ'
  };
  const VOICE_FN = 'brivviant-voice-task';
  const SYNTHETIC_DOMAIN = 'brivviant-team.invalid';
  const state = { data: null, me: null, mode: null, timer: null, recognitionTranscript: '' };
  const esc = (v='') => String(v).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const fmt = v => v ? new Intl.DateTimeFormat('ar-EG',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v)) : '—';
  const monthKey = v => String(v||'').slice(0,7);
  const isManagement = () => ['ceo','team_leader'].includes(state.me?.role);
  const isCEO = () => state.me?.role === 'ceo';
  const byId = id => document.getElementById(id);

  function session() {
    const candidates = [];
    for (let i=0;i<localStorage.length;i++) {
      const k=localStorage.key(i); if(k && /^sb-.*-auth-token$/.test(k)) candidates.push(k);
    }
    for (const key of candidates) {
      try {
        const raw = JSON.parse(localStorage.getItem(key) || 'null');
        const value = Array.isArray(raw) ? raw[0] : raw;
        if (value?.access_token && value?.user?.id) return value;
      } catch {}
    }
    return null;
  }

  async function api(path, body, options={}) {
    const s=session();
    if(!s?.access_token) throw new Error('سجّل دخولك أولًا.');
    const headers={
      apikey:C.supabasePublishableKey,
      Authorization:`Bearer ${s.access_token}`,
      'Content-Type':'application/json',
      ...options.headers
    };
    const res=await fetch(`${C.supabaseUrl}${path}`,{method:options.method||'POST',headers,body:body===undefined?undefined:JSON.stringify(body)});
    const out=await res.json().catch(()=>null);
    if(!res.ok) throw new Error(out?.message||out?.error||out?.hint||`HTTP ${res.status}`);
    return out;
  }
  async function refresh() {
    const s=session(); if(!s) return null;
    const data=await api('/rest/v1/rpc/bv_state',{});
    data.archived_tasks ||= [];
    data.point_ledger ||= [];
    data.requests ||= [];
    data.assignments ||= [];
    data.profiles ||= [];
    data.tasks ||= [];
    state.data=data;
    state.me=data.profiles.find(p=>p.id===s.user.id)||null;
    return data;
  }
  async function action(name,p={}) {
    const out=await api('/rest/v1/rpc/bv_action',{p_action:name,p});
    await refresh();
    toast('تم حفظ التغيير');
    patchAll();
    if(state.mode) renderCustom(state.mode);
    return out;
  }

  function toast(msg,bad=false) {
    let el=byId('v11-toast');
    if(!el){el=document.createElement('div');el.id='v11-toast';document.body.appendChild(el);}
    el.textContent=msg;el.className=bad?'bad show':'show';
    clearTimeout(el._t);el._t=setTimeout(()=>el.className='',3200);
  }

  function modal(title, html) {
    let shell=byId('v11-modal');
    if(!shell){
      shell=document.createElement('div');shell.id='v11-modal';
      shell.innerHTML='<div class="v11-modal-backdrop"></div><div class="v11-modal-card" dir="rtl"><button class="v11-modal-x" aria-label="إغلاق">×</button><h2></h2><div class="v11-modal-body"></div></div>';
      document.body.appendChild(shell);
      shell.querySelector('.v11-modal-backdrop').onclick=closeModal;
      shell.querySelector('.v11-modal-x').onclick=closeModal;
    }
    shell.querySelector('h2').textContent=title;
    shell.querySelector('.v11-modal-body').innerHTML=html;
    shell.classList.add('open');
    return shell;
  }
  function closeModal(){byId('v11-modal')?.classList.remove('open');}

  function ensureTabs(){
    const list=document.querySelector('.main-tabs'); if(!list||!state.data) return;
    const add=(key,label,admin=false)=>{
      if(admin&&!isManagement())return;
      if(list.querySelector(`[data-v11-tab="${key}"]`))return;
      const b=document.createElement('button');b.type='button';b.className='v11-tab';b.dataset.v11Tab=key;b.textContent=label;
      b.onclick=()=>showCustom(key);list.appendChild(b);
    };
    add('delivered','تم التسليم');
    add('reports','التقارير الشهرية',true);
    list.querySelectorAll('[data-slot="tabs-trigger"]').forEach(btn=>{
      if(btn.dataset.v11Bound)return;btn.dataset.v11Bound='1';
      btn.addEventListener('click',()=>hideCustom(),true);
    });
  }
  function customHost(){
    let h=byId('v11-custom-content');
    if(!h){h=document.createElement('section');h.id='v11-custom-content';h.dir='rtl';const list=document.querySelector('.main-tabs');list?.insertAdjacentElement('afterend',h);}
    return h;
  }
  function showCustom(key){state.mode=key;document.querySelectorAll('[data-slot="tabs-content"]').forEach(x=>x.style.display='none');document.querySelectorAll('.v11-tab').forEach(x=>x.classList.toggle('active',x.dataset.v11Tab===key));renderCustom(key);}
  function hideCustom(){state.mode=null;document.querySelectorAll('[data-slot="tabs-content"]').forEach(x=>x.style.removeProperty('display'));document.querySelectorAll('.v11-tab').forEach(x=>x.classList.remove('active'));byId('v11-custom-content')?.remove();}
  function renderCustom(key){const h=customHost(); if(key==='delivered')renderDelivered(h); else if(key==='reports')renderReports(h);}

  function pointsFor(userId, month=null){return (state.data?.point_ledger||[]).filter(x=>x.user_id===userId&&(!month||monthKey(x.created_at)===month)).reduce((n,x)=>n+Number(x.points||0),0);}
  function taskById(id){return [...(state.data?.tasks||[]),...(state.data?.archived_tasks||[])].find(t=>t.id===id);}
  function person(id){return state.data?.profiles?.find(p=>p.id===id);}

  function renderDelivered(h){
    const tasks=state.data?.archived_tasks||[];
    h.innerHTML=`<div class="section-title v11-title"><div><h2>تم التسليم</h2><p class="muted">التاسكات المنقولة من القائمة تفضل هنا بكل التسليمات والوقت والنقاط.</p></div><button class="v11-refresh">تحديث</button></div>${tasks.length?`<div class="panel v11-archive-list">${tasks.map(t=>{
      const as=(state.data.assignments||[]).filter(a=>a.task_id===t.id);
      const names=[...new Set(as.map(a=>person(a.user_id)?.name).filter(Boolean))];
      const pts=(state.data.point_ledger||[]).filter(x=>x.task_id===t.id).reduce((s,x)=>s+Number(x.points||0),0);
      const subs=as.filter(a=>a.submitted_at);
      return `<details class="v11-archive-row"><summary><span class="v11-archive-icon">✓</span><span><b>${esc(t.title)}</b><small>${esc(names.join(' · ')||'بدون تكليف')}</small></span><span class="v11-badge">تم التسليم</span><span><b>${fmt(t.deleted_at||t.updated_at)}</b><small>تاريخ النقل</small></span><span><b>${pts}</b><small>نقاط محفوظة</small></span></summary><div class="v11-archive-detail"><p><b>البريف:</b> ${esc(t.brief||'—')}</p><p><b>لينك البريف:</b> ${t.drive_url?`<a href="${esc(t.drive_url)}" target="_blank" rel="noreferrer">فتح Drive</a>`:'—'}</p>${subs.length?`<div class="v11-mini-table"><b>التسليمات</b>${subs.map(a=>`<div><span>${esc(person(a.user_id)?.name||'')}</span><span>${fmt(a.submitted_at)}</span><span>${a.submission_url?`<a href="${esc(a.submission_url)}" target="_blank">الملفات</a>`:'—'}</span><strong>+${Number(a.points_awarded||0)}</strong></div>`).join('')}</div>`:'<p>لا توجد تسليمات محفوظة.</p>'}</div></details>`;
    }).join('')}</div>`:`<div class="panel empty-state"><h3>لا توجد تاسكات منقولة بعد</h3><p>لما الإدارة تنقل تاسك إلى تم التسليم هيظهر هنا بدل ما يختفي.</p></div>`}`;
    h.querySelector('.v11-refresh')?.addEventListener('click',async()=>{try{await refresh();renderDelivered(h)}catch(e){toast(e.message,true)}});
  }

  function renderReports(h){
    if(!isManagement()){h.innerHTML='';return;}
    const current=h.dataset.month||new Date().toISOString().slice(0,7);
    const selected=h.dataset.user||'all';
    const profiles=(state.data?.profiles||[]).filter(p=>selected==='all'||p.id===selected);
    const assignments=(state.data?.assignments||[]).filter(a=>a.submitted_at&&monthKey(a.submitted_at)===current);
    const ledger=(state.data?.point_ledger||[]).filter(x=>monthKey(x.created_at)===current);
    h.innerHTML=`<div class="section-title v11-title"><div><h2>التقارير الشهرية لكل حساب</h2><p class="muted">التسليمات، التأخير، النقاط، والزيادة/الخصم اليدوي.</p></div></div><div class="panel v11-report-filters"><label><span>الشهر</span><input id="v11-report-month" type="month" value="${esc(current)}"></label><label><span>الحساب</span><select id="v11-report-user"><option value="all">كل الحسابات</option>${(state.data.profiles||[]).map(p=>`<option value="${p.id}" ${selected===p.id?'selected':''}>${esc(p.name)} · ${esc(p.username)}</option>`).join('')}</select></label></div><div class="v11-report-stack">${profiles.map(p=>{
      const subs=assignments.filter(a=>a.user_id===p.id);
      const led=ledger.filter(x=>x.user_id===p.id);
      const late=subs.filter(a=>{const task=taskById(a.task_id);const dl=a.deadline_at||task?.due_at;return dl&&Date.parse(a.submitted_at)>Date.parse(dl);});
      const monthly=led.reduce((s,x)=>s+Number(x.points||0),0);
      const total=pointsFor(p.id);
      const adj=led.filter(x=>x.kind==='manual_adjustment');
      return `<article class="panel v11-report-card"><div class="v11-report-head"><div><h3>${esc(p.name)}</h3><small dir="ltr">${esc(p.username)}@${SYNTHETIC_DOMAIN}</small></div><div class="v11-kpis"><span><b>${subs.length}</b><small>تسليم</small></span><span class="${late.length?'danger':''}"><b>${late.length}</b><small>متأخر</small></span><span><b>${monthly}</b><small>نقطة الشهر</small></span><span><b>${total}</b><small>إجمالي النقاط</small></span></div></div>${subs.length?`<div class="v11-table-wrap"><table><thead><tr><th>التاسك</th><th>التسليم</th><th>Deadline</th><th>التأخير</th><th>النقاط</th></tr></thead><tbody>${subs.map(a=>{const t=taskById(a.task_id);const dl=a.deadline_at||t?.due_at;const l=dl&&Date.parse(a.submitted_at)>Date.parse(dl);return `<tr><td>${esc(t?.title||'تاسك مؤرشف')}</td><td>${fmt(a.submitted_at)}</td><td>${fmt(dl)}</td><td>${l?`<span class="v11-late">متأخر${a.delay_reason?` · ${esc(a.delay_reason)}`:''}</span>`:'في الموعد'}</td><td>${Number(a.points_awarded||0)}</td></tr>`;}).join('')}</tbody></table></div>`:'<p class="v11-empty">لا توجد تسليمات في الشهر المحدد.</p>'}${adj.length?`<div class="v11-adjustments"><b>تعديلات الإدارة على النقاط</b>${adj.map(x=>`<div><strong class="${x.points<0?'minus':''}">${x.points>0?'+':''}${x.points}</strong><span>${esc(x.reason)}</span><small>${fmt(x.created_at)} · ${esc(person(x.created_by)?.name||'')}</small></div>`).join('')}</div>`:''}</article>`;
    }).join('')}</div>`;
    byId('v11-report-month').onchange=e=>{h.dataset.month=e.target.value;renderReports(h)};
    byId('v11-report-user').onchange=e=>{h.dataset.user=e.target.value;renderReports(h)};
  }

  function patchTeam(){
    if(!isManagement())return;
    document.querySelectorAll('.member-card').forEach(card=>{
      const text=card.textContent||'';
      const profile=(state.data.profiles||[]).find(p=>text.includes(p.username)||text.includes(p.name));
      if(!profile)return;
      const score=card.querySelector('.member-score strong'); if(score)score.textContent=String(pointsFor(profile.id));
      const actions=card.querySelector('.button-row');
      if(actions&&!actions.querySelector('.v11-points-btn')){
        const b=document.createElement('button');b.type='button';b.className='v11-points-btn';b.textContent='± نقاط';b.onclick=()=>openPoints(profile);actions.prepend(b);
      }
    });
  }
  function openPoints(profile){
    const m=modal('زيادة / خصم نقاط',`<div class="v11-person"><b>${esc(profile.name)}</b><small>${pointsFor(profile.id)} نقطة حاليًا</small></div><form id="v11-points-form"><label><span>النقاط (+ إضافة / - خصم)</span><input name="points" type="number" min="-10000" max="10000" step="1" placeholder="مثال: 25 أو -10" required></label><label><span>السبب</span><textarea name="reason" rows="3" required></textarea></label><button type="submit">حفظ تعديل النقاط</button></form>`);
    m.querySelector('#v11-points-form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await action('adjust_points',{user_id:profile.id,points:Number(f.get('points')),reason:String(f.get('reason')||'')});closeModal()}catch(err){toast(err.message,true)}};
  }

  function patchRequests(){
    const body=document.querySelector('.request-table tbody'); if(!body||!state.data)return;
    const used=new Set();
    [...body.querySelectorAll('tr')].forEach(row=>{
      const cells=row.querySelectorAll('td');if(cells.length<3)return;
      const owner=(cells[0].querySelector('b')?.textContent||'').trim();
      const title=(cells[2].querySelector('b')?.textContent||'').trim();
      const q=(state.data.requests||[]).find(x=>!used.has(x.id)&&x.title===title&&(person(x.created_by)?.name||'')===owner);
      if(!q)return;used.add(q.id);row.dataset.v11Request=q.id;
      if(q.kind==='leave'){
        cells[1].textContent='طلب إجازة';
        if(q.leave_from&&!cells[2].querySelector('.v11-leave-dates')) cells[2].insertAdjacentHTML('beforeend',`<small class="table-detail v11-leave-dates">الإجازة: ${esc(q.leave_from)} → ${esc(q.leave_to||q.leave_from)}</small>`);
      }
      const badge=row.querySelector('.status');if(q.status==='rejected'&&badge)badge.textContent='مرفوض';
      if(q.escalation_required&&!cells[2].querySelector('.v11-escalation')) cells[2].insertAdjacentHTML('beforeend',`<small class="v11-escalation">⚠ مرفوض سابقًا — محاولة ${Number(q.attempt_no||2)} ومُصعّد للإدارة</small>`);
      if(isManagement()){
        const actions=row.querySelector('.request-actions');
        if(actions){
          const destructive=[...actions.querySelectorAll('button')].find(b=>(b.textContent||'').includes('حذف'));
          if(q.escalation_required&&state.me.role==='team_leader'&&destructive){destructive.disabled=true;destructive.title='الطلب مُصعّد؛ الـTeam Leader لا يقدر يحذفه.';}
          if(!(q.escalation_required&&state.me.role==='team_leader')&&!actions.querySelector('.v11-reject-btn')&&q.status!=='done'&&q.status!=='rejected'){
            const b=document.createElement('button');b.type='button';b.className='v11-reject-btn';b.textContent='رفض';
            b.onclick=async()=>{const reason=prompt('سبب الرفض — إجباري:');if(!reason?.trim())return;try{await action('update_request',{id:q.id,status:'rejected',response:reason.trim(),execution_due_at:''})}catch(e){toast(e.message,true)}};
            actions.appendChild(b);
          }
        }
      } else if(q.created_by===state.me?.id&&q.status==='rejected'&&!cells[2].querySelector('.v11-resubmit-btn')){
        const b=document.createElement('button');b.type='button';b.className='v11-resubmit-btn';b.textContent='إعادة تقديم — تصعيد';b.onclick=async()=>{try{await action('resubmit_request',{id:q.id})}catch(e){toast(e.message,true)}};cells[2].appendChild(b);
      }
    });
    const title=document.querySelector('[data-slot="tabs-content"][data-state="active"] .section-title');
    if(title&&(title.textContent||'').includes('طلب')&&!title.querySelector('.v11-leave-btn')){
      const b=document.createElement('button');b.type='button';b.className='v11-leave-btn';b.textContent='طلب إجازة';b.onclick=openLeave;title.appendChild(b);
    }
  }
  function openLeave(){
    const m=modal('طلب إجازة',`<form id="v11-leave-form"><div class="v11-two"><label><span>من</span><input name="leave_from" type="date" required></label><label><span>إلى</span><input name="leave_to" type="date" required></label></div><label><span>العنوان</span><input name="title" maxlength="180" value="طلب إجازة" required></label><label><span>التفاصيل</span><textarea name="body" rows="4" required></textarea></label><button type="submit">إرسال للإدارة</button></form>`);
    m.querySelector('#v11-leave-form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await action('create_request',{kind:'leave',title:String(f.get('title')),body:String(f.get('body')),leave_from:String(f.get('leave_from')),leave_to:String(f.get('leave_to'))});closeModal()}catch(err){toast(err.message,true)}};
  }

  function patchDeleteCopy(){
    document.querySelectorAll('[data-slot="alert-dialog-description"]').forEach(el=>{
      if((el.textContent||'').includes('هيختفي من قوائم الفريق')) el.textContent='هيتنقل من قائمة التاسكات إلى صفحة «تم التسليم». السجل والتسليمات والوقت والنقاط هيفضلوا محفوظين بالكامل.';
    });
  }

  let recorder=null,chunks=[],recognizer=null;
  function ensureVoiceButton(){
    if(!isManagement())return;
    const heading=document.querySelector('.heading-row'); if(!heading||heading.querySelector('.v11-voice-btn'))return;
    const primary=[...heading.querySelectorAll('button')].find(b=>(b.textContent||'').includes('تاسك جديد'));
    const b=document.createElement('button');b.type='button';b.className='v11-voice-btn';b.textContent='🎙 إضافة بالصوت';b.onclick=openVoice;
    if(primary)primary.parentElement?.insertBefore(b,primary);else heading.appendChild(b);
  }
  function openVoice(){
    const m=modal('إضافة تاسك بالصوت',`<div class="v11-voice"><label><span>لينك البريف — اختياري للإدارة</span><input id="v11-voice-drive" type="url" dir="ltr" placeholder="لو فاضي هيتحط Test تلقائيًا"></label><div class="v11-recorder"><div class="v11-mic">🎙</div><b id="v11-voice-status">جاهز للتسجيل</b><p>مثال: «تاسك تصميم البوابة مع أوسكار، تسليمه بكرة الساعة 6 مساءً».</p><button id="v11-record-btn" type="button">ابدأ التسجيل</button></div><small>Gemini يجرب Pool من الموديلات المتاحة. لو كلها غير متاحة، هنستخدم التفريغ الصوتي الخاص بالمتصفح + Parser بسيط، ولو ده غير متاح هنرجع للفورم العادي بدون تعطيل السيستم.</small></div>`);
    m.querySelector('#v11-record-btn').onclick=startRecording;
  }
  async function startRecording(){
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      chunks=[];state.recognitionTranscript='';
      recorder=new MediaRecorder(stream);recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
      recorder.onstop=()=>handleVoiceStop(new Blob(chunks,{type:recorder.mimeType||'audio/webm'}),stream);
      const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
      if(SR){try{recognizer=new SR();recognizer.lang='ar-EG';recognizer.continuous=true;recognizer.interimResults=false;recognizer.onresult=e=>{for(let i=e.resultIndex;i<e.results.length;i++)if(e.results[i].isFinal)state.recognitionTranscript+=' '+e.results[i][0].transcript};recognizer.start();}catch{recognizer=null}}
      recorder.start();
      byId('v11-voice-status').textContent='جاري التسجيل…';const b=byId('v11-record-btn');b.textContent='إيقاف وإنشاء التاسك';b.onclick=()=>{b.disabled=true;recorder.stop();try{recognizer?.stop()}catch{}};
    }catch(e){toast('تعذر فتح الميكروفون.',true)}
  }
  async function handleVoiceStop(blob,stream){
    stream.getTracks().forEach(t=>t.stop());
    byId('v11-voice-status').textContent='جاري تحليل التسجيل…';
    const drive=(byId('v11-voice-drive')?.value||'').trim();
    try{
      const s=session();const form=new FormData();form.append('audio',blob,'voice.webm');form.append('drive_url',drive);
      const res=await fetch(`${C.supabaseUrl}/functions/v1/${VOICE_FN}`,{method:'POST',headers:{apikey:C.supabasePublishableKey,Authorization:`Bearer ${s.access_token}`},body:form});
      const out=await res.json().catch(()=>({}));
      if(res.ok&&out.ok){await refresh();closeModal();toast(`تم إنشاء «${out.title}» وتوزيعه${out.model_used?` عبر ${out.model_used}`:''}.`);patchAll();return;}
      if(out.fallback_manual){
        const done=await browserVoiceFallback(state.recognitionTranscript,drive);
        if(done){closeModal();return;}
        closeModal();openOriginalCreate(drive);toast('Gemini غير متاح؛ رجعنا لإضافة التاسك العادية.',true);return;
      }
      throw new Error(out.error||'تعذر إنشاء التاسك من الصوت.');
    }catch(e){
      const done=await browserVoiceFallback(state.recognitionTranscript,drive).catch(()=>false);
      if(done){closeModal();return;}
      closeModal();openOriginalCreate(drive);toast(e.message||'تعذر تحليل الصوت؛ استخدم الإضافة العادية.',true);
    }
  }

  async function browserVoiceFallback(transcript,drive){
    const text=String(transcript||'').trim();if(!text)return false;
    const profiles=(state.data?.profiles||[]).filter(p=>p.active);
    const assignee=profiles.find(p=>text.toLowerCase().includes(p.name.toLowerCase())||text.toLowerCase().includes(p.username.toLowerCase()));
    if(!assignee)return false;
    const due=parseArabicDue(text);if(!due)return false;
    let title=text.replace(/^(تاسك|مهمة)\s*/i,'').split(/\s+(مع|لـ|مع المصمم|تسليمه|تسليمها|موعد)/)[0].trim();
    if(!title)title='تاسك من تسجيل صوتي';
    const task=await action('create_task',{title,brief:text,drive_url:drive||'',due_at:due.toISOString()});
    await action('assign',{task_id:task.id,version:1,user_ids:[assignee.id]});
    toast('تم إنشاء التاسك بالطريقة الاحتياطية بدون Gemini.');return true;
  }
  function parseArabicDue(text){
    const now=new Date();let d=new Date(now);let found=false;
    if(/بعد بكرة|بعد غد/.test(text)){d.setDate(d.getDate()+2);found=true}else if(/بكرة|غد/.test(text)){d.setDate(d.getDate()+1);found=true}else if(/النهارده|اليوم/.test(text)){found=true}
    const m=text.match(/(?:الساعة|ساعه|ساعة)?\s*(\d{1,2})(?::(\d{2}))?\s*(مساء|الصبح|صباح|ظهر|ليل|pm|am)?/i);
    if(m){let h=Number(m[1]),min=Number(m[2]||0),p=m[3]||'';if(/مساء|ليل|pm/i.test(p)&&h<12)h+=12;if(/صباح|الصبح|am/i.test(p)&&h===12)h=0;d.setHours(h,min,0,0);found=true}else if(found){d.setHours(18,0,0,0)}
    return found&&d.getTime()>Date.now()?d:null;
  }
  function openOriginalCreate(drive){
    const btn=[...document.querySelectorAll('button')].find(b=>(b.textContent||'').includes('تاسك جديد'));
    btn?.click();
    setTimeout(()=>{
      const dialogs=[...document.querySelectorAll('[role="dialog"]')];const dlg=dialogs.find(x=>(x.textContent||'').includes('إضافة تاسك'));
      const input=dlg?.querySelector('input[name="drive_url"]');if(input&&drive){input.value=drive;input.dispatchEvent(new Event('input',{bubbles:true}));}
    },150);
  }

  function patchAll(){
    if(!state.data)return;
    ensureTabs();ensureVoiceButton();patchTeam();patchRequests();patchDeleteCopy();
  }

  const observer=new MutationObserver(()=>{clearTimeout(state.timer);state.timer=setTimeout(patchAll,80)});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  setInterval(async()=>{if(!session())return;try{await refresh();patchAll();if(state.mode)renderCustom(state.mode)}catch{}},15000);
  window.addEventListener('focus',async()=>{if(!session())return;try{await refresh();patchAll()}catch{}});

  async function init(){
    for(let i=0;i<80;i++){if(document.querySelector('.main-work')&&session())break;await new Promise(r=>setTimeout(r,250));}
    if(!session())return;
    try{await refresh();patchAll()}catch(e){console.warn('V11 patch init:',e)}
  }
  init();
})();
