import { useState, useCallback, useRef } from "react";

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";
const BITRIX_MCP = { type: "url", url: "https://mcp.bitrix24.com/mcp", name: "bitrix24" };

// ── helpers ──────────────────────────────────────────────────────────────────
const C = {
  purple: { bg: "#EEEDFE", text: "#3C3489", border: "#AFA9EC" },
  teal:   { bg: "#E1F5EE", text: "#0F6E56", border: "#5DCAA5" },
  coral:  { bg: "#FAECE7", text: "#712B13", border: "#F0997B" },
  amber:  { bg: "#FAEEDA", text: "#633806", border: "#EF9F27" },
  blue:   { bg: "#E6F1FB", text: "#0C447C", border: "#85B7EB" },
  green:  { bg: "#EAF3DE", text: "#3B6D11", border: "#97C459" },
  gray:   { bg: "#F1EFE8", text: "#444441", border: "#B4B2A9" },
  red:    { bg: "#FCEBEB", text: "#791F1F", border: "#F09595" },
};

const todayStr = () => new Date().toLocaleDateString("ru-RU");
const tomorrowStr = () => { const d = new Date(); d.setDate(d.getDate()+1); return d.toLocaleDateString("ru-RU"); };
const isOverdue = (dl) => {
  if (!dl) return false;
  const parts = dl.split(".");
  if (parts.length < 3) return false;
  const date = new Date(parts[2], parts[1]-1, parts[0]);
  return date < new Date(new Date().toDateString());
};
const isTodayOrFuture = (dl) => !dl || !isOverdue(dl);

const TASK_STATUS = { 1:"Новая", 2:"Ожидает", 3:"В работе", 5:"Завершена", 6:"Отложена" };
const DEAL_STAGE_COLOR = { NEW:"blue", PREPARATION:"purple", PREPAYMENT_INVOICE:"amber", EXECUTING:"amber", FINAL_INVOICE:"teal", WON:"green", LOSE:"red", APOLOGY:"red" };

const extractText = (content=[]) => content.filter(b=>b.type==="text").map(b=>b.text).join("\n");
const parseJSON = (text) => {
  try {
    const clean = text.replace(/```json|```/g,"").trim();
    const s = clean.indexOf("{"), e = clean.lastIndexOf("}");
    if (s<0||e<0) return null;
    return JSON.parse(clean.slice(s,e+1));
  } catch { return null; }
};
const parseArr = (text) => {
  try {
    const clean = text.replace(/```json|```/g,"").trim();
    const s = clean.indexOf("["), e = clean.lastIndexOf("]");
    if (s<0||e<0) return null;
    return JSON.parse(clean.slice(s,e+1));
  } catch { return null; }
};

// ── low-level api call ────────────────────────────────────────────────────────
async function callClaude(userMsg, systemMsg, history=[]) {
  const messages = [...history.map(h=>({role:h.role, content:h.content})), {role:"user", content:userMsg}];
  const res = await fetch(API_URL, {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ model:MODEL, max_tokens:1000, system:systemMsg, messages, mcp_servers:[BITRIX_MCP] })
  });
  if (!res.ok) { const err = await res.json().catch(()=>{}); throw new Error(err?.error?.message || `HTTP ${res.status}`); }
  return await res.json();
}

// ── ui primitives ─────────────────────────────────────────────────────────────
function Badge({color="gray", children, sm}) {
  const c=C[color]||C.gray;
  return <span style={{background:c.bg,color:c.text,border:`0.5px solid ${c.border}`,borderRadius:6,padding:sm?"1px 6px":"3px 9px",fontSize:sm?10:11,fontWeight:500,whiteSpace:"nowrap"}}>{children}</span>;
}
function Spin({label="Загрузка…"}) {
  return <span style={{display:"flex",alignItems:"center",gap:8,color:"var(--color-text-secondary)",fontSize:13}}>
    <svg width="14" height="14" viewBox="0 0 14 14" style={{animation:"spin 1s linear infinite",flexShrink:0}}><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="22 8"/></svg>{label}
  </span>;
}
function Stat({label,value,color="gray",note}) {
  return <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"10px 14px",flex:1,minWidth:100}}>
    <p style={{margin:0,fontSize:11,color:"var(--color-text-secondary)",marginBottom:2}}>{label}</p>
    <p style={{margin:0,fontSize:20,fontWeight:500,color:C[color].text}}>{value}</p>
    {note&&<p style={{margin:0,fontSize:10,color:"var(--color-text-tertiary)",marginTop:2}}>{note}</p>}
  </div>;
}
function Err({msg}) {
  return <div style={{background:C.red.bg,border:`0.5px solid ${C.red.border}`,borderRadius:"var(--border-radius-md)",padding:"10px 14px",marginBottom:12}}>
    <p style={{margin:0,fontSize:12,color:C.red.text}}>⚠ {msg}</p>
  </div>;
}
function Tab({tabs,active,onChange}) {
  return <div style={{display:"flex",gap:0,borderBottom:"0.5px solid var(--color-border-tertiary)",marginBottom:16,flexWrap:"wrap"}}>
    {tabs.map(t=><button key={t.id} onClick={()=>onChange(t.id)} style={{background:"transparent",border:"none",padding:"7px 14px",fontSize:12,cursor:"pointer",color:active===t.id?"var(--color-text-primary)":"var(--color-text-secondary)",borderBottom:active===t.id?"2px solid var(--color-text-primary)":"2px solid transparent",fontWeight:active===t.id?500:400}}>{t.label}{t.dot?" ●":""}</button>)}
  </div>;
}

// ── task card ─────────────────────────────────────────────────────────────────
function TaskCard({task, onStatusChange, onComment, statusChanging, busy}) {
  const [showComment,setShowComment]=useState(false);
  const [comment,setComment]=useState("");
  const overdue = task.deadline && isOverdue(task.deadline);
  const done = task.status===5;
  const borderColor = done ? C.green.border : overdue ? C.red.border : "var(--color-border-tertiary)";

  return <div style={{background:"var(--color-background-primary)",border:`0.5px solid ${borderColor}`,borderRadius:"var(--border-radius-lg)",padding:"12px 14px",marginBottom:8}}>
    <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
      <button
        onClick={()=>!done&&!busy&&onStatusChange(task.id, done?3:5)}
        disabled={busy||done}
        style={{marginTop:2,width:18,height:18,borderRadius:"50%",border:`1.5px solid ${done?C.green.border:C.gray.border}`,background:done?C.green.bg:"transparent",cursor:done?"default":"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:C.green.text}}
        title={done?"Завершена":"Отметить выполненной"}
        aria-label="Изменить статус задачи"
      >{done?"✓":""}</button>
      <div style={{flex:1}}>
        <p style={{margin:"0 0 4px",fontSize:13,fontWeight:500,color:done?"var(--color-text-tertiary)":"var(--color-text-primary)",textDecoration:done?"line-through":"none"}}>{task.title}</p>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
          {task.deal&&<Badge color="purple" sm>{task.deal}</Badge>}
          {task.deadline&&<Badge color={overdue?"red":done?"green":"gray"} sm>{overdue?"Просрочено: ":""}{task.deadline}</Badge>}
          <Badge color={done?"green":task.status===3?"teal":"gray"} sm>{TASK_STATUS[task.status]||"—"}</Badge>
          {task.priority==="high"&&!done&&<Badge color="coral" sm>срочно</Badge>}
        </div>
        {task.description&&<p style={{margin:"6px 0 0",fontSize:12,color:"var(--color-text-secondary)"}}>{task.description}</p>}
      </div>
      {!done&&<button onClick={()=>setShowComment(v=>!v)} style={{fontSize:11,padding:"4px 10px",flexShrink:0}} aria-label="Добавить результат">
        {showComment?"Закрыть":"Результат"}
      </button>}
    </div>

    {statusChanging===task.id&&<div style={{marginTop:8}}><Spin label="Обновляем в Bitrix24…"/></div>}

    {showComment&&!done&&<div style={{marginTop:10,borderTop:"0.5px solid var(--color-border-tertiary)",paddingTop:10}}>
      <p style={{margin:"0 0 6px",fontSize:11,color:"var(--color-text-secondary)"}}>Результат / комментарий к задаче</p>
      <textarea
        value={comment} onChange={e=>setComment(e.target.value)}
        placeholder="Что сделано? Какой результат? Прикрепи скрины в Bitrix24 нативно."
        style={{width:"100%",minHeight:70,fontSize:12,padding:8,borderRadius:"var(--border-radius-md)",border:"0.5px solid var(--color-border-secondary)",background:"var(--color-background-secondary)",color:"var(--color-text-primary)",resize:"vertical",boxSizing:"border-box"}}
      />
      <div style={{display:"flex",gap:8,marginTop:6,justifyContent:"flex-end"}}>
        <button onClick={()=>{setShowComment(false);setComment("");}} style={{fontSize:11,padding:"5px 12px"}}>Отмена</button>
        <button onClick={()=>{onComment(task.id,comment);setShowComment(false);setComment("");}} disabled={!comment.trim()||busy} style={{fontSize:11,padding:"5px 12px"}} aria-label="Сохранить результат">Сохранить + завершить ↗</button>
      </div>
    </div>}
  </div>;
}

// ── ai-generated task proposal ────────────────────────────────────────────────
function AITaskProposal({proposal, onApprove, onReject, busy}) {
  return <div style={{background:C.purple.bg,border:`0.5px solid ${C.purple.border}`,borderRadius:"var(--border-radius-lg)",padding:"12px 14px",marginBottom:8}}>
    <div style={{display:"flex",gap:8,alignItems:"flex-start",marginBottom:6}}>
      <span style={{fontSize:10,background:C.purple.bg,color:C.purple.text,border:`0.5px solid ${C.purple.border}`,borderRadius:4,padding:"2px 6px",flexShrink:0}}>ИИ</span>
      <p style={{margin:0,fontSize:13,fontWeight:500,color:C.purple.text}}>{proposal.title}</p>
    </div>
    {proposal.description&&<p style={{margin:"0 0 6px",fontSize:12,color:C.purple.text,opacity:0.8}}>{proposal.description}</p>}
    <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
      {proposal.deadline&&<Badge color="purple" sm>📅 {proposal.deadline}</Badge>}
      {proposal.priority&&<Badge color={proposal.priority==="high"?"coral":"amber"} sm>{proposal.priority==="high"?"срочно":"обычный"}</Badge>}
      <div style={{flex:1}}/>
      <button onClick={()=>onReject(proposal)} style={{fontSize:11,padding:"4px 10px"}} disabled={busy}>Отклонить</button>
      <button onClick={()=>onApprove(proposal)} style={{fontSize:11,padding:"4px 10px"}} disabled={busy}>Создать ↗</button>
    </div>
  </div>;
}

// ── main app ──────────────────────────────────────────────────────────────────
export default function App() {
  const [mode, setMode] = useState("admin"); // admin | employee
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [deals, setDeals] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [overdueTasks, setOverdueTasks] = useState([]);
  const [aiProposals, setAiProposals] = useState([]);
  const [report, setReport] = useState(null);
  const [tab, setTab] = useState("tasks");
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState("");
  const [statusChanging, setStatusChanging] = useState(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState([]);
  const [generatingTasks, setGeneratingTasks] = useState(false);
  const [selectedDealForAI, setSelectedDealForAI] = useState(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const convHistory = useRef([]);

  const addError = (msg) => setErrors(e=>[...e.slice(-2), msg]);
  const clearErrors = () => setErrors([]);

  // ── load users list (admin) ──────────────────────────────────────────────
  const loadUsers = useCallback(async () => {
    setLoading(true); setLoadMsg("Загружаем сотрудников…"); clearErrors();
    try {
      const res = await callClaude(
        "Получи список всех пользователей Bitrix24 через user.get или user.search. Верни JSON массив: [{id, name, position, active}]",
        "Ты интеграция Bitrix24. Используй MCP. Отвечай ТОЛЬКО JSON без markdown."
      );
      const text = extractText(res.content);
      const parsed = parseArr(text) || parseJSON(text)?.users;
      if (Array.isArray(parsed) && parsed.length > 0) {
        setUsers(parsed);
      } else {
        // fallback demo users
        setUsers([
          {id:1, name:"Алексей Иванов", position:"Менеджер по продажам", active:true},
          {id:2, name:"Мария Петрова", position:"Старший менеджер", active:true},
          {id:3, name:"Кирилл Сидоров", position:"Менеджер", active:true},
        ]);
      }
    } catch(e) { addError(e.message); setUsers([{id:1,name:"Алексей Иванов",position:"Менеджер",active:true}]); }
    finally { setLoading(false); setLoadMsg(""); }
  }, []);

  // ── load data for selected user ──────────────────────────────────────────
  const loadUserData = useCallback(async (user) => {
    setLoading(true); setLoadMsg("Загружаем сделки…"); clearErrors();
    setDeals([]); setTasks([]); setOverdueTasks([]); setAiProposals([]); setReport(null);
    convHistory.current = [];

    try {
      // Step 1: deals
      const today = new Date().toISOString().split("T")[0];
      const dealRes = await callClaude(
        `Получи сделки из Bitrix24 где ASSIGNED_BY_ID = ${user.id}. Используй crm.deal.list с фильтром ASSIGNED_BY_ID=${user.id}. Верни JSON: {deals:[{id,title,stage_id,opportunity,currency_id,contact_name,date_modify,activities_count}]}`,
        "Bitrix24 MCP интеграция. ТОЛЬКО JSON без markdown."
      );
      const dealText = extractText(dealRes.content);
      const dealData = parseJSON(dealText);
      const dealsArr = dealData?.deals || [];
      setDeals(dealsArr);
      convHistory.current.push({role:"user",content:`Сделки пользователя: ${JSON.stringify(dealsArr)}`},{role:"assistant",content:"Данные о сделках получены."});

      // Step 2: tasks
      setLoadMsg("Загружаем задачи…");
      const taskRes = await callClaude(
        `Получи задачи из Bitrix24 для пользователя ID=${user.id} (RESPONSIBLE_ID=${user.id}). Используй tasks.task.list. Верни JSON: {tasks:[{id,title,status,priority,deadline,uf_crm_task,description,createdBy}]}`,
        "Bitrix24 MCP. ТОЛЬКО JSON без markdown."
      );
      const taskText = extractText(taskRes.content);
      const taskData = parseJSON(taskText);
      const allTasks = (taskData?.tasks || []).map(t=>({
        ...t,
        deal: t.uf_crm_task?.[0]?.replace("D_",""):"",
        deadline: t.deadline ? new Date(t.deadline).toLocaleDateString("ru-RU") : null,
        priority: t.priority>0?"high":"medium",
      }));

      // Separate overdue vs active
      const active = allTasks.filter(t => t.status!==5 && isTodayOrFuture(t.deadline));
      const overdue = allTasks.filter(t => t.status!==5 && t.deadline && isOverdue(t.deadline));
      setTasks(active);
      setOverdueTasks(overdue);

    } catch(e) {
      addError(e.message);
      // fallback demo
      const today = todayStr(), tmr = tomorrowStr();
      setDeals([
        {id:101,title:"ООО Техстрой — оборудование",stage_id:"EXECUTING",opportunity:1850000,currency_id:"RUB",contact_name:"Морозов А.В."},
        {id:102,title:"Строй-Инвест — тендер",stage_id:"PREPARATION",opportunity:5600000,currency_id:"RUB",contact_name:"Алексеев К."},
        {id:103,title:"ИП Смирнов — консалтинг",stage_id:"NEW",opportunity:480000,currency_id:"RUB",contact_name:"Смирнов П."},
      ]);
      setTasks([
        {id:201,title:"Отправить КП в Техстрой",status:3,priority:"high",deadline:today,deal:"Техстрой",description:""},
        {id:202,title:"Согласовать договор Строй-Инвест",status:1,priority:"high",deadline:tmr,deal:"Строй-Инвест",description:""},
        {id:203,title:"Звонок Смирнову 15:00",status:1,priority:"medium",deadline:today,deal:"Смирнов",description:""},
      ]);
      setOverdueTasks([
        {id:200,title:"Обновить контакт в Строй-Инвест",status:1,priority:"medium",deadline:"27.05.2025",deal:"Строй-Инвест",description:""},
      ]);
    }
    setLoading(false); setLoadMsg("");
  }, []);

  // ── status change write-back ─────────────────────────────────────────────
  const changeTaskStatus = useCallback(async (taskId, newStatus) => {
    setStatusChanging(taskId);
    try {
      await callClaude(
        `Обнови статус задачи ID=${taskId} в Bitrix24 на STATUS=${newStatus}. Используй tasks.task.update с полями {id:${taskId}, fields:{STATUS:${newStatus}}}. Верни просто "ok".`,
        "Bitrix24 MCP. Выполни операцию обновления задачи."
      );
      setTasks(ts=>ts.map(t=>t.id===taskId?{...t,status:newStatus}:t));
      if (newStatus===5) setTasks(ts=>ts.filter(t=>t.id!==taskId)); // remove from active
    } catch(e) {
      addError(`Не удалось обновить задачу: ${e.message}`);
      // optimistic update anyway for demo
      setTasks(ts=>newStatus===5 ? ts.filter(t=>t.id!==taskId) : ts.map(t=>t.id===taskId?{...t,status:newStatus}:t));
    }
    setStatusChanging(null);
  }, []);

  // ── add comment + close task ─────────────────────────────────────────────
  const submitComment = useCallback(async (taskId, commentText) => {
    setBusy(true);
    try {
      await callClaude(
        `Добавь комментарий к задаче ID=${taskId} в Bitrix24 через task.comment.add: {taskId:${taskId}, fields:{POST_MESSAGE:"${commentText.replace(/"/g,"'")}"}}, затем обнови статус задачи на 5 (завершена) через tasks.task.update{id:${taskId}, fields:{STATUS:5}}. Верни "ok".`,
        "Bitrix24 MCP. Выполни последовательно: добавить комментарий, затем закрыть задачу."
      );
      setTasks(ts=>ts.filter(t=>t.id!==taskId));
    } catch(e) {
      addError(`Комментарий: ${e.message}`);
      setTasks(ts=>ts.filter(t=>t.id!==taskId));
    }
    setBusy(false);
  }, []);

  // ── reschedule overdue ───────────────────────────────────────────────────
  const rescheduleOverdue = useCallback(async (taskId) => {
    setBusy(true);
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1);
    const iso = tomorrow.toISOString();
    try {
      await callClaude(
        `Перенеси дедлайн задачи ID=${taskId} на завтра (${iso}) в Bitrix24 через tasks.task.update{id:${taskId}, fields:{DEADLINE:"${iso}"}}. Верни "ok".`,
        "Bitrix24 MCP. Обнови дедлайн задачи."
      );
      setOverdueTasks(ts=>ts.filter(t=>t.id!==taskId));
      setTasks(ts=>[...ts, ...overdueTasks.filter(t=>t.id===taskId).map(t=>({...t,deadline:tomorrowStr()}))]);
    } catch(e) {
      addError(`Перенос: ${e.message}`);
      const t = overdueTasks.find(t=>t.id===taskId);
      if (t) { setOverdueTasks(ts=>ts.filter(x=>x.id!==taskId)); setTasks(ts=>[...ts,{...t,deadline:tomorrowStr()}]); }
    }
    setBusy(false);
  }, [overdueTasks]);

  // ── ai generate tasks for deal ───────────────────────────────────────────
  const generateTasksForDeal = useCallback(async (deal) => {
    setGeneratingTasks(true); setAiProposals([]);
    try {
      const res = await callClaude(
        `Проанализируй сделку и создай конкретные задачи для менеджера.
Сделка: ${JSON.stringify(deal)}
Существующие задачи по этой сделке: ${JSON.stringify(tasks.filter(t=>t.deal&&deal.title?.toLowerCase().includes(t.deal.toLowerCase())))}

Правила:
- Только задачи, которые реально нужны для продвижения сделки
- Дедлайны: конкретные даты (сегодня, завтра, +2 дня, +5 дней)
- Не дублируй существующие задачи
- Максимум 4 задачи

Верни JSON массив: [{title, description, deadline, priority, reason}]
где priority = "high" | "medium", deadline = "DD.MM.YYYY"`,
        "Ты жёсткий CRM-аналитик. Генерируй только реально нужные задачи. ТОЛЬКО JSON массив без markdown."
      );
      const text = extractText(res.content);
      const proposals = parseArr(text);
      if (Array.isArray(proposals)) setAiProposals(proposals.map((p,i)=>({...p,_id:`ai_${Date.now()}_${i}`})));
    } catch(e) {
      addError(`ИИ-агент: ${e.message}`);
      setAiProposals([
        {_id:"ai_1",title:`Подготовить КП для ${deal.title}`,description:"Персонализированное коммерческое предложение",deadline:todayStr(),priority:"high",reason:"Сделка в активной стадии — нужен КП"},
        {_id:"ai_2",title:`Созвон с контактом по ${deal.title}`,description:"Уточнить потребности и возражения",deadline:tomorrowStr(),priority:"medium",reason:"Нет активностей за последние дни"},
      ]);
    }
    setGeneratingTasks(false);
  }, [tasks]);

  const approveAITask = useCallback(async (proposal) => {
    setBusy(true);
    try {
      const deadlineISO = proposal.deadline ? (() => {
        const [d,m,y]=proposal.deadline.split(".");
        return new Date(y,m-1,d).toISOString();
      })() : null;
      await callClaude(
        `Создай задачу в Bitrix24 через tasks.task.add: {fields:{TITLE:"${proposal.title}",DESCRIPTION:"${proposal.description||""}",RESPONSIBLE_ID:${selectedUser?.id||1},PRIORITY:${proposal.priority==="high"?2:1}${deadlineISO?`,DEADLINE:"${deadlineISO}"`:""}}}}. Верни "ok".`,
        "Bitrix24 MCP. Создай задачу."
      );
      setAiProposals(p=>p.filter(x=>x._id!==proposal._id));
      setTasks(ts=>[...ts, {id:Date.now(),title:proposal.title,description:proposal.description,status:1,priority:proposal.priority,deadline:proposal.deadline,deal:selectedDealForAI?.title||""}]);
    } catch(e) {
      addError(`Создание задачи: ${e.message}`);
      setAiProposals(p=>p.filter(x=>x._id!==proposal._id));
      setTasks(ts=>[...ts, {id:Date.now(),title:proposal.title,description:proposal.description,status:1,priority:proposal.priority,deadline:proposal.deadline,deal:selectedDealForAI?.title||""}]);
    }
    setBusy(false);
  }, [selectedUser, selectedDealForAI]);

  const rejectAITask = useCallback((proposal) => {
    setAiProposals(p=>p.filter(x=>x._id!==proposal._id));
  }, []);

  // ── generate daily report ────────────────────────────────────────────────
  const generateReport = useCallback(async () => {
    setGeneratingReport(true); setReport(null);
    try {
      const completedToday = tasks.filter(t=>t.status===5); // in real app, filter by completion date
      const res = await callClaude(
        `Составь ежедневный отчёт менеджера ${selectedUser?.name} за ${todayStr()}.
Данные:
- Активные задачи: ${JSON.stringify(tasks)}
- Просроченные: ${JSON.stringify(overdueTasks)}
- Сделки: ${JSON.stringify(deals)}

Требования к отчёту:
- Что сделано сегодня
- Что не сделано и почему (риски)
- Ключевые сделки в работе
- Что нужно сделать завтра (топ-3)
- Общая оценка продуктивности (1-10)

Верни JSON: {summary, done_count, pending_count, overdue_count, risks:[{deal,risk}], tomorrow:[{action}], score, score_comment}`,
        "Ты строгий руководитель отдела продаж. Отчёт должен быть честным и конкретным. ТОЛЬКО JSON без markdown."
      );
      const text = extractText(res.content);
      const parsed = parseJSON(text);
      setReport(parsed || {
        summary:`${selectedUser?.name} — рабочий день ${todayStr()}. В работе ${tasks.length} задач, ${overdueTasks.length} просроченных.`,
        done_count:0, pending_count:tasks.length, overdue_count:overdueTasks.length,
        risks:overdueTasks.map(t=>({deal:t.deal||"—",risk:t.title})),
        tomorrow:tasks.filter(t=>t.priority==="high").slice(0,3).map(t=>({action:t.title})),
        score:overdueTasks.length>0?5:7,
        score_comment:overdueTasks.length>0?"Есть просроченные задачи — требует внимания":"Задачи в норме"
      });
    } catch(e) { addError(`Отчёт: ${e.message}`); }
    setGeneratingReport(false);
  }, [tasks, overdueTasks, deals, selectedUser]);

  // ── computed ─────────────────────────────────────────────────────────────
  const todayTasks = tasks.filter(t=>t.deadline===todayStr());
  const futureTasks = tasks.filter(t=>!t.deadline||t.deadline!==todayStr());
  const hasData = deals.length>0 || tasks.length>0;

  const TABS = [
    {id:"tasks", label:`Задачи (${tasks.length})`, dot:overdueTasks.length>0},
    {id:"deals", label:`Сделки (${deals.length})`},
    {id:"ai", label:"ИИ-агент", dot:aiProposals.length>0},
    {id:"report", label:"Отчёт дня", dot:!!report},
  ];

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div style={{padding:"0 0 2rem"}}>
      <h2 className="sr-only">Bitrix24 AI-воркспейс</h2>

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:10}}>
        <div>
          <p style={{margin:0,fontSize:10,color:"var(--color-text-tertiary)",textTransform:"uppercase",letterSpacing:"0.08em"}}>AI воркспейс</p>
          <h2 style={{margin:0,fontSize:18,fontWeight:500}}>Bitrix24</h2>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <div style={{display:"flex",borderRadius:"var(--border-radius-md)",overflow:"hidden",border:"0.5px solid var(--color-border-secondary)"}}>
            {["admin","employee"].map(m=>(
              <button key={m} onClick={()=>setMode(m)} style={{fontSize:11,padding:"5px 12px",background:mode===m?"var(--color-background-secondary)":"transparent",border:"none",cursor:"pointer",fontWeight:mode===m?500:400}}>
                {m==="admin"?"👤 Администратор":"🧑‍💼 Сотрудник"}
              </button>
            ))}
          </div>
          {mode==="admin"&&(
            users.length===0
              ? <button onClick={loadUsers} disabled={loading} style={{fontSize:11,padding:"5px 12px"}}>Загрузить сотрудников ↗</button>
              : <select onChange={e=>{const u=users.find(x=>String(x.id)===e.target.value);setSelectedUser(u);if(u)loadUserData(u);}} style={{fontSize:12,padding:"5px 10px",borderRadius:"var(--border-radius-md)",border:"0.5px solid var(--color-border-secondary)"}}>
                  <option value="">— выбрать сотрудника —</option>
                  {users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
          )}
          {mode==="employee"&&!selectedUser&&(
            <button onClick={()=>{ loadUsers().then(()=>{}); }} style={{fontSize:11,padding:"5px 12px"}}>Войти ↗</button>
          )}
          {hasData&&<button onClick={()=>selectedUser&&loadUserData(selectedUser)} disabled={loading} style={{fontSize:11,padding:"5px 12px"}}>↻</button>}
        </div>
      </div>

      {/* Errors */}
      {errors.map((e,i)=><Err key={i} msg={e}/>)}

      {/* Loading */}
      {loading&&<div style={{marginBottom:16}}><Spin label={loadMsg}/></div>}

      {/* Empty state */}
      {!hasData&&!loading&&(
        <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-lg)",padding:"36px 24px",textAlign:"center"}}>
          <i className="ti ti-users" style={{fontSize:28,color:"var(--color-text-tertiary)"}} aria-hidden="true"/>
          <p style={{margin:"10px 0 4px",fontSize:14,fontWeight:500}}>
            {mode==="admin"?"Выберите сотрудника для просмотра воркспейса":"Авторизуйтесь для просмотра задач"}
          </p>
          <p style={{margin:0,fontSize:12,color:"var(--color-text-secondary)"}}>
            {mode==="admin"
              ?"Загрузите список сотрудников → выберите менеджера → получите полный обзор"
              :"Войдите через аккаунт Bitrix24 для доступа к своим задачам и сделкам"}
          </p>
        </div>
      )}

      {/* Main content */}
      {hasData&&selectedUser&&(
        <>
          {/* User bar */}
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,padding:"10px 14px",background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)"}}>
            <div style={{width:32,height:32,borderRadius:"50%",background:C.purple.bg,color:C.purple.text,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:500,flexShrink:0}}>
              {selectedUser.name.split(" ").slice(0,2).map(n=>n[0]).join("")}
            </div>
            <div style={{flex:1}}>
              <p style={{margin:0,fontSize:13,fontWeight:500}}>{selectedUser.name}</p>
              <p style={{margin:0,fontSize:11,color:"var(--color-text-secondary)"}}>{selectedUser.position||"Менеджер"}</p>
            </div>
            <span style={{fontSize:11,color:"var(--color-text-tertiary)"}}>{todayStr()}</span>
          </div>

          {/* Stats */}
          <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
            <Stat label="Задач сегодня" value={todayTasks.length} color="purple"/>
            <Stat label="Всего активных" value={tasks.length} color="teal"/>
            <Stat label="Просроченных" value={overdueTasks.length} color={overdueTasks.length>0?"red":"gray"} note={overdueTasks.length>0?"требует решения":"всё в порядке"}/>
            <Stat label="Сделок" value={deals.length} color="blue"/>
          </div>

          {/* Overdue alert */}
          {overdueTasks.length>0&&(
            <div style={{background:C.red.bg,border:`0.5px solid ${C.red.border}`,borderRadius:"var(--border-radius-lg)",padding:"12px 14px",marginBottom:16}}>
              <p style={{margin:"0 0 8px",fontSize:12,fontWeight:500,color:C.red.text}}>⚠ Просроченные задачи — требуют немедленного решения</p>
              {overdueTasks.map(t=>(
                <div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"0.5px solid "+C.red.border}}>
                  <span style={{flex:1,fontSize:12,color:C.red.text}}>{t.title}</span>
                  {t.deal&&<Badge color="red" sm>{t.deal}</Badge>}
                  <button onClick={()=>rescheduleOverdue(t.id)} disabled={busy} style={{fontSize:10,padding:"3px 8px"}}>→ Завтра</button>
                  <button onClick={()=>changeTaskStatus(t.id,5)} disabled={busy||statusChanging===t.id} style={{fontSize:10,padding:"3px 8px"}}>Закрыть</button>
                </div>
              ))}
            </div>
          )}

          <Tab tabs={TABS} active={tab} onChange={setTab}/>

          {/* ── TASKS TAB ── */}
          {tab==="tasks"&&(
            <>
              {todayTasks.length>0&&(
                <>
                  <p style={{margin:"0 0 8px",fontSize:11,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:"0.06em"}}>Сегодня</p>
                  {todayTasks.map(t=><TaskCard key={t.id} task={t} onStatusChange={changeTaskStatus} onComment={submitComment} statusChanging={statusChanging} busy={busy}/>)}
                </>
              )}
              {futureTasks.length>0&&(
                <>
                  <p style={{margin:"16px 0 8px",fontSize:11,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:"0.06em"}}>Запланировано</p>
                  {futureTasks.map(t=><TaskCard key={t.id} task={t} onStatusChange={changeTaskStatus} onComment={submitComment} statusChanging={statusChanging} busy={busy}/>)}
                </>
              )}
              {tasks.length===0&&<p style={{fontSize:13,color:"var(--color-text-tertiary)"}}>Нет активных задач на сегодня и будущее</p>}
            </>
          )}

          {/* ── DEALS TAB ── */}
          {tab==="deals"&&(
            <>
              {deals.map(deal=>(
                <div key={deal.id} style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:"12px 14px",marginBottom:8}}>
                  <div style={{display:"flex",gap:8,alignItems:"flex-start",marginBottom:6}}>
                    <div style={{flex:1}}>
                      <p style={{margin:"0 0 4px",fontSize:13,fontWeight:500}}>{deal.title}</p>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                        <Badge color={DEAL_STAGE_COLOR[deal.stage_id]||"gray"} sm>{deal.stage_id||"—"}</Badge>
                        {deal.opportunity&&<Badge color="teal" sm>{Number(deal.opportunity).toLocaleString("ru")} {deal.currency_id||"₽"}</Badge>}
                        {deal.contact_name&&<Badge color="gray" sm>{deal.contact_name}</Badge>}
                      </div>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:6,marginTop:8,borderTop:"0.5px solid var(--color-border-tertiary)",paddingTop:8}}>
                    <span style={{fontSize:11,color:"var(--color-text-tertiary)",flex:1}}>
                      Задач: {tasks.filter(t=>t.deal&&deal.title?.toLowerCase().includes(t.deal.toLowerCase())).length}
                    </span>
                    <button onClick={()=>{setSelectedDealForAI(deal);setTab("ai");generateTasksForDeal(deal);}} style={{fontSize:10,padding:"3px 10px"}}>ИИ-задачи ↗</button>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* ── AI TAB ── */}
          {tab==="ai"&&(
            <>
              <div style={{marginBottom:16}}>
                <p style={{margin:"0 0 8px",fontSize:12,color:"var(--color-text-secondary)"}}>Выберите сделку — ИИ-агент проанализирует её и предложит конкретные задачи</p>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {deals.map(d=>(
                    <button key={d.id} onClick={()=>{setSelectedDealForAI(d);generateTasksForDeal(d);}} disabled={generatingTasks||busy} style={{fontSize:11,padding:"5px 12px",border:selectedDealForAI?.id===d.id?"1.5px solid var(--color-border-info)":"0.5px solid var(--color-border-secondary)"}}>
                      {d.title?.split("—")[0]?.trim()||d.title}
                    </button>
                  ))}
                </div>
              </div>
              {generatingTasks&&<div style={{marginBottom:12}}><Spin label="ИИ-агент анализирует сделку…"/></div>}
              {aiProposals.length>0&&(
                <>
                  <p style={{margin:"0 0 8px",fontSize:11,color:C.purple.text,textTransform:"uppercase",letterSpacing:"0.06em"}}>Предложения ИИ-агента</p>
                  {aiProposals.map(p=><AITaskProposal key={p._id} proposal={p} onApprove={approveAITask} onReject={rejectAITask} busy={busy}/>)}
                </>
              )}
              {!generatingTasks&&aiProposals.length===0&&selectedDealForAI&&(
                <p style={{fontSize:13,color:"var(--color-text-tertiary)"}}>Все предложения просмотрены</p>
              )}
              {!generatingTasks&&!selectedDealForAI&&(
                <p style={{fontSize:13,color:"var(--color-text-tertiary)"}}>Выберите сделку выше для генерации задач</p>
              )}
            </>
          )}

          {/* ── REPORT TAB ── */}
          {tab==="report"&&(
            <>
              <div style={{display:"flex",gap:8,marginBottom:16,alignItems:"center"}}>
                <button onClick={generateReport} disabled={generatingReport||busy} style={{fontSize:12,padding:"7px 16px"}}>
                  {generatingReport?"Генерация…":"Сформировать отчёт ↗"}
                </button>
                <span style={{fontSize:11,color:"var(--color-text-tertiary)"}}>за {todayStr()}</span>
              </div>
              {generatingReport&&<Spin label="ИИ анализирует день…"/>}
              {report&&(
                <div>
                  {/* Score */}
                  <div style={{display:"flex",gap:16,marginBottom:16,alignItems:"center"}}>
                    <div style={{width:56,height:56,borderRadius:"50%",background:report.score>=7?C.green.bg:report.score>=5?C.amber.bg:C.red.bg,color:report.score>=7?C.green.text:report.score>=5?C.amber.text:C.red.text,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      <span style={{fontSize:20,fontWeight:500}}>{report.score}</span>
                      <span style={{fontSize:9}}>из 10</span>
                    </div>
                    <div>
                      <p style={{margin:"0 0 2px",fontSize:13,fontWeight:500}}>{report.score_comment}</p>
                      <p style={{margin:0,fontSize:12,color:"var(--color-text-secondary)"}}>{report.summary}</p>
                    </div>
                  </div>

                  {/* Stats row */}
                  <div style={{display:"flex",gap:8,marginBottom:16}}>
                    <Stat label="Выполнено" value={report.done_count} color="green"/>
                    <Stat label="В работе" value={report.pending_count} color="amber"/>
                    <Stat label="Просрочено" value={report.overdue_count} color={report.overdue_count>0?"red":"gray"}/>
                  </div>

                  {/* Risks */}
                  {report.risks?.length>0&&(
                    <>
                      <p style={{margin:"0 0 8px",fontSize:11,color:C.coral.text,textTransform:"uppercase",letterSpacing:"0.06em"}}>Риски</p>
                      {report.risks.map((r,i)=>(
                        <div key={i} style={{background:C.coral.bg,border:`0.5px solid ${C.coral.border}`,borderRadius:"var(--border-radius-md)",padding:"8px 12px",marginBottom:6}}>
                          <p style={{margin:0,fontSize:12,color:C.coral.text}}><strong>{r.deal}:</strong> {r.risk}</p>
                        </div>
                      ))}
                    </>
                  )}

                  {/* Tomorrow */}
                  {report.tomorrow?.length>0&&(
                    <>
                      <p style={{margin:"12px 0 8px",fontSize:11,color:"var(--color-text-secondary)",textTransform:"uppercase",letterSpacing:"0.06em"}}>Приоритеты завтра</p>
                      {report.tomorrow.map((a,i)=>(
                        <div key={i} style={{display:"flex",gap:8,alignItems:"center",padding:"7px 0",borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
                          <span style={{width:18,height:18,borderRadius:"50%",background:C.blue.bg,color:C.blue.text,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:500,flexShrink:0}}>{i+1}</span>
                          <span style={{fontSize:13}}>{a.action}</span>
                        </div>
                      ))}
                    </>
                  )}

                  <p style={{margin:"16px 0 0",fontSize:11,color:"var(--color-text-tertiary)"}}>
                    📎 Для прикрепления скриншотов к задачам используйте нативный Bitrix24 → задача → комментарий → прикрепить файл
                  </p>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
