import { useState, useCallback } from "react";

const API_URL = "/api/claude";
const MODEL = "claude-sonnet-4-20250514";
const BITRIX_MCP = { type: "url", url: "https://mcp.bitrix24.com/mcp", name: "bitrix24" };
const HOURS = Array.from({ length: 11 }, (_, i) => i + 9);
const AVG_CYCLE = 18;

const today = new Date();
const todayStr = today.toLocaleDateString("ru-RU");
const toMins = (t = "00:00") => { const [h, m] = t.split(":"); return +h * 60 + (+m || 0); };

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

const TAG_PRESETS = [
  { id: "hot",      label: "Горячий",          color: "#A32D2D", bg: "#FCEBEB" },
  { id: "kp_wait",  label: "Ждёт КП",          color: "#854F0B", bg: "#FAEEDA" },
  { id: "negotiat", label: "Переговоры",        color: "#185FA5", bg: "#E6F1FB" },
  { id: "contract", label: "Готов к договору",  color: "#3B6D11", bg: "#EAF3DE" },
  { id: "slow",     label: "Долго думает",      color: "#5F5E5A", bg: "#F1EFE8" },
  { id: "vip",      label: "VIP",               color: "#534AB7", bg: "#EEEDFE" },
];

const STAGES = {
  NEW:          { label: "Новая",           color: "blue" },
  PREPARATION:  { label: "Подготовка",      color: "purple" },
  KP_SENT:      { label: "КП отправлено",   color: "amber" },
  NEGOTIATION:  { label: "Переговоры",      color: "teal" },
  CONTRACT:     { label: "Договор",         color: "green" },
  WON:          { label: "Выиграна",        color: "green" },
  LOSE:         { label: "Проиграна",       color: "red" },
};

const FILE_COLOR = { kp: "blue", tz: "purple", contract: "green", photo: "teal", other: "gray" };
const FILE_LABEL = { kp: "КП", tz: "ТЗ", contract: "Договор", photo: "Фото", other: "Файл" };

const RESULT_OPTS = [
  { id: "done",      label: "Выполнено",    color: "green"  },
  { id: "callback",  label: "Перезвонит",   color: "blue"   },
  { id: "no_answer", label: "Не ответил",   color: "amber"  },
  { id: "refuse",    label: "Отказ",        color: "red"    },
];

// ── Demo data ────────────────────────────────────────────────────────────────
const DEMO_SCHEDULE = [
  { id:1, type:"call", timeStart:"09:00", timeEnd:"10:00",
    dealId:"73668", dealTitle:"ООО Альфастрой — остекление лоджий",
    action:"узнать как КП", priority:"high", stage:"KP_SENT",
    amount:285000, daysInCycle:14,
    lastTouch:"23.05 — Отправили КП на 285 000 ₽. Клиент попросил подумать до пятницы. Контакт: Олег, доброжелательный.",
    contact:{ name:"Семёнов О.В.", phone:"+7 (916) 234-56-78" },
    files:[{ name:"КП_Альфастрой_v2.pdf", type:"kp" },{ name:"ТЗ_лоджии.docx", type:"tz" }],
    tags:["hot"], status:"pending", blocksSlot:false, comment:"" },

  { id:2, type:"call", timeStart:"11:00", timeEnd:"12:00",
    dealId:"73480", dealTitle:"ИП Кузнецов — балкон под ключ",
    action:"узнать как КП", priority:"medium", stage:"KP_SENT",
    amount:142000, daysInCycle:7,
    lastTouch:"24.05 — Первый контакт. КП отправлено. Торгуется по цене.",
    contact:{ name:"Кузнецов П.А.", phone:"+7 (903) 345-67-89" },
    files:[{ name:"КП_Кузнецов.pdf", type:"kp" }],
    tags:["kp_wait"], status:"pending", blocksSlot:false, comment:"" },

  { id:3, type:"meeting", timeStart:"13:00", timeEnd:"15:00",
    dealId:"72886", dealTitle:"ООО Горизонт — офис 18 окон",
    action:"встреча в офисе клиента", priority:"high", stage:"NEGOTIATION",
    amount:890000, daysInCycle:22,
    lastTouch:"22.05 — Встреча перенесена клиентом. Договорились 28.05 в 13:00. Готовы к договору, обсуждаем рассрочку.",
    contact:{ name:"Николаева И.С.", phone:"+7 (925) 456-78-90" },
    files:[{ name:"КП_Горизонт_final.pdf", type:"kp" },{ name:"Договор_проект.docx", type:"contract" },{ name:"ТЗ_офис.pdf", type:"tz" }],
    tags:["contract","vip"], status:"pending", blocksSlot:true, comment:"" },

  { id:4, type:"call", timeStart:"15:00", timeEnd:"16:00",
    dealId:"70358", dealTitle:"Петров А.Н. — частный дом",
    action:"ОС по КП", priority:"high", stage:"KP_SENT",
    amount:520000, daysInCycle:19,
    lastTouch:"20.05 — Повторно отправили КП со скидкой 5%. Обещал ответить в течение недели.",
    contact:{ name:"Петров А.Н.", phone:"+7 (977) 567-89-01" },
    files:[{ name:"КП_Петров_v3.pdf", type:"kp" }],
    tags:["negotiat"], status:"pending", blocksSlot:false, comment:"" },

  { id:5, type:"call", timeStart:"17:00", timeEnd:"18:00",
    dealId:"71304", dealTitle:"ООО СтройПрофи — склад",
    action:"узнать как дела", priority:"low", stage:"PREPARATION",
    amount:0, daysInCycle:5,
    lastTouch:"24.05 — Первый контакт. Замер назначен на 30.05.",
    contact:{ name:"Ткачёв В.В.", phone:"+7 (906) 678-90-12" },
    files:[],
    tags:[], status:"pending", blocksSlot:false, comment:"" },
];

const DEMO_QUEUE = [
  { id:101, type:"task", dealId:"74100", dealTitle:"Иванова Е. — студия",
    action:"уточнить размеры и отправить КП", priority:"medium", stage:"NEW",
    amount:78000, daysInCycle:2,
    lastTouch:"27.05 — Входящая заявка. Замер не проводили.",
    contact:{ name:"Иванова Е.М.", phone:"+7 (911) 789-01-23" },
    files:[], tags:[], status:"pending", blocksSlot:false, comment:"" },

  { id:102, type:"task", dealId:"73990", dealTitle:"ООО ТехноПарк — 4 этажа",
    action:"готовы на замер?", priority:"high", stage:"NEW",
    amount:0, daysInCycle:3,
    lastTouch:"26.05 — Лид с сайта. Не дозвонились вчера.",
    contact:{ name:"Логинов Д.С.", phone:"+7 (926) 890-12-34" },
    files:[], tags:["hot"], status:"pending", blocksSlot:false, comment:"" },
];

// ── UI primitives ─────────────────────────────────────────────────────────────
function Badge({ color = "gray", children, sm }) {
  const c = C[color] || C.gray;
  return <span style={{ background: c.bg, color: c.text, border: `0.5px solid ${c.border}`, borderRadius: 6, padding: sm ? "1px 6px" : "2px 9px", fontSize: sm ? 10 : 11, fontWeight: 500, whiteSpace: "nowrap" }}>{children}</span>;
}

function Spin({ label = "Загрузка…" }) {
  return <span style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--color-text-secondary)", fontSize: 12 }}>
    <svg width="13" height="13" viewBox="0 0 13 13" style={{ animation: "spin 1s linear infinite", flexShrink: 0 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <circle cx="6.5" cy="6.5" r="5" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="20 8" />
    </svg>{label}
  </span>;
}

// ── Mini time grid ─────────────────────────────────────────────────────────────
function MiniGrid({ tasks }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <p style={{ margin: "0 0 5px", fontSize: 10, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Расписание {todayStr}</p>
      <div style={{ display: "flex", gap: 2 }}>
        {HOURS.map(h => {
          const meeting = tasks.find(t => t.blocksSlot && t.status !== "done" && toMins(t.timeStart) <= h * 60 && toMins(t.timeEnd) > h * 60);
          const call = !meeting && tasks.find(t => !t.blocksSlot && t.status !== "done" && toMins(t.timeStart) <= h * 60 && toMins(t.timeEnd) > h * 60);
          const done = !meeting && !call && tasks.find(t => t.status === "done" && toMins(t.timeStart) <= h * 60 && toMins(t.timeEnd) > h * 60);
          const bg = meeting ? C.purple.bg : call ? C.blue.bg : done ? C.green.bg : "var(--color-background-secondary)";
          const bc = meeting ? C.purple.border : call ? C.blue.border : done ? C.green.border : "var(--color-border-tertiary)";
          const tc = meeting ? C.purple.text : call ? C.blue.text : done ? C.green.text : "var(--color-text-tertiary)";
          return (
            <div key={h} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ height: 18, background: bg, border: `0.5px solid ${bc}`, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {meeting && <i className="ti ti-users" style={{ fontSize: 8, color: C.purple.text }} aria-hidden="true" />}
                {call && <i className="ti ti-phone" style={{ fontSize: 8, color: C.blue.text }} aria-hidden="true" />}
                {done && <i className="ti ti-check" style={{ fontSize: 8, color: C.green.text }} aria-hidden="true" />}
              </div>
              <span style={{ fontSize: 8, color: tc }}>{h}</span>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 5, fontSize: 9, color: "var(--color-text-tertiary)" }}>
        {[["Встреча (блок)", C.purple], ["Звонок", C.blue], ["Выполнено", C.green]].map(([l, c]) => (
          <span key={l} style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ width: 7, height: 7, borderRadius: 2, background: c.bg, border: `0.5px solid ${c.border}`, display: "inline-block" }} />{l}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Deal preview (expanded) ───────────────────────────────────────────────────
function DealPreview({ task }) {
  const si = STAGES[task.stage] || { label: task.stage || "—", color: "gray" };
  const cc = task.daysInCycle < AVG_CYCLE * 0.6 ? "green" : task.daysInCycle < AVG_CYCLE ? "amber" : "red";
  const cyclePct = Math.min(100, Math.round(task.daysInCycle / (AVG_CYCLE * 1.5) * 100));

  return (
    <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 10, marginTop: 8 }}>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "6px 10px", minWidth: 80 }}>
          <p style={{ margin: 0, fontSize: 10, color: "var(--color-text-tertiary)" }}>Сумма</p>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: task.amount > 0 ? C.teal.text : "var(--color-text-tertiary)" }}>
            {task.amount > 0 ? Number(task.amount).toLocaleString("ru") + " ₽" : "Не указана"}
          </p>
        </div>
        <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "6px 10px", minWidth: 80 }}>
          <p style={{ margin: 0, fontSize: 10, color: "var(--color-text-tertiary)" }}>Цикл сделки</p>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: C[cc].text }}>{task.daysInCycle} дн.</p>
          <div style={{ height: 3, background: "var(--color-border-tertiary)", borderRadius: 2, marginTop: 3 }}>
            <div style={{ height: "100%", width: `${cyclePct}%`, background: C[cc].border, borderRadius: 2 }} />
          </div>
        </div>
        <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "6px 10px", flex: 1, minWidth: 100 }}>
          <p style={{ margin: 0, fontSize: 10, color: "var(--color-text-tertiary)" }}>Стадия</p>
          <div style={{ marginTop: 3 }}><Badge color={si.color} sm>{si.label}</Badge></div>
        </div>
      </div>

      {/* Last touch */}
      {task.lastTouch && (
        <div style={{ background: C.amber.bg, border: `0.5px solid ${C.amber.border}`, borderRadius: "var(--border-radius-md)", padding: "7px 10px", marginBottom: 8 }}>
          <p style={{ margin: "0 0 2px", fontSize: 9, color: C.amber.text, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500 }}>Последнее касание</p>
          <p style={{ margin: 0, fontSize: 12, color: C.amber.text }}>{task.lastTouch}</p>
        </div>
      )}

      {/* Files */}
      {task.files?.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <p style={{ margin: "0 0 4px", fontSize: 9, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Файлы</p>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {task.files.map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 6, padding: "2px 8px" }}>
                <Badge color={FILE_COLOR[f.type] || "gray"} sm>{FILE_LABEL[f.type] || "Файл"}</Badge>
                <span style={{ fontSize: 11, color: "var(--color-text-primary)" }}>{f.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contact actions */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 500 }}>{task.contact.name}</p>
          <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-secondary)" }}>{task.contact.phone}</p>
        </div>
        <a href={`tel:${task.contact.phone}`} style={{ textDecoration: "none" }}>
          <button style={{ fontSize: 11, padding: "4px 10px", display: "flex", alignItems: "center", gap: 3 }} aria-label="Позвонить">
            <i className="ti ti-phone" style={{ fontSize: 11 }} aria-hidden="true" /> Позвонить
          </button>
        </a>
        <button style={{ fontSize: 11, padding: "4px 10px", display: "flex", alignItems: "center", gap: 3 }} aria-label="Открытая линия">
          <i className="ti ti-message" style={{ fontSize: 11 }} aria-hidden="true" /> Написать
        </button>
      </div>
    </div>
  );
}

// ── Inline tag picker ─────────────────────────────────────────────────────────
function TagRow({ selected, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
        {selected.map(tid => {
          const t = TAG_PRESETS.find(x => x.id === tid);
          return t ? <span key={tid} onClick={() => onChange(selected.filter(x => x !== tid))} style={{ background: t.bg, color: t.color, border: `0.5px solid ${t.color}`, borderRadius: 4, padding: "1px 7px", fontSize: 10, fontWeight: 500, cursor: "pointer" }} title="Убрать тег">{t.label} ×</span> : null;
        })}
        <button onClick={() => setOpen(o => !o)} style={{ fontSize: 10, padding: "2px 8px" }} aria-label="Управление тегами">
          <i className="ti ti-tag" style={{ fontSize: 10 }} aria-hidden="true" /> {open ? "Закрыть" : "Теги"}
        </button>
      </div>
      {open && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5, padding: "6px 8px", background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-tertiary)" }}>
          {TAG_PRESETS.map(tag => {
            const active = selected.includes(tag.id);
            return <span key={tag.id} onClick={() => { onChange(active ? selected.filter(x => x !== tag.id) : [...selected, tag.id]); }} style={{ background: active ? tag.bg : "transparent", color: active ? tag.color : "var(--color-text-secondary)", border: `0.5px solid ${active ? tag.color : "var(--color-border-tertiary)"}`, borderRadius: 4, padding: "2px 8px", fontSize: 10, cursor: "pointer", fontWeight: active ? 500 : 400 }}>{tag.label}</span>;
          })}
        </div>
      )}
    </div>
  );
}

// ── Reschedule form ───────────────────────────────────────────────────────────
function RescheduleForm({ task, allTasks, onSave, onCancel }) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [comment, setComment] = useState("");

  const slotBlocked = time && allTasks.some(t => t.id !== task.id && t.blocksSlot && t.status !== "done" && toMins(t.timeStart) <= toMins(time) && toMins(t.timeEnd) > toMins(time));
  const valid = comment.trim().length >= 5 && date && !slotBlocked;

  return (
    <div style={{ marginTop: 8, padding: 10, background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-tertiary)" }}>
      <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 500 }}>Перенести дело</p>
      <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 10, color: "var(--color-text-secondary)", display: "block", marginBottom: 2 }}>Новая дата <span style={{ color: "var(--color-text-danger)" }}>*</span></label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width: "100%", fontSize: 12, padding: "5px 8px", boxSizing: "border-box" }} />
        </div>
        {!task.blocksSlot && (
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 10, color: "var(--color-text-secondary)", display: "block", marginBottom: 2 }}>Время</label>
            <input type="time" value={time} onChange={e => setTime(e.target.value)} style={{ width: "100%", fontSize: 12, padding: "5px 8px", boxSizing: "border-box" }} />
          </div>
        )}
      </div>
      {slotBlocked && <p style={{ margin: "0 0 6px", fontSize: 11, color: C.red.text }}>⚠ Это время занято встречей — выберите другое</p>}
      <div style={{ marginBottom: 6 }}>
        <label style={{ fontSize: 10, color: "var(--color-text-secondary)", display: "block", marginBottom: 2 }}>
          Результат касания + причина переноса <span style={{ color: "var(--color-text-danger)" }}>*</span>
        </label>
        <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Обязательно: что произошло? О чём говорили? Почему переносим?" style={{ width: "100%", minHeight: 55, fontSize: 12, padding: 7, boxSizing: "border-box", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", resize: "vertical" }} />
        {comment.trim().length > 0 && comment.trim().length < 5 && <p style={{ margin: "2px 0 0", fontSize: 10, color: "var(--color-text-secondary)" }}>Слишком коротко</p>}
      </div>
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={{ fontSize: 11, padding: "4px 12px" }}>Отмена</button>
        <button onClick={() => valid && onSave({ date, time, comment })} disabled={!valid} style={{ fontSize: 11, padding: "4px 12px" }} aria-label="Сохранить перенос">Перенести ↗</button>
      </div>
    </div>
  );
}

// ── Complete form ─────────────────────────────────────────────────────────────
function CompleteForm({ onSave, onCancel }) {
  const [result, setResult] = useState("done");
  const [comment, setComment] = useState("");
  const valid = comment.trim().length >= 5;

  return (
    <div style={{ marginTop: 8, padding: 10, background: C.green.bg, borderRadius: "var(--border-radius-md)", border: `0.5px solid ${C.green.border}` }}>
      <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 500, color: C.green.text }}>Результат</p>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
        {RESULT_OPTS.map(r => (
          <button key={r.id} onClick={() => setResult(r.id)} style={{ fontSize: 11, padding: "3px 10px", background: result === r.id ? C[r.color].bg : "transparent", border: result === r.id ? `1.5px solid ${C[r.color].border}` : "0.5px solid var(--color-border-secondary)", borderRadius: 6, cursor: "pointer", color: result === r.id ? C[r.color].text : "var(--color-text-secondary)", fontWeight: result === r.id ? 500 : 400 }}>{r.label}</button>
        ))}
      </div>
      <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Что обсудили? О чём договорились? Следующий шаг?" style={{ width: "100%", minHeight: 50, fontSize: 12, padding: 7, boxSizing: "border-box", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", color: "var(--color-text-primary)", resize: "vertical", marginBottom: 6 }} />
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={{ fontSize: 11, padding: "4px 12px" }}>Отмена</button>
        <button onClick={() => valid && onSave({ result, comment })} disabled={!valid} style={{ fontSize: 11, padding: "4px 12px" }} aria-label="Сохранить результат">Сохранить ↗</button>
      </div>
    </div>
  );
}

// ── Task card ─────────────────────────────────────────────────────────────────
function TaskCard({ task, allTasks, onUpdate, onComplete, onReschedule, isQueue }) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState(null); // null | "complete" | "reschedule"
  const done = task.status === "done";
  const rescheduled = task.status === "rescheduled";

  const border = done
    ? "var(--color-border-tertiary)"
    : task.blocksSlot
    ? C.purple.border
    : task.priority === "high"
    ? C.coral.border
    : "var(--color-border-tertiary)";

  const bg = done
    ? "var(--color-background-secondary)"
    : task.blocksSlot
    ? C.purple.bg
    : "var(--color-background-primary)";

  const toggle = () => { if (mode) return; setExpanded(e => !e); };
  const setModeAndExpand = (m) => { setMode(m); setExpanded(true); };

  return (
    <div style={{ border: `0.5px solid ${border}`, background: bg, borderRadius: "var(--border-radius-lg)", marginBottom: 5, overflow: "hidden" }}>

      {/* Row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 11px", cursor: "pointer" }} onClick={toggle}>

        {/* Time OR type icon */}
        {!isQueue ? (
          <div style={{ flexShrink: 0, textAlign: "center", minWidth: 50 }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: done ? "var(--color-text-tertiary)" : task.blocksSlot ? C.purple.text : C.blue.text, lineHeight: 1.2 }}>{task.timeStart}</p>
            <p style={{ margin: 0, fontSize: 9, color: "var(--color-text-tertiary)" }}>— {task.timeEnd}</p>
          </div>
        ) : (
          <div style={{ flexShrink: 0, width: 26, height: 26, borderRadius: "50%", background: C.blue.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <i className={`ti ${task.type === "call" ? "ti-phone" : task.type === "meeting" ? "ti-users" : "ti-check"}`} style={{ fontSize: 11, color: C.blue.text }} aria-hidden="true" />
          </div>
        )}

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 5, alignItems: "center", marginBottom: 2, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: done ? "var(--color-text-tertiary)" : "var(--color-text-primary)", textDecoration: done ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>{task.dealTitle}</span>
            {task.blocksSlot && <Badge color="purple" sm>встреча ⛔</Badge>}
            {task.priority === "high" && !done && <Badge color="coral" sm>срочно</Badge>}
          </div>
          <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>#{task.dealId}</span>
            <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>→ {task.action}</span>
            {task.tags.map(tid => { const t = TAG_PRESETS.find(x => x.id === tid); return t ? <span key={tid} style={{ background: t.bg, color: t.color, border: `0.5px solid ${t.color}`, borderRadius: 3, padding: "0 5px", fontSize: 9, fontWeight: 500 }}>{t.label}</span> : null; })}
          </div>
        </div>

        {/* Status + chevron */}
        <div style={{ flexShrink: 0, display: "flex", gap: 5, alignItems: "center" }}>
          {done && <Badge color="green" sm>✓ готово</Badge>}
          {rescheduled && <Badge color="amber" sm>перенесено</Badge>}
          <i className={`ti ti-chevron-${expanded ? "up" : "down"}`} style={{ fontSize: 13, color: "var(--color-text-tertiary)" }} aria-hidden="true" />
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div style={{ padding: "0 11px 11px" }}>
          {!done && <DealPreview task={task} />}

          {done && task.comment && (
            <div style={{ padding: "6px 10px", background: "var(--color-background-secondary)", borderRadius: 6, fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>
              {task.comment}
            </div>
          )}

          {!done && (
            <>
              {/* Actions */}
              {mode === null && (
                <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap", alignItems: "center", borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 8 }}>
                  <button onClick={() => setModeAndExpand("complete")} style={{ fontSize: 11, padding: "4px 11px", display: "flex", alignItems: "center", gap: 3 }} aria-label="Отметить выполненным">
                    <i className="ti ti-check" style={{ fontSize: 11 }} aria-hidden="true" /> Готово
                  </button>
                  <button onClick={() => setModeAndExpand("reschedule")} style={{ fontSize: 11, padding: "4px 11px", display: "flex", alignItems: "center", gap: 3 }} aria-label="Перенести">
                    <i className="ti ti-calendar-event" style={{ fontSize: 11 }} aria-hidden="true" /> Перенести
                  </button>
                  <TagRow selected={task.tags} onChange={tags => onUpdate({ ...task, tags })} />
                  <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--color-text-tertiary)" }}>цикл: {task.daysInCycle}д | сред. {AVG_CYCLE}д</span>
                </div>
              )}

              {mode === "complete" && (
                <CompleteForm
                  onSave={res => { onComplete(task.id, res); setMode(null); setExpanded(false); }}
                  onCancel={() => setMode(null)}
                />
              )}
              {mode === "reschedule" && (
                <RescheduleForm
                  task={task} allTasks={allTasks}
                  onSave={res => { onReschedule(task.id, res); setMode(null); setExpanded(false); }}
                  onCancel={() => setMode(null)}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Report tab ─────────────────────────────────────────────────────────────────
function ReportTab({ tasks, backlog }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const done = tasks.filter(t => t.status === "done");
  const rescheduled = tasks.filter(t => t.status === "rescheduled");
  const pending = tasks.filter(t => t.status === "pending");
  const pct = tasks.length > 0 ? Math.round(done.length / tasks.length * 100) : 0;

  const generate = async () => {
    setLoading(true); setErr(""); setReport(null);
    try {
      const res = await fetch(API_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL, max_tokens: 1000,
          system: "Ты строгий руководитель отдела продаж. Честный, конкретный отчёт без воды. ТОЛЬКО JSON без markdown.",
          messages: [{ role: "user", content: `Отчёт менеджера за ${todayStr}. Выполнено: ${done.length}/${tasks.length}. Перенесено: ${rescheduled.length}. Не закрыто: ${pending.length}. В очереди: ${backlog.length}. Детали выполненных: ${JSON.stringify(done.map(t => ({ deal: t.dealTitle, action: t.action, comment: t.comment, result: t.resultType })))}. Перенесённые: ${JSON.stringify(rescheduled.map(t => ({ deal: t.dealTitle, comment: t.comment })))}. Верни JSON: {rating,rating_comment,done_summary,risk_comment,reschedule_comment,tomorrow_top3,manager_note}` }],
          mcp_servers: [BITRIX_MCP]
        })
      });
      const data = await res.json();
      const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
      const s = text.indexOf("{"), e = text.lastIndexOf("}");
      if (s >= 0 && e >= 0) setReport(JSON.parse(text.slice(s, e + 1)));
      else setErr("Не удалось разобрать ответ");
    } catch (e) { setErr(e.message); }
    setLoading(false);
  };

  const rc = (r) => r >= 8 ? "green" : r >= 5 ? "amber" : "red";

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {[["Выполнено", done.length, "green"], ["Перенесено", rescheduled.length, "amber"], ["Не закрыто", pending.length, pending.length > 0 ? "coral" : "gray"], ["Очередь", backlog.length, "blue"]].map(([l, v, c]) => (
          <div key={l} style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "8px 12px", flex: 1, minWidth: 70 }}>
            <p style={{ margin: 0, fontSize: 10, color: "var(--color-text-secondary)" }}>{l}</p>
            <p style={{ margin: 0, fontSize: 18, fontWeight: 500, color: C[c].text }}>{v}</p>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 4 }}>
          <span>Прогресс дня</span><span>{pct}%</span>
        </div>
        <div style={{ height: 5, background: "var(--color-background-secondary)", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: C.green.border, borderRadius: 3 }} />
        </div>
      </div>

      {done.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <p style={{ margin: "0 0 6px", fontSize: 10, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Выполненные дела</p>
          {done.map(t => (
            <div key={t.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "6px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
              <span style={{ color: C.green.text, fontSize: 12, flexShrink: 0 }}>✓</span>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 500 }}>{t.dealTitle}</p>
                <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-secondary)" }}>{t.comment || "—"}</p>
              </div>
              {t.resultType && <Badge color={RESULT_OPTS.find(r => r.id === t.resultType)?.color || "gray"} sm>{RESULT_OPTS.find(r => r.id === t.resultType)?.label}</Badge>}
            </div>
          ))}
        </div>
      )}

      <button onClick={generate} disabled={loading} style={{ fontSize: 12, padding: "7px 16px" }}>
        {loading ? <Spin label="Анализируем день…" /> : "Отчёт для руководителя ↗"}
      </button>
      {err && <p style={{ fontSize: 11, color: C.red.text, marginTop: 6 }}>{err}</p>}

      {report && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 12px", background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", marginBottom: 10 }}>
            <div style={{ width: 42, height: 42, borderRadius: "50%", background: C[rc(report.rating)].bg, color: C[rc(report.rating)].text, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontSize: 15, fontWeight: 500 }}>{report.rating}</span>
              <span style={{ fontSize: 8 }}>из 10</span>
            </div>
            <div>
              <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 500 }}>{report.rating_comment}</p>
              <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)" }}>{report.done_summary}</p>
            </div>
          </div>
          {report.risk_comment && <div style={{ background: C.coral.bg, border: `0.5px solid ${C.coral.border}`, borderRadius: "var(--border-radius-md)", padding: "7px 10px", marginBottom: 6 }}><p style={{ margin: 0, fontSize: 12, color: C.coral.text }}>{report.risk_comment}</p></div>}
          {report.reschedule_comment && <div style={{ background: C.amber.bg, border: `0.5px solid ${C.amber.border}`, borderRadius: "var(--border-radius-md)", padding: "7px 10px", marginBottom: 6 }}><p style={{ margin: 0, fontSize: 12, color: C.amber.text }}>{report.reschedule_comment}</p></div>}
          {report.tomorrow_top3 && (
            <div style={{ marginTop: 8 }}>
              <p style={{ margin: "0 0 5px", fontSize: 10, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Приоритеты завтра</p>
              {(Array.isArray(report.tomorrow_top3) ? report.tomorrow_top3 : [report.tomorrow_top3]).map((a, i) => (
                <div key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start", padding: "5px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                  <span style={{ width: 16, height: 16, borderRadius: "50%", background: C.blue.bg, color: C.blue.text, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 500, flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
                  <span style={{ fontSize: 12 }}>{typeof a === "string" ? a : a.action || JSON.stringify(a)}</span>
                </div>
              ))}
            </div>
          )}
          {report.manager_note && <div style={{ marginTop: 8, padding: "7px 10px", border: `0.5px solid ${C.purple.border}`, borderRadius: "var(--border-radius-md)", background: C.purple.bg }}><p style={{ margin: "0 0 2px", fontSize: 9, color: C.purple.text, textTransform: "uppercase", fontWeight: 500 }}>Заметка руководителю</p><p style={{ margin: 0, fontSize: 12, color: C.purple.text }}>{report.manager_note}</p></div>}
        </div>
      )}
    </div>
  );
}

// ── Admin tab ─────────────────────────────────────────────────────────────────
function AdminTab() {
  const rules = ["Обязательный комментарий при переносе","Блокировка слотов при встречах","Отчёт руководителю в конце дня","Запрет закрытия без результата"];
  return (
    <div>
      <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 500 }}>Теги организации</p>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 14 }}>
        {TAG_PRESETS.map(t => <span key={t.id} style={{ background: t.bg, color: t.color, border: `0.5px solid ${t.color}`, borderRadius: 5, padding: "3px 9px", fontSize: 11, fontWeight: 500 }}>{t.label}</span>)}
      </div>
      <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 12, marginBottom: 14 }}>
        <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 500 }}>Правила воркспейса</p>
        {rules.map((r, i) => (
          <label key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "5px 0", borderBottom: "0.5px solid var(--color-border-tertiary)", cursor: "pointer" }}>
            <input type="checkbox" defaultChecked style={{ cursor: "pointer" }} />{r}
          </label>
        ))}
      </div>
      <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 12 }}>
        <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 500 }}>Сотрудники</p>
        {["Иванов А. — Розничный отдел", "Петрова М. — Розничный отдел", "Сидоров К. — Оптовый отдел"].map((s, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "0.5px solid var(--color-border-tertiary)", fontSize: 12 }}>
            <span>{s}</span><Badge color="blue" sm>Менеджер</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [schedule, setSchedule] = useState(DEMO_SCHEDULE);
  const [queue, setQueue] = useState(DEMO_QUEUE);
  const [tab, setTab] = useState("schedule");
  const [loading, setLoading] = useState(false);

  const done = schedule.filter(t => t.status === "done");
  const active = schedule.filter(t => t.status !== "done");

  const handleUpdate = useCallback((updated) => setSchedule(ts => ts.map(t => t.id === updated.id ? updated : t)), []);

  const handleComplete = useCallback(async (id, { result, comment }) => {
    setSchedule(ts => ts.map(t => t.id === id ? { ...t, status: "done", comment, resultType: result } : t));
    try {
      await fetch(API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: MODEL, max_tokens: 100, system: "Bitrix24 MCP. Обнови задачу.", messages: [{ role: "user", content: `Закрой задачу, добавь комментарий: "${comment}", статус 5.` }], mcp_servers: [BITRIX_MCP] }) });
    } catch (e) { console.warn("Bitrix write-back:", e.message); }
  }, []);

  const handleReschedule = useCallback(async (id, { date, time, comment }) => {
    setSchedule(ts => ts.map(t => t.id === id ? { ...t, status: "rescheduled", comment, timeStart: time || t.timeStart } : t));
    try {
      await fetch(API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: MODEL, max_tokens: 100, system: "Bitrix24 MCP. Обнови задачу.", messages: [{ role: "user", content: `Перенеси задачу на ${date} ${time}, добавь комментарий: "${comment}"` }], mcp_servers: [BITRIX_MCP] }) });
    } catch (e) { console.warn("Bitrix write-back:", e.message); }
  }, []);

  const loadFromBitrix = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: MODEL, max_tokens: 1000, system: "Bitrix24 MCP. ТОЛЬКО JSON без markdown.", messages: [{ role: "user", content: `Получи задачи пользователя на ${todayStr} из Bitrix24. Верни JSON: {schedule:[{id,type,timeStart,timeEnd,dealId,dealTitle,action,priority,stage,amount,daysInCycle,lastTouch,contact:{name,phone},files:[{name,type}],tags,status,blocksSlot,comment}], queue:[...]}` }], mcp_servers: [BITRIX_MCP] }) });
      const data = await res.json();
      const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
      const s = text.indexOf("{"), e = text.lastIndexOf("}");
      if (s >= 0 && e >= 0) {
        const p = JSON.parse(text.slice(s, e + 1));
        if (Array.isArray(p.schedule)) setSchedule(p.schedule);
        if (Array.isArray(p.queue)) setQueue(p.queue);
      }
    } catch (e) { console.warn("Load error:", e.message); }
    setLoading(false);
  }, []);

  const moveToSchedule = (taskId, time) => {
    const t = queue.find(x => x.id === taskId);
    if (!t) return;
    setQueue(q => q.filter(x => x.id !== taskId));
    setSchedule(s => [...s, { ...t, timeStart: time || "09:00", timeEnd: "10:00" }]);
  };

  const TABS = [
    { id: "schedule", label: `Сегодня (${active.length})` },
    { id: "queue",    label: `Очередь (${queue.length})` },
    { id: "report",   label: `Отчёт${done.length > 0 ? " ●" : ""}` },
    { id: "admin",    label: "Настройки" },
  ];

  return (
    <div style={{ padding: "0 0 2rem" }}>
      <h2 className="sr-only">Ежедневный воркспейс менеджера</h2>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div>
          <p style={{ margin: 0, fontSize: 10, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Рабочий день</p>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 500 }}>{todayStr}</h2>
        </div>
        <button onClick={loadFromBitrix} disabled={loading} style={{ fontSize: 11, padding: "5px 12px", display: "flex", alignItems: "center", gap: 5 }}>
          {loading ? <Spin label="Загрузка…" /> : "↻ Из Bitrix24"}
        </button>
      </div>

      <MiniGrid tasks={schedule} />

      {/* Stats */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {[["Дел сегодня", schedule.length, "gray"], ["Выполнено", done.length, "green"], ["Встречи", schedule.filter(t => t.blocksSlot).length, "purple"], ["Очередь", queue.length, "blue"]].map(([l, v, c]) => (
          <div key={l} style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "8px 12px", flex: 1, minWidth: 70 }}>
            <p style={{ margin: 0, fontSize: 10, color: "var(--color-text-secondary)" }}>{l}</p>
            <p style={{ margin: 0, fontSize: 18, fontWeight: 500, color: C[c].text }}>{v}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "0.5px solid var(--color-border-tertiary)", marginBottom: 12 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ background: "transparent", border: "none", padding: "6px 12px", fontSize: 12, cursor: "pointer", color: tab === t.id ? "var(--color-text-primary)" : "var(--color-text-secondary)", borderBottom: tab === t.id ? "2px solid var(--color-text-primary)" : "2px solid transparent", fontWeight: tab === t.id ? 500 : 400 }}>{t.label}</button>
        ))}
      </div>

      {/* Schedule tab */}
      {tab === "schedule" && (
        <>
          {active.map(t => <TaskCard key={t.id} task={t} allTasks={schedule} onUpdate={handleUpdate} onComplete={handleComplete} onReschedule={handleReschedule} />)}
          {done.length > 0 && (
            <>
              <p style={{ margin: "10px 0 6px", fontSize: 10, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Выполнено ({done.length})</p>
              {done.map(t => <TaskCard key={t.id} task={t} allTasks={schedule} onUpdate={handleUpdate} onComplete={handleComplete} onReschedule={handleReschedule} />)}
            </>
          )}
          {schedule.length === 0 && <p style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>Нет дел. Загрузите из Bitrix24 или перенесите из очереди.</p>}
        </>
      )}

      {/* Queue tab */}
      {tab === "queue" && (
        <>
          <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--color-text-secondary)" }}>Дела без времени — возьмите в работу или запланируйте</p>
          {queue.map(t => (
            <div key={t.id} style={{ position: "relative" }}>
              <TaskCard task={t} allTasks={schedule}
                onUpdate={u => setQueue(q => q.map(x => x.id === u.id ? u : x))}
                onComplete={(id, res) => setQueue(q => q.map(x => x.id === id ? { ...x, status: "done", comment: res.comment, resultType: res.result } : x))}
                onReschedule={(id, res) => moveToSchedule(id, res.time)}
                isQueue
              />
            </div>
          ))}
          {queue.length === 0 && <p style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>Очередь пуста — все дела распределены по времени</p>}
        </>
      )}

      {tab === "report" && <ReportTab tasks={schedule} backlog={queue} />}
      {tab === "admin" && <AdminTab />}
    </div>
  );
}
