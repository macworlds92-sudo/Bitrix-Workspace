import { useState, useEffect, useCallback } from "react";

// ── BX24 SDK wrapper ──────────────────────────────────────────────────────────
const bx24 = (method, params = {}) => new Promise((resolve, reject) => {
  if (!window.BX24) return reject(new Error("BX24 SDK не загружен. Откройте приложение из Bitrix24."));
  window.BX24.callMethod(method, params, result => {
    if (result.error()) reject(new Error(result.error().ex?.error_description || result.error()));
    else resolve(result.data());
  });
});

const bx24batch = (calls) => new Promise((resolve, reject) => {
  if (!window.BX24) return reject(new Error("BX24 SDK не загружен"));
  window.BX24.callBatch(calls, result => resolve(result));
});

const claudeCall = async (userMsg, systemMsg) => {
  const res = await fetch("/api/claude", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514", max_tokens: 1000,
      system: systemMsg,
      messages: [{ role: "user", content: userMsg }]
    })
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}`);
  const data = await res.json();
  return (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
};

const parseJSON = (text) => {
  try { const s = text.indexOf("{"), e = text.lastIndexOf("}"); return s >= 0 ? JSON.parse(text.slice(s, e + 1)) : null; }
  catch { return null; }
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const todayStr = new Date().toLocaleDateString("ru-RU");
const tomorrowDate = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d; };
const tomorrowStr = tomorrowDate().toLocaleDateString("ru-RU");
const tomorrowISO = () => tomorrowDate().toISOString();
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("ru-RU") : null;
const isToday = (dl) => dl === todayStr;
const isOverdue = (dl) => { if (!dl) return false; const [d,m,y]=dl.split("."); return new Date(y,m-1,d) < new Date(new Date().toDateString()); };
const isFuture = (dl) => !dl || (!isToday(dl) && !isOverdue(dl));

// ── Colors & presets ──────────────────────────────────────────────────────────
const C = {
  purple:{bg:"#EEEDFE",text:"#3C3489",border:"#AFA9EC"},
  teal:  {bg:"#E1F5EE",text:"#0F6E56",border:"#5DCAA5"},
  coral: {bg:"#FAECE7",text:"#712B13",border:"#F0997B"},
  amber: {bg:"#FAEEDA",text:"#633806",border:"#EF9F27"},
  blue:  {bg:"#E6F1FB",text:"#0C447C",border:"#85B7EB"},
  green: {bg:"#EAF3DE",text:"#3B6D11",border:"#97C459"},
  gray:  {bg:"#F1EFE8",text:"#444441",border:"#B4B2A9"},
  red:   {bg:"#FCEBEB",text:"#791F1F",border:"#F09595"},
};

const TAGS = [
  {id:"hot",label:"Горячий",color:"#A32D2D",bg:"#FCEBEB"},
  {id:"kp_wait",label:"Ждёт КП",color:"#854F0B",bg:"#FAEEDA"},
  {id:"negotiat",label:"Переговоры",color:"#185FA5",bg:"#E6F1FB"},
  {id:"contract",label:"К договору",color:"#3B6D11",bg:"#EAF3DE"},
  {id:"slow",label:"Долго думает",color:"#5F5E5A",bg:"#F1EFE8"},
  {id:"vip",label:"VIP",color:"#534AB7",bg:"#EEEDFE"},
];

const RESULTS = [
  {id:"done",label:"Выполнено",color:"green"},
  {id:"callback",label:"Перезвонит",color:"blue"},
  {id:"no_answer",label:"Не ответил",color:"amber"},
  {id:"refuse",label:"Отказ",color:"red"},
];

const STAGES = {
  NEW:{label:"Новая",color:"blue"},PREPARATION:{label:"Подготовка",color:"purple"},
  EXECUTING:{label:"В работе",color:"amber"},FINAL_INVOICE:{label:"Счёт",color:"teal"},
  WON:{label:"Выиграна",color:"green"},LOSE:{label:"Проиграна",color:"red"},
};

// ── UI primitives ─────────────────────────────────────────────────────────────
const Badge = ({color="gray",children,sm}) => { const c=C[color]||C.gray; return <span style={{background:c.bg,color:c.text,border:`0.5px solid ${c.border}`,borderRadius:6,padding:sm?"1px 6px":"2px 9px",fontSize:sm?10:11,fontWeight:500,whiteSpace:"nowrap"}}>{children}</span>; };
const Spin = ({label="Загрузка…"}) => <span style={{display:"flex",alignItems:"center",gap:8,color:"var(--color-text-secondary)",fontSize:13}}><svg width="13" height="13" viewBox="0 0 13 13" style={{animation:"spin 1s linear infinite",flexShrink:0}}><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style><circle cx="6.5" cy="6.5" r="5" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="20 8"/></svg>{label}</span>;
const Stat = ({label,value,color="gray",note}) => <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"10px 14px",flex:1,minWidth:80}}><p style={{margin:0,fontSize:10,color:"var(--color-text-secondary)"}}>{label}</p><p style={{margin:0,fontSize:20,fontWeight:500,color:C[color].text}}>{value}</p>{note&&<p style={{margin:0,fontSize:9,color:"var(--color-text-tertiary)",marginTop:2}}>{note}</p>}</div>;

// ── Deal card (expanded) ───────────────────────────────────────────────────────
function DealBlock({deal}) {
  if (!deal) return null;
  const days = Math.round((Date.now()-new Date(deal.DATE_CREATE))/86400000);
  const si = STAGES[deal.STAGE_ID]||{label:deal.STAGE_ID||"—",color:"gray"};
  const dc = days>21?"red":days>14?"amber":"green";
  return (
    <div style={{borderTop:"0.5px solid var(--color-border-tertiary)",paddingTop:10,marginTop:8}}>
      <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
        <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"6px 10px",minWidth:80}}>
          <p style={{margin:0,fontSize:10,color:"var(--color-text-tertiary)"}}>Сумма</p>
          <p style={{margin:0,fontSize:13,fontWeight:500,color:C.teal.text}}>{deal.OPPORTUNITY>0?Number(deal.OPPORTUNITY).toLocaleString("ru")+" "+(deal.CURRENCY_ID||"₽"):"—"}</p>
        </div>
        <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"6px 10px",minWidth:80}}>
          <p style={{margin:0,fontSize:10,color:"var(--color-text-tertiary)"}}>Цикл</p>
          <p style={{margin:0,fontSize:13,fontWeight:500,color:C[dc].text}}>{days} дн.</p>
          <div style={{height:3,background:"var(--color-border-tertiary)",borderRadius:2,marginTop:3}}><div style={{height:"100%",width:`${Math.min(100,days/30*100)}%`,background:C[dc].border,borderRadius:2}}/></div>
        </div>
        <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"6px 10px",flex:1}}>
          <p style={{margin:0,fontSize:10,color:"var(--color-text-tertiary)"}}>Стадия</p>
          <div style={{marginTop:3}}><Badge color={si.color} sm>{si.label}</Badge></div>
        </div>
      </div>
      {deal.COMMENTS&&<div style={{background:C.amber.bg,border:`0.5px solid ${C.amber.border}`,borderRadius:"var(--border-radius-md)",padding:"7px 10px",marginBottom:6}}><p style={{margin:"0 0 2px",fontSize:9,color:C.amber.text,textTransform:"uppercase",fontWeight:500}}>Последнее касание</p><p style={{margin:0,fontSize:12,color:C.amber.text}}>{deal.COMMENTS}</p></div>}
      {days>14&&<div style={{background:C.red.bg,border:`0.5px solid ${C.red.border}`,borderRadius:"var(--border-radius-md)",padding:"6px 10px"}}><p style={{margin:0,fontSize:11,color:C.red.text}}>⚠ {days} дней без закрытия</p></div>}
    </div>
  );
}

// ── Task card ─────────────────────────────────────────────────────────────────
function TaskCard({task,deals,allTasks,onQuickResult,onComplete,onReschedule,onTagsChange,busy,statusChanging}) {
  const [open,setOpen]=useState(false);
  const [mode,setMode]=useState(null);
  const [comment,setComment]=useState("");
  const [result,setResult]=useState("done");
  const [date,setDate]=useState("");
  const [hint,setHint]=useState(null);
  const [hintLoading,setHintLoading]=useState(false);

  const done=task.status==="done";
  const overdue=isOverdue(task.deadline);
  const deal=deals.find(d=>String(d.ID)===String(task.dealId));
  const border=done?"var(--color-border-tertiary)":overdue?C.red.border:task.priority==="high"?C.coral.border:"var(--color-border-tertiary)";

  const getHint=async()=>{
    if(hint||!deal||hintLoading) return;
    setHintLoading(true);
    try{
      const t=await claudeCall(
        `Сделка: ${deal.TITLE}. Стадия: ${deal.STAGE_ID}. Сумма: ${deal.OPPORTUNITY} ${deal.CURRENCY_ID}. Последнее касание: ${deal.COMMENTS||"нет данных"}. Цель: ${task.title}. Дай одну фразу для открытия звонка (1-2 предложения, конкретно, без воды).`,
        "Эксперт по продажам. Только фраза, без предисловий."
      );
      setHint(t.trim());
    }catch{setHint("");}
    setHintLoading(false);
  };

  const toggle=()=>{ if(!open){getHint();} setOpen(v=>!v); setMode(null); };

  const doComplete=()=>{ if(comment.trim().length<3)return; onComplete(task.id,{result,comment}); setMode(null);setOpen(false);setComment(""); };
  const doReschedule=()=>{ if(!date||comment.trim().length<3)return; onReschedule(task.id,{date,comment}); setMode(null);setOpen(false);setComment("");setDate(""); };

  return (
    <div style={{border:`0.5px solid ${border}`,background:done?"var(--color-background-secondary)":"var(--color-background-primary)",borderRadius:"var(--border-radius-lg)",marginBottom:6,overflow:"hidden"}}>
      {/* Row */}
      <div style={{display:"flex",alignItems:"center",gap:8,padding:"9px 11px",cursor:"pointer"}} onClick={toggle}>
        <div style={{width:22,height:22,borderRadius:"50%",background:task.type==="meeting"?C.purple.bg:C.blue.bg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <span style={{fontSize:10,color:task.type==="meeting"?C.purple.text:C.blue.text}}>{task.type==="meeting"?"●":"○"}</span>
        </div>
        <div style={{flex:1,minWidth:0}}>
          <p style={{margin:"0 0 3px",fontSize:13,fontWeight:500,color:done?"var(--color-text-tertiary)":"var(--color-text-primary)",textDecoration:done?"line-through":"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{task.title}</p>
          <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
            {task.deadline&&<Badge color={overdue?"red":done?"green":isToday(task.deadline)?"blue":"gray"} sm>{task.deadline}</Badge>}
            {task.priority==="high"&&!done&&<Badge color="coral" sm>срочно</Badge>}
            {task.type==="meeting"&&<Badge color="purple" sm>встреча</Badge>}
            {(task.tags||[]).map(tid=>{const t=TAGS.find(x=>x.id===tid);return t?<span key={tid} style={{background:t.bg,color:t.color,border:`0.5px solid ${t.color}`,borderRadius:3,padding:"0 5px",fontSize:9,fontWeight:500}}>{t.label}</span>:null;})}
          </div>
        </div>
        <div style={{flexShrink:0,display:"flex",gap:4,alignItems:"center"}}>
          {done&&<Badge color="green" sm>✓</Badge>}
          {task.status==="rescheduled"&&<Badge color="amber" sm>→</Badge>}
          {statusChanging===task.id&&<Spin label=""/>}
          <span style={{fontSize:11,color:"var(--color-text-tertiary)"}}>{open?"▲":"▽"}</span>
        </div>
      </div>

      {/* Quick actions (collapsed) */}
      {!done&&!open&&(
        <div style={{display:"flex",gap:4,padding:"4px 11px 8px",borderTop:"0.5px solid var(--color-border-tertiary)"}}>
          {RESULTS.map(r=><button key={r.id} onClick={e=>{e.stopPropagation();onQuickResult(task.id,r.id,r.label);}} disabled={busy} style={{fontSize:10,padding:"3px 8px",background:C[r.color].bg,color:C[r.color].text,border:`0.5px solid ${C[r.color].border}`,borderRadius:5,cursor:"pointer",fontWeight:500}}>{r.label}</button>)}
          <button onClick={e=>{e.stopPropagation();toggle();}} style={{fontSize:10,padding:"3px 8px",marginLeft:"auto",border:"0.5px solid var(--color-border-tertiary)",borderRadius:5,cursor:"pointer",color:"var(--color-text-tertiary)"}}>Подробнее</button>
        </div>
      )}

      {/* Expanded */}
      {open&&(
        <div style={{padding:"0 11px 11px"}}>
          {hintLoading&&<div style={{marginBottom:8}}><Spin label="Готовим скрипт…"/></div>}
          {hint&&<div style={{background:C.teal.bg,border:`0.5px solid ${C.teal.border}`,borderRadius:"var(--border-radius-md)",padding:"7px 10px",marginBottom:8}}><p style={{margin:"0 0 2px",fontSize:9,color:C.teal.text,textTransform:"uppercase",fontWeight:500}}>Скрипт открытия</p><p style={{margin:0,fontSize:12,color:C.teal.text}}>{hint}</p></div>}
          <DealBlock deal={deal}/>
          {!done&&mode===null&&(
            <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap",borderTop:"0.5px solid var(--color-border-tertiary)",paddingTop:8,alignItems:"center"}}>
              <button onClick={()=>setMode("complete")} style={{fontSize:11,padding:"4px 11px"}}>✓ Результат</button>
              <button onClick={()=>setMode("reschedule")} style={{fontSize:11,padding:"4px 11px"}}>→ Перенести</button>
              <div style={{flex:1}}/>
              {TAGS.map(tag=>{const active=(task.tags||[]).includes(tag.id);return <span key={tag.id} onClick={()=>onTagsChange(task.id,active?(task.tags||[]).filter(x=>x!==tag.id):[...(task.tags||[]),tag.id])} style={{background:active?tag.bg:"transparent",color:active?tag.color:"var(--color-text-tertiary)",border:`0.5px solid ${active?tag.color:"var(--color-border-tertiary)"}`,borderRadius:4,padding:"2px 7px",fontSize:9,cursor:"pointer"}}>{tag.label}</span>;})}
            </div>
          )}
          {mode==="complete"&&(
            <div style={{marginTop:8,padding:10,background:C.green.bg,border:`0.5px solid ${C.green.border}`,borderRadius:"var(--border-radius-md)"}}>
              <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>
                {RESULTS.map(r=><button key={r.id} onClick={()=>setResult(r.id)} style={{fontSize:10,padding:"3px 9px",background:result===r.id?C[r.color].bg:"transparent",border:result===r.id?`1.5px solid ${C[r.color].border}`:"0.5px solid var(--color-border-tertiary)",borderRadius:5,cursor:"pointer",color:result===r.id?C[r.color].text:"var(--color-text-secondary)",fontWeight:result===r.id?500:400}}>{r.label}</button>)}
              </div>
              <textarea value={comment} onChange={e=>setComment(e.target.value)} placeholder="О чём говорили? Что договорились?" style={{width:"100%",minHeight:50,fontSize:12,padding:7,boxSizing:"border-box",borderRadius:"var(--border-radius-md)",border:"0.5px solid var(--color-border-secondary)",background:"var(--color-background-primary)",resize:"vertical",marginBottom:6}}/>
              <div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
                <button onClick={()=>setMode(null)} style={{fontSize:11,padding:"4px 12px"}}>Отмена</button>
                <button onClick={doComplete} disabled={comment.trim().length<3} style={{fontSize:11,padding:"4px 12px"}}>Сохранить ↗</button>
              </div>
            </div>
          )}
          {mode==="reschedule"&&(
            <div style={{marginTop:8,padding:10,background:"var(--color-background-secondary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-md)"}}>
              <div style={{marginBottom:6}}>
                <label style={{fontSize:10,color:"var(--color-text-secondary)",display:"block",marginBottom:2}}>Новая дата *</label>
                <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{width:"100%",fontSize:12,padding:"5px 8px",boxSizing:"border-box"}}/>
              </div>
              <textarea value={comment} onChange={e=>setComment(e.target.value)} placeholder="Обязательно: что произошло? Почему переносим?" style={{width:"100%",minHeight:50,fontSize:12,padding:7,boxSizing:"border-box",borderRadius:"var(--border-radius-md)",border:"0.5px solid var(--color-border-secondary)",background:"var(--color-background-primary)",resize:"vertical",marginBottom:6}}/>
              <div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
                <button onClick={()=>setMode(null)} style={{fontSize:11,padding:"4px 12px"}}>Отмена</button>
                <button onClick={doReschedule} disabled={!date||comment.trim().length<3} style={{fontSize:11,padding:"4px 12px"}}>Перенести ↗</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Report tab ─────────────────────────────────────────────────────────────────
function ReportTab({tasks,queue,userName}) {
  const [report,setReport]=useState(null);
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState("");
  const done=tasks.filter(t=>t.status==="done");
  const rescheduled=tasks.filter(t=>t.status==="rescheduled");
  const pending=tasks.filter(t=>t.status==="pending");
  const pct=tasks.length>0?Math.round(done.length/tasks.length*100):0;

  const generate=async()=>{
    setLoading(true);setErr("");setReport(null);
    try{
      const text=await claudeCall(
        `Отчёт менеджера ${userName} за ${todayStr}. Выполнено: ${done.length}/${tasks.length}. Перенесено: ${rescheduled.length}. Не закрыто: ${pending.length}. Очередь: ${queue.length}. Выполненные: ${JSON.stringify(done.map(t=>({title:t.title,result:t.resultType,comment:t.comment})))}. Перенесённые: ${JSON.stringify(rescheduled.map(t=>({title:t.title,comment:t.comment})))}. Верни JSON: {rating,rating_comment,done_summary,risks:[{deal,risk}],tomorrow:[{action}],manager_note}`,
        "Строгий РОП. Честный отчёт без воды. ТОЛЬКО JSON без markdown."
      );
      setReport(parseJSON(text)||{rating:5,rating_comment:"Анализ недоступен",done_summary:`Выполнено ${done.length} из ${tasks.length}`,risks:[],tomorrow:[],manager_note:""});
    }catch(e){setErr(e.message);}
    setLoading(false);
  };

  const rc=r=>r>=8?"green":r>=5?"amber":"red";
  return (
    <div>
      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        {[["Выполнено",done.length,"green"],["Перенесено",rescheduled.length,"amber"],["Не закрыто",pending.length,pending.length>0?"coral":"gray"]].map(([l,v,c])=>(
          <div key={l} style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"8px 12px",flex:1}}><p style={{margin:0,fontSize:10,color:"var(--color-text-secondary)"}}>{l}</p><p style={{margin:0,fontSize:20,fontWeight:500,color:C[c].text}}>{v}</p></div>
        ))}
      </div>
      <div style={{height:4,background:"var(--color-background-secondary)",borderRadius:2,marginBottom:14,overflow:"hidden"}}><div style={{height:"100%",width:`${pct}%`,background:C.green.border,borderRadius:2}}/></div>
      {done.length>0&&<div style={{marginBottom:14}}>
        <p style={{margin:"0 0 6px",fontSize:10,color:"var(--color-text-secondary)",textTransform:"uppercase"}}>Выполнено</p>
        {done.map(t=><div key={t.id} style={{display:"flex",gap:8,padding:"6px 0",borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
          <span style={{color:C.green.text}}>✓</span>
          <div style={{flex:1}}><p style={{margin:0,fontSize:12,fontWeight:500}}>{t.title}</p><p style={{margin:0,fontSize:11,color:"var(--color-text-secondary)"}}>{t.comment||"—"}</p></div>
          {t.resultType&&<Badge color={RESULTS.find(r=>r.id===t.resultType)?.color||"gray"} sm>{RESULTS.find(r=>r.id===t.resultType)?.label}</Badge>}
        </div>)}
      </div>}
      <button onClick={generate} disabled={loading} style={{fontSize:12,padding:"7px 16px"}}>{loading?<Spin label="Анализируем…"/>:"Отчёт для руководителя ↗"}</button>
      {err&&<p style={{fontSize:11,color:C.red.text,marginTop:6}}>{err}</p>}
      {report&&<div style={{marginTop:12}}>
        <div style={{display:"flex",gap:12,alignItems:"center",padding:"10px 12px",background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",marginBottom:10}}>
          <div style={{width:44,height:44,borderRadius:"50%",background:C[rc(report.rating)].bg,color:C[rc(report.rating)].text,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:16,fontWeight:500}}>{report.rating}</span><span style={{fontSize:8}}>из 10</span></div>
          <div><p style={{margin:"0 0 2px",fontSize:13,fontWeight:500}}>{report.rating_comment}</p><p style={{margin:0,fontSize:12,color:"var(--color-text-secondary)"}}>{report.done_summary}</p></div>
        </div>
        {(report.risks||[]).map((r,i)=><div key={i} style={{background:C.coral.bg,border:`0.5px solid ${C.coral.border}`,borderRadius:"var(--border-radius-md)",padding:"7px 10px",marginBottom:6}}><p style={{margin:0,fontSize:12,color:C.coral.text}}><strong>{r.deal}:</strong> {r.risk}</p></div>)}
        {(report.tomorrow||[]).length>0&&<><p style={{margin:"10px 0 6px",fontSize:10,color:"var(--color-text-secondary)",textTransform:"uppercase"}}>Приоритеты завтра</p>{report.tomorrow.map((a,i)=><div key={i} style={{display:"flex",gap:8,padding:"5px 0",borderBottom:"0.5px solid var(--color-border-tertiary)"}}><span style={{width:16,height:16,borderRadius:"50%",background:C.blue.bg,color:C.blue.text,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,flexShrink:0}}>{i+1}</span><span style={{fontSize:12}}>{typeof a==="string"?a:a.action}</span></div>)}</>}
        {report.manager_note&&<div style={{marginTop:8,padding:"7px 10px",border:`0.5px solid ${C.purple.border}`,borderRadius:"var(--border-radius-md)",background:C.purple.bg}}><p style={{margin:"0 0 2px",fontSize:9,color:C.purple.text,textTransform:"uppercase",fontWeight:500}}>Заметка руководителю</p><p style={{margin:0,fontSize:12,color:C.purple.text}}>{report.manager_note}</p></div>}
      </div>}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [ready,setReady]=useState(false);
  const [initErr,setInitErr]=useState("");
  const [currentUser,setCurrentUser]=useState(null);
  const [viewUser,setViewUser]=useState(null);
  const [users,setUsers]=useState([]);
  const [isAdmin,setIsAdmin]=useState(false);
  const [deals,setDeals]=useState([]);
  const [tasks,setTasks]=useState([]);
  const [queue,setQueue]=useState([]);
  const [loading,setLoading]=useState(false);
  const [loadMsg,setLoadMsg]=useState("");
  const [errors,setErrors]=useState([]);
  const [tab,setTab]=useState("today");
  const [busy,setBusy]=useState(false);
  const [statusChanging,setStatusChanging]=useState(null);

  const addErr=(msg)=>setErrors(e=>[...e.slice(-2),msg]);

  // ── BX24 init on mount ─────────────────────────────────────────────────────
  useEffect(()=>{
    const init=()=>{
      if(!window.BX24){setInitErr("BX24 SDK не загружен — откройте из Bitrix24"); return;}
      window.BX24.init(async()=>{
        setReady(true);
        setLoading(true);setLoadMsg("Определяем пользователя…");
        try{
          const user=await bx24("user.current");
          const u={id:user.ID,name:`${user.NAME} ${user.LAST_NAME}`.trim(),position:user.WORK_POSITION||"Менеджер",isAdmin:user.IS_ADMIN==="Y"};
          setCurrentUser(u); setViewUser(u); setIsAdmin(u.isAdmin);
          if(u.isAdmin){
            try{
              const all=await bx24("user.get",{filter:{ACTIVE:true}});
              setUsers((all||[]).map(x=>({id:x.ID,name:`${x.NAME} ${x.LAST_NAME}`.trim(),position:x.WORK_POSITION||"Менеджер"})));
            }catch{}
          }
        }catch(e){addErr(e.message);}
        setLoading(false);setLoadMsg("");
      });
    };
    if(document.readyState==="complete") init();
    else window.addEventListener("load",init);
    return ()=>window.removeEventListener("load",init);
  },[]);

  // ── Load data when viewUser set ────────────────────────────────────────────
  useEffect(()=>{ if(viewUser) loadData(viewUser.id); },[viewUser]);

  const loadData=useCallback(async(userId)=>{
    setLoading(true);setDeals([]);setTasks([]);setQueue([]);
    try{
      setLoadMsg("Загружаем сделки…");
      const dealsRaw=await bx24("crm.deal.list",{filter:{ASSIGNED_BY_ID:userId,"!STAGE_ID":["WON","LOSE"]},select:["ID","TITLE","STAGE_ID","OPPORTUNITY","CURRENCY_ID","DATE_CREATE","COMMENTS"]});
      setDeals(dealsRaw||[]);

      setLoadMsg("Загружаем задачи…");
      const tasksRaw=await bx24("tasks.task.list",{filter:{RESPONSIBLE_ID:userId,"!STATUS":5},select:["ID","TITLE","STATUS","PRIORITY","DEADLINE","UF_CRM_TASK","DESCRIPTION"]});
      const list=((tasksRaw||{}).tasks||tasksRaw||[]).map(t=>({
        id:t.ID||t.id, title:t.TITLE||t.title,
        status:"pending",
        priority:(t.PRIORITY||t.priority)>1?"high":"medium",
        deadline:fmtDate(t.DEADLINE||t.deadline),
        dealId:((t.UF_CRM_TASK||t.uf_crm_task||[])[0]||"").replace(/^D_/,""),
        type:"call", tags:[], comment:"",
      }));
      setTasks(list.filter(t=>isToday(t.deadline)||isOverdue(t.deadline)));
      setQueue(list.filter(t=>isFuture(t.deadline)));
    }catch(e){addErr(e.message);}
    setLoading(false);setLoadMsg("");
  },[]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const quickResult=useCallback(async(taskId,resultType,label)=>{
    setStatusChanging(taskId);
    setTasks(ts=>ts.filter(t=>t.id!==taskId));
    try{
      await bx24("tasks.task.update",{taskId,fields:{STATUS:5}});
      await bx24("task.comment.add",{TASK_ID:taskId,FIELDS:{POST_MESSAGE:`[${label}] Быстрое закрытие`}});
    }catch(e){addErr(e.message);}
    setStatusChanging(null);
  },[]);

  const handleComplete=useCallback(async(taskId,{result,comment})=>{
    setBusy(true);
    setTasks(ts=>ts.map(t=>t.id===taskId?{...t,status:"done",comment,resultType:result}:t));
    try{
      await bx24("tasks.task.update",{taskId,fields:{STATUS:5}});
      await bx24("task.comment.add",{TASK_ID:taskId,FIELDS:{POST_MESSAGE:`[${RESULTS.find(r=>r.id===result)?.label}] ${comment}`}});
    }catch(e){addErr(e.message);}
    setBusy(false);
  },[]);

  const handleReschedule=useCallback(async(taskId,{date,comment})=>{
    setBusy(true);
    const iso=new Date(date).toISOString();
    setTasks(ts=>ts.map(t=>t.id===taskId?{...t,status:"rescheduled",comment,deadline:fmtDate(iso)}:t));
    try{
      await bx24("tasks.task.update",{taskId,fields:{DEADLINE:iso}});
      await bx24("task.comment.add",{TASK_ID:taskId,FIELDS:{POST_MESSAGE:`[Перенесено на ${fmtDate(iso)}] ${comment}`}});
    }catch(e){addErr(e.message);}
    setBusy(false);
  },[]);

  const handleTagsChange=useCallback((taskId,tags)=>{
    setTasks(ts=>ts.map(t=>t.id===taskId?{...t,tags}:t));
    setQueue(qs=>qs.map(t=>t.id===taskId?{...t,tags}:t));
  },[]);

  // ── Computed ───────────────────────────────────────────────────────────────
  const todayTasks=tasks.filter(t=>isToday(t.deadline)&&t.status!=="done"&&t.status!=="rescheduled");
  const overdueTasks=tasks.filter(t=>isOverdue(t.deadline));
  const doneTasks=tasks.filter(t=>t.status==="done");

  if(initErr) return <div style={{padding:24,background:C.amber.bg,borderRadius:12,margin:16}}><p style={{margin:0,color:C.amber.text,fontSize:14,fontWeight:500}}>{initErr}</p></div>;

  const TABS=[{id:"today",label:`Сегодня (${todayTasks.length})`},{id:"queue",label:`Очередь (${queue.length})`},{id:"report",label:`Отчёт${doneTasks.length>0?" ●":""}`},{id:"settings",label:"Настройки"}];

  return (
    <div style={{padding:"0 0 2rem"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:8}}>
        <div>
          <p style={{margin:0,fontSize:10,color:"var(--color-text-tertiary)",textTransform:"uppercase",letterSpacing:"0.08em"}}>Рабочий день</p>
          <h2 style={{margin:0,fontSize:17,fontWeight:500}}>{todayStr}</h2>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          {isAdmin&&users.length>0&&<select onChange={e=>{const u=users.find(x=>String(x.id)===e.target.value);if(u)setViewUser(u);}} value={String(viewUser?.id||"")} style={{fontSize:12,padding:"5px 10px",borderRadius:"var(--border-radius-md)",border:"0.5px solid var(--color-border-secondary)"}}>
            {users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
          </select>}
          <button onClick={()=>viewUser&&loadData(viewUser.id)} disabled={loading} style={{fontSize:11,padding:"5px 12px"}}>↻ Обновить</button>
        </div>
      </div>

      {errors.map((e,i)=><div key={i} style={{background:C.red.bg,border:`0.5px solid ${C.red.border}`,borderRadius:"var(--border-radius-md)",padding:"8px 12px",marginBottom:8}}><p style={{margin:0,fontSize:12,color:C.red.text}}>⚠ {e}</p></div>)}
      {loading&&<div style={{marginBottom:12}}><Spin label={loadMsg}/></div>}

      {viewUser&&<div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,padding:"8px 12px",background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)"}}>
        <div style={{width:30,height:30,borderRadius:"50%",background:C.purple.bg,color:C.purple.text,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:500,flexShrink:0}}>{viewUser.name.split(" ").slice(0,2).map(n=>n[0]).join("")}</div>
        <div style={{flex:1}}><p style={{margin:0,fontSize:13,fontWeight:500}}>{viewUser.name}</p><p style={{margin:0,fontSize:11,color:"var(--color-text-secondary)"}}>{viewUser.position}</p></div>
        {isAdmin&&currentUser?.id!==viewUser?.id&&<Badge color="purple" sm>просмотр</Badge>}
      </div>}

      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        <Stat label="Сегодня" value={todayTasks.length} color="blue"/>
        <Stat label="Выполнено" value={doneTasks.length} color="green"/>
        <Stat label="Просрочено" value={overdueTasks.length} color={overdueTasks.length>0?"red":"gray"}/>
        <Stat label="Очередь" value={queue.length} color="gray"/>
      </div>

      {overdueTasks.length>0&&<div style={{background:C.red.bg,border:`0.5px solid ${C.red.border}`,borderRadius:"var(--border-radius-lg)",padding:"10px 12px",marginBottom:12}}>
        <p style={{margin:"0 0 6px",fontSize:12,fontWeight:500,color:C.red.text}}>⚠ Просроченные — закрыть или перенести</p>
        {overdueTasks.map(t=><div key={t.id} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 0",borderBottom:`0.5px solid ${C.red.border}`}}>
          <span style={{flex:1,fontSize:12,color:C.red.text}}>{t.title}</span>
          <span style={{fontSize:11,color:C.red.text}}>{t.deadline}</span>
          <button onClick={()=>handleReschedule(t.id,{date:tomorrowISO(),comment:"Перенесено на завтра"})} disabled={busy} style={{fontSize:10,padding:"2px 8px"}}>→ Завтра</button>
          <button onClick={()=>quickResult(t.id,"done","Закрыто")} disabled={busy} style={{fontSize:10,padding:"2px 8px"}}>✓</button>
        </div>)}
      </div>}

      <div style={{display:"flex",borderBottom:"0.5px solid var(--color-border-tertiary)",marginBottom:12}}>
        {TABS.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{background:"transparent",border:"none",padding:"6px 12px",fontSize:12,cursor:"pointer",color:tab===t.id?"var(--color-text-primary)":"var(--color-text-secondary)",borderBottom:tab===t.id?"2px solid var(--color-text-primary)":"2px solid transparent",fontWeight:tab===t.id?500:400}}>{t.label}</button>)}
      </div>

      {tab==="today"&&<>
        {todayTasks.length===0&&!loading&&<p style={{fontSize:13,color:"var(--color-text-tertiary)"}}>Нет дел на сегодня — возьмите из очереди.</p>}
        {todayTasks.map(t=><TaskCard key={t.id} task={t} deals={deals} allTasks={tasks} onQuickResult={quickResult} onComplete={handleComplete} onReschedule={handleReschedule} onTagsChange={handleTagsChange} busy={busy} statusChanging={statusChanging}/>)}
        {doneTasks.length>0&&<><p style={{margin:"12px 0 6px",fontSize:10,color:"var(--color-text-secondary)",textTransform:"uppercase"}}>Выполнено ({doneTasks.length})</p>{doneTasks.map(t=><TaskCard key={t.id} task={t} deals={deals} allTasks={tasks} onQuickResult={()=>{}} onComplete={handleComplete} onReschedule={handleReschedule} onTagsChange={handleTagsChange} busy={busy} statusChanging={statusChanging}/>)}</>}
      </>}

      {tab==="queue"&&<>
        <p style={{margin:"0 0 8px",fontSize:12,color:"var(--color-text-secondary)"}}>Задачи на будущие даты</p>
        {queue.length===0&&<p style={{fontSize:13,color:"var(--color-text-tertiary)"}}>Очередь пуста</p>}
        {queue.map(t=><TaskCard key={t.id} task={t} deals={deals} allTasks={tasks} onQuickResult={quickResult} onComplete={handleComplete} onReschedule={handleReschedule} onTagsChange={handleTagsChange} busy={busy} statusChanging={statusChanging}/>)}
      </>}

      {tab==="report"&&<ReportTab tasks={tasks} queue={queue} userName={viewUser?.name||""}/>}

      {tab==="settings"&&<div>
        <p style={{margin:"0 0 10px",fontSize:13,fontWeight:500}}>Теги</p>
        <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:16}}>{TAGS.map(t=><span key={t.id} style={{background:t.bg,color:t.color,border:`0.5px solid ${t.color}`,borderRadius:5,padding:"3px 9px",fontSize:11,fontWeight:500}}>{t.label}</span>)}</div>
        <div style={{borderTop:"0.5px solid var(--color-border-tertiary)",paddingTop:12}}>
          <p style={{margin:"0 0 8px",fontSize:13,fontWeight:500}}>Правила</p>
          {["Обязательный комментарий при переносе","Блокировка слотов при встречах","Запрет закрытия без результата","Отчёт руководителю в конце дня"].map((r,i)=><label key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:12,padding:"5px 0",borderBottom:"0.5px solid var(--color-border-tertiary)",cursor:"pointer"}}><input type="checkbox" defaultChecked/>{r}</label>)}
        </div>
      </div>}
    </div>
  );
}
