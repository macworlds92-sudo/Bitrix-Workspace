import { useState, useEffect, useCallback } from "react";

// ── Bitrix24 connection from URL params ───────────────────────────────────────
const getB24 = () => {
  const p = new URLSearchParams(window.location.search);
  return { domain: p.get("DOMAIN") || "", sid: p.get("APP_SID") || "" };
};

const b24 = async (domain, sid, method, params = {}) => {
  if (!domain || !sid) throw new Error("Нет подключения к Bitrix24. Откройте приложение из Bitrix24.");
  const url = new URL(`https://${domain}/rest/${method}.json`);
  url.searchParams.set("auth", sid);
  const flatten = (obj, prefix = "") =>
    Object.entries(obj).forEach(([k, v]) => {
      const key = prefix ? `${prefix}[${k}]` : k;
      if (Array.isArray(v)) v.forEach((x, i) => url.searchParams.set(`${key}[${i}]`, x));
      else if (v && typeof v === "object") flatten(v, key);
      else if (v !== undefined && v !== null) url.searchParams.set(key, v);
    });
  flatten(params);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Bitrix24 HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);
  return data.result;
};

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
  try {
    const s = text.indexOf("{"), e = text.lastIndexOf("}");
    return s >= 0 ? JSON.parse(text.slice(s, e + 1)) : null;
  } catch { return null; }
};

// ── Date helpers ──────────────────────────────────────────────────────────────
const todayStr = new Date().toLocaleDateString("ru-RU");
const tomorrowDate = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d; };
const tomorrowISO = () => tomorrowDate().toISOString();
const tomorrowStr = tomorrowDate().toLocaleDateString("ru-RU");
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("ru-RU") : null;
const isToday = (dl) => dl === todayStr;
const isOverdue = (dl) => {
  if (!dl) return false;
  const [d, m, y] = dl.split(".");
  return new Date(y, m - 1, d) < new Date(new Date().toDateString());
};
const isFuture = (dl) => !dl || (!isToday(dl) && !isOverdue(dl));

// ── Colors ────────────────────────────────────────────────────────────────────
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
  { id: "hot",      label: "Горячий",         color: "#A32D2D", bg: "#FCEBEB" },
  { id: "kp_wait",  label: "Ждёт КП",         color: "#854F0B", bg: "#FAEEDA" },
  { id: "negotiat", label: "Переговоры",       color: "#185FA5", bg: "#E6F1FB" },
  { id: "contract", label: "Готов к договору", color: "#3B6D11", bg: "#EAF3DE" },
  { id: "slow",     label: "Долго думает",     color: "#5F5E5A", bg: "#F1EFE8" },
  { id: "vip",      label: "VIP",              color: "#534AB7", bg: "#EEEDFE" },
];

const RESULT_OPTS = [
  { id: "done",      label: "Выполнено",  color: "green" },
  { id: "callback",  label: "Перезвонит", color: "blue"  },
  { id: "no_answer", label: "Не ответил", color: "amber" },
  { id: "refuse",    label: "Отказ",      color: "red"   },
];

const STAGE_MAP = {
  "NEW":           { label: "Новая",         color: "blue"   },
  "PREPARATION":   { label: "Подготовка",    color: "purple" },
  "EXECUTING":     { label: "В работе",      color: "amber"  },
  "FINAL_INVOICE": { label: "Счёт",          color: "teal"   },
  "WON":           { label: "Выиграна",      color: "green"  },
  "LOSE":          { label: "Проиграна",     color: "red"    },
};

const TASK_STATUS = { 1:"Новая", 2:"Ждёт", 3:"В работе", 5:"Завершена", 6:"Отложена" };

// ── UI primitives ─────────────────────────────────────────────────────────────
function Badge({ color = "gray", children, sm }) {
  const c = C[color] || C.gray;
  return <span style={{ background: c.bg, color: c.text, border: `0.5px solid ${c.border}`, borderRadius: 6, padding: sm ? "1px 6px" : "2px 9px", fontSize: sm ? 10 : 11, fontWeight: 500, whiteSpace: "nowrap" }}>{children}</span>;
}

function Spin({ label = "Загрузка…" }) {
  return <span style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--color-text-secondary)", fontSize: 13 }}>
    <svg width="14" height="14" viewBox="0 0 14 14" style={{ animation: "spin 1s linear infinite", flexShrink: 0 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="20 8" />
    </svg>{label}
  </span>;
}

function StatCard({ label, value, color = "gray", note }) {
  return <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "10px 14px", flex: 1, minWidth: 80 }}>
    <p style={{ margin: 0, fontSize: 10, color: "var(--color-text-secondary)" }}>{label}</p>
    <p style={{ margin: 0, fontSize: 20, fontWeight: 500, color: C[color].text }}>{value}</p>
    {note && <p style={{ margin: 0, fontSize: 9, color: "var(--color-text-tertiary)", marginTop: 2 }}>{note}</p>}
  </div>;
}

// ── Mini time grid ─────────────────────────────────────────────────────────────
function MiniGrid({ events }) {
  const HOURS = Array.from({ length: 11 }, (_, i) => i + 9);
  const toMins = (t = "00:00") => { const [h, m] = t.split(":"); return +h * 60 + (+m || 0); };
  return (
    <div style={{ marginBottom: 14 }}>
      <p style={{ margin: "0 0 5px", fontSize: 10, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Расписание {todayStr}</p>
      <div style={{ display: "flex", gap: 2 }}>
        {HOURS.map(h => {
          const ev = events.find(e => toMins(e.timeStart) <= h * 60 && toMins(e.timeEnd) > h * 60);
          const bg = ev ? (ev.type === "meeting" ? C.purple.bg : C.blue.bg) : "var(--color-background-secondary)";
          const bc = ev ? (ev.type === "meeting" ? C.purple.border : C.blue.border) : "var(--color-border-tertiary)";
          return (
            <div key={h} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ height: 18, background: bg, border: `0.5px solid ${bc}`, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {ev && <span style={{ fontSize: 8, color: ev.type === "meeting" ? C.purple.text : C.blue.text }}>{ev.type === "meeting" ? "●" : "○"}</span>}
              </div>
              <span style={{ fontSize: 8, color: "var(--color-text-tertiary)" }}>{h}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Deal preview ──────────────────────────────────────────────────────────────
function DealPreview({ deal }) {
  const si = STAGE_MAP[deal.STAGE_ID] || { label: deal.STAGE_ID || "—", color: "gray" };
  const days = Math.round((Date.now() - new Date(deal.DATE_CREATE)) / 86400000);
  return (
    <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 10, marginTop: 8 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "6px 10px", minWidth: 80 }}>
          <p style={{ margin: 0, fontSize: 10, color: "var(--color-text-tertiary)" }}>Сумма</p>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: C.teal.text }}>
            {deal.OPPORTUNITY > 0 ? Number(deal.OPPORTUNITY).toLocaleString("ru") + " " + (deal.CURRENCY_ID || "₽") : "—"}
          </p>
        </div>
        <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "6px 10px", minWidth: 80 }}>
          <p style={{ margin: 0, fontSize: 10, color: "var(--color-text-tertiary)" }}>Цикл</p>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: C[days > 21 ? "red" : days > 14 ? "amber" : "green"].text }}>{days} дн.</p>
        </div>
        <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "6px 10px", flex: 1 }}>
          <p style={{ margin: 0, fontSize: 10, color: "var(--color-text-tertiary)" }}>Стадия</p>
          <div style={{ marginTop: 3 }}><Badge color={si.color} sm>{si.label}</Badge></div>
        </div>
      </div>
      {deal.COMMENTS && (
        <div style={{ background: C.amber.bg, border: `0.5px solid ${C.amber.border}`, borderRadius: "var(--border-radius-md)", padding: "7px 10px", marginBottom: 8 }}>
          <p style={{ margin: "0 0 2px", fontSize: 9, color: C.amber.text, textTransform: "uppercase", fontWeight: 500 }}>Последнее касание</p>
          <p style={{ margin: 0, fontSize: 12, color: C.amber.text }}>{deal.COMMENTS}</p>
        </div>
      )}
      {days > 14 && (
        <div style={{ background: C.red.bg, border: `0.5px solid ${C.red.border}`, borderRadius: "var(--border-radius-md)", padding: "6px 10px", marginBottom: 8 }}>
          <p style={{ margin: 0, fontSize: 11, color: C.red.text }}>⚠ {days} дней без закрытия — сделка застряла</p>
        </div>
      )}
    </div>
  );
}

// ── Quick result buttons ───────────────────────────────────────────────────────
function QuickActions({ task, onDone, onCallback, onNoAnswer, onExpand, busy }) {
  return (
    <div style={{ display: "flex", gap: 4, padding: "4px 11px 8px", borderTop: "0.5px solid var(--color-border-tertiary)", marginTop: 4 }}>
      <button onClick={() => onDone(task.id)} disabled={busy} style={{ fontSize: 10, padding: "3px 8px", background: C.green.bg, color: C.green.text, border: `0.5px solid ${C.green.border}`, borderRadius: 5, cursor: "pointer", fontWeight: 500 }}>✓ Готово</button>
      <button onClick={() => onCallback(task.id)} disabled={busy} style={{ fontSize: 10, padding: "3px 8px", background: C.blue.bg, color: C.blue.text, border: `0.5px solid ${C.blue.border}`, borderRadius: 5, cursor: "pointer", fontWeight: 500 }}>↻ Перезвонит</button>
      <button onClick={() => onNoAnswer(task.id)} disabled={busy} style={{ fontSize: 10, padding: "3px 8px", background: C.amber.bg, color: C.amber.text, border: `0.5px solid ${C.amber.border}`, borderRadius: 5, cursor: "pointer", fontWeight: 500 }}>— Не ответил</button>
      <button onClick={onExpand} style={{ fontSize: 10, padding: "3px 8px", marginLeft: "auto", color: "var(--color-text-tertiary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 5, cursor: "pointer" }}>··· Подробнее</button>
    </div>
  );
}

// ── Task card ─────────────────────────────────────────────────────────────────
function TaskCard({ task, allTasks, deals, onQuickDone, onQuickCallback, onQuickNoAnswer, onComplete, onReschedule, onUpdateTags, busy, statusChanging }) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState(null);
  const [comment, setComment] = useState("");
  const [result, setResult] = useState("done");
  const [date, setDate] = useState("");
  const [hint, setHint] = useState("");
  const [loadingHint, setLoadingHint] = useState(false);

  const done = task.status === "done";
  const overdue = isOverdue(task.deadline);
  const deal = deals.find(d => String(d.ID) === String(task.dealId));

  const border = done ? "var(--color-border-tertiary)" : overdue ? C.red.border : task.priority === "high" ? C.coral.border : "var(--color-border-tertiary)";
  const bg = done ? "var(--color-background-secondary)" : "var(--color-background-primary)";

  const slotBlocked = date && allTasks.some(t =>
    t.id !== task.id && t.type === "meeting" && t.status !== "done" && t.timeStart &&
    Math.abs(new Date(date) - new Date()) < 86400000
  );

  const loadHint = async () => {
    if (hint || !deal) return;
    setLoadingHint(true);
    try {
      const text = await claudeCall(
        `Сделка: ${deal.TITLE}, стадия: ${deal.STAGE_ID}, сумма: ${deal.OPPORTUNITY} ${deal.CURRENCY_ID}, последнее касание: ${deal.COMMENTS || "нет данных"}, цель звонка: ${task.title}. Дай одну конкретную фразу-открытие для звонка (1-2 предложения, без воды).`,
        "Ты эксперт по продажам. Дай только фразу, без предисловий."
      );
      setHint(text.trim());
    } catch { setHint(""); }
    setLoadingHint(false);
  };

  const handleExpand = () => {
    if (!expanded) loadHint();
    setExpanded(e => !e);
    setMode(null);
  };

  const saveComplete = () => {
    if (comment.trim().length < 3) return;
    onComplete(task.id, { result, comment });
    setMode(null); setExpanded(false); setComment(""); 
  };

  const saveReschedule = () => {
    if (!date || comment.trim().length < 3 || slotBlocked) return;
    onReschedule(task.id, { date, comment });
    setMode(null); setExpanded(false); setComment(""); setDate("");
  };

  return (
    <div style={{ border: `0.5px solid ${border}`, background: bg, borderRadius: "var(--border-radius-lg)", marginBottom: 6, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 11px", cursor: "pointer" }} onClick={handleExpand}>
        {task.timeStart && (
          <div style={{ flexShrink: 0, textAlign: "center", minWidth: 46 }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: done ? "var(--color-text-tertiary)" : task.type === "meeting" ? C.purple.text : C.blue.text, lineHeight: 1.2 }}>{task.timeStart}</p>
            {task.timeEnd && <p style={{ margin: 0, fontSize: 9, color: "var(--color-text-tertiary)" }}>— {task.timeEnd}</p>}
          </div>
        )}
        {!task.timeStart && (
          <div style={{ width: 24, height: 24, borderRadius: "50%", background: task.type === "meeting" ? C.purple.bg : C.blue.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 10, color: task.type === "meeting" ? C.purple.text : C.blue.text }}>{task.type === "meeting" ? "●" : "○"}</span>
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: "0 0 3px", fontSize: 13, fontWeight: 500, color: done ? "var(--color-text-tertiary)" : "var(--color-text-primary)", textDecoration: done ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.title}</p>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
            {task.deadline && <Badge color={overdue ? "red" : done ? "green" : isToday(task.deadline) ? "blue" : "gray"} sm>{overdue ? "Просрочено: " : ""}{task.deadline}</Badge>}
            {task.priority === "high" && !done && <Badge color="coral" sm>срочно</Badge>}
            {task.type === "meeting" && <Badge color="purple" sm>встреча</Badge>}
            {(task.tags || []).map(tid => { const t = TAG_PRESETS.find(x => x.id === tid); return t ? <span key={tid} style={{ background: t.bg, color: t.color, border: `0.5px solid ${t.color}`, borderRadius: 3, padding: "0 5px", fontSize: 9, fontWeight: 500 }}>{t.label}</span> : null; })}
          </div>
        </div>
        <div style={{ flexShrink: 0, display: "flex", gap: 4, alignItems: "center" }}>
          {done && <Badge color="green" sm>✓</Badge>}
          {task.status === "rescheduled" && <Badge color="amber" sm>→</Badge>}
          {statusChanging === task.id && <Spin label="" />}
          <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{expanded ? "▲" : "▽"}</span>
        </div>
      </div>

      {!done && !expanded && mode === null && (
        <QuickActions task={task} onDone={onQuickDone} onCallback={onQuickCallback} onNoAnswer={onQuickNoAnswer} onExpand={handleExpand} busy={busy} />
      )}

      {expanded && (
        <div style={{ padding: "0 11px 11px" }}>
          {hint && (
            <div style={{ background: C.teal.bg, border: `0.5px solid ${C.teal.border}`, borderRadius: "var(--border-radius-md)", padding: "7px 10px", marginBottom: 8 }}>
              <p style={{ margin: "0 0 2px", fontSize: 9, color: C.teal.text, textTransform: "uppercase", fontWeight: 500 }}>Скрипт открытия</p>
              <p style={{ margin: 0, fontSize: 12, color: C.teal.text }}>{hint}</p>
            </div>
          )}
          {loadingHint && <div style={{ marginBottom: 8 }}><Spin label="Подготовка скрипта…" /></div>}

          {deal && <DealPreview deal={deal} />}

          {task.contact && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8, paddingTop: 8, borderTop: "0.5px solid var(--color-border-tertiary)", flexWrap: "wrap" }}>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 500 }}>{task.contact.name}</p>
                <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-secondary)" }}>{task.contact.phone}</p>
              </div>
              <a href={`tel:${task.contact.phone}`} style={{ textDecoration: "none" }}><button style={{ fontSize: 11, padding: "4px 10px" }}>☎ Позвонить</button></a>
            </div>
          )}

          {!done && mode === null && (
            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap", borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 8 }}>
              <button onClick={() => setMode("complete")} style={{ fontSize: 11, padding: "4px 11px" }}>✓ Результат</button>
              <button onClick={() => setMode("reschedule")} style={{ fontSize: 11, padding: "4px 11px" }}>→ Перенести</button>
              <div style={{ flex: 1 }} />
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {TAG_PRESETS.map(tag => {
                  const active = (task.tags || []).includes(tag.id);
                  return <span key={tag.id} onClick={() => onUpdateTags(task.id, active ? (task.tags || []).filter(x => x !== tag.id) : [...(task.tags || []), tag.id])} style={{ background: active ? tag.bg : "transparent", color: active ? tag.color : "var(--color-text-tertiary)", border: `0.5px solid ${active ? tag.color : "var(--color-border-tertiary)"}`, borderRadius: 4, padding: "2px 7px", fontSize: 9, cursor: "pointer" }}>{tag.label}</span>;
                })}
              </div>
            </div>
          )}

          {mode === "complete" && (
            <div style={{ marginTop: 8, padding: 10, background: C.green.bg, border: `0.5px solid ${C.green.border}`, borderRadius: "var(--border-radius-md)" }}>
              <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 500, color: C.green.text }}>Результат</p>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                {RESULT_OPTS.map(r => <button key={r.id} onClick={() => setResult(r.id)} style={{ fontSize: 10, padding: "3px 9px", background: result === r.id ? C[r.color].bg : "transparent", border: result === r.id ? `1.5px solid ${C[r.color].border}` : "0.5px solid var(--color-border-tertiary)", borderRadius: 5, cursor: "pointer", color: result === r.id ? C[r.color].text : "var(--color-text-secondary)", fontWeight: result === r.id ? 500 : 400 }}>{r.label}</button>)}
              </div>
              <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="О чём говорили? Что договорились? Следующий шаг?" style={{ width: "100%", minHeight: 50, fontSize: 12, padding: 7, boxSizing: "border-box", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", resize: "vertical", marginBottom: 6 }} />
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button onClick={() => setMode(null)} style={{ fontSize: 11, padding: "4px 12px" }}>Отмена</button>
                <button onClick={saveComplete} disabled={comment.trim().length < 3} style={{ fontSize: 11, padding: "4px 12px" }}>Сохранить ↗</button>
              </div>
            </div>
          )}

          {mode === "reschedule" && (
            <div style={{ marginTop: 8, padding: 10, background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-md)" }}>
              <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 500 }}>Перенести</p>
              <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, color: "var(--color-text-secondary)", display: "block", marginBottom: 2 }}>Дата *</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width: "100%", fontSize: 12, padding: "5px 8px", boxSizing: "border-box" }} />
                </div>
              </div>
              {slotBlocked && <p style={{ margin: "0 0 6px", fontSize: 11, color: C.red.text }}>⚠ Слот занят встречей</p>}
              <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Обязательно: что произошло? Почему переносим?" style={{ width: "100%", minHeight: 50, fontSize: 12, padding: 7, boxSizing: "border-box", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", resize: "vertical", marginBottom: 6 }} />
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button onClick={() => setMode(null)} style={{ fontSize: 11, padding: "4px 12px" }}>Отмена</button>
                <button onClick={saveReschedule} disabled={!date || comment.trim().length < 3 || slotBlocked} style={{ fontSize: 11, padding: "4px 12px" }}>Перенести ↗</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Report tab ─────────────────────────────────────────────────────────────────
function ReportTab({ tasks, queue, userName }) {
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
      const text = await claudeCall(
        `Отчёт менеджера ${userName} за ${todayStr}. Выполнено: ${done.length}/${tasks.length}. Перенесено: ${rescheduled.length}. Не закрыто: ${pending.length}. Очередь: ${queue.length}. Выполненные: ${JSON.stringify(done.map(t => ({ title: t.title, result: t.resultType, comment: t.comment })))}. Перенесённые: ${JSON.stringify(rescheduled.map(t => ({ title: t.title, comment: t.comment })))}. Верни JSON: {rating,rating_comment,done_summary,risks:[{deal,risk}],tomorrow:[{action}],manager_note}`,
        "Строгий РОП. Честный отчёт без воды. ТОЛЬКО JSON без markdown."
      );
      const parsed = parseJSON(text);
      setReport(parsed || { rating: 5, rating_comment: "Данных недостаточно", done_summary: `Выполнено ${done.length} из ${tasks.length}`, risks: [], tomorrow: [], manager_note: "" });
    } catch (e) { setErr(e.message); }
    setLoading(false);
  };

  const rc = r => r >= 8 ? "green" : r >= 5 ? "amber" : "red";

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {[["Выполнено", done.length, "green"], ["Перенесено", rescheduled.length, "amber"], ["Не закрыто", pending.length, pending.length > 0 ? "coral" : "gray"]].map(([l, v, c]) => (
          <div key={l} style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "8px 12px", flex: 1 }}>
            <p style={{ margin: 0, fontSize: 10, color: "var(--color-text-secondary)" }}>{l}</p>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 500, color: C[c].text }}>{v}</p>
          </div>
        ))}
      </div>
      <div style={{ height: 4, background: "var(--color-background-secondary)", borderRadius: 2, marginBottom: 14, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: C.green.border, borderRadius: 2 }} />
      </div>
      {done.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <p style={{ margin: "0 0 6px", fontSize: 10, color: "var(--color-text-secondary)", textTransform: "uppercase" }}>Выполненные дела</p>
          {done.map(t => (
            <div key={t.id} style={{ display: "flex", gap: 8, padding: "6px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
              <span style={{ color: C.green.text }}>✓</span>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 500 }}>{t.title}</p>
                <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-secondary)" }}>{t.comment || "—"}</p>
              </div>
              {t.resultType && <Badge color={RESULT_OPTS.find(r => r.id === t.resultType)?.color || "gray"} sm>{RESULT_OPTS.find(r => r.id === t.resultType)?.label}</Badge>}
            </div>
          ))}
        </div>
      )}
      <button onClick={generate} disabled={loading} style={{ fontSize: 12, padding: "7px 16px" }}>
        {loading ? <Spin label="Анализируем…" /> : "Отчёт для руководителя ↗"}
      </button>
      {err && <p style={{ fontSize: 11, color: C.red.text, marginTop: 6 }}>{err}</p>}
      {report && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 12px", background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", marginBottom: 10 }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: C[rc(report.rating)].bg, color: C[rc(report.rating)].text, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontSize: 16, fontWeight: 500 }}>{report.rating}</span>
              <span style={{ fontSize: 8 }}>из 10</span>
            </div>
            <div>
              <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 500 }}>{report.rating_comment}</p>
              <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)" }}>{report.done_summary}</p>
            </div>
          </div>
          {(report.risks || []).length > 0 && report.risks.map((r, i) => (
            <div key={i} style={{ background: C.coral.bg, border: `0.5px solid ${C.coral.border}`, borderRadius: "var(--border-radius-md)", padding: "7px 10px", marginBottom: 6 }}>
              <p style={{ margin: 0, fontSize: 12, color: C.coral.text }}><strong>{r.deal}:</strong> {r.risk}</p>
            </div>
          ))}
          {(report.tomorrow || []).length > 0 && (
            <>
              <p style={{ margin: "10px 0 6px", fontSize: 10, color: "var(--color-text-secondary)", textTransform: "uppercase" }}>Приоритеты завтра</p>
              {report.tomorrow.map((a, i) => (
                <div key={i} style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                  <span style={{ width: 16, height: 16, borderRadius: "50%", background: C.blue.bg, color: C.blue.text, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, flexShrink: 0 }}>{i + 1}</span>
                  <span style={{ fontSize: 12 }}>{typeof a === "string" ? a : a.action}</span>
                </div>
              ))}
            </>
          )}
          {report.manager_note && (
            <div style={{ marginTop: 8, padding: "7px 10px", border: `0.5px solid ${C.purple.border}`, borderRadius: "var(--border-radius-md)", background: C.purple.bg }}>
              <p style={{ margin: "0 0 2px", fontSize: 9, color: C.purple.text, textTransform: "uppercase", fontWeight: 500 }}>Заметка руководителю</p>
              <p style={{ margin: 0, fontSize: 12, color: C.purple.text }}>{report.manager_note}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [b24params] = useState(getB24());
  const [currentUser, setCurrentUser] = useState(null);
  const [viewUser, setViewUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [deals, setDeals] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [queue, setQueue] = useState([]);
  const [calEvents, setCalEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState("");
  const [errors, setErrors] = useState([]);
  const [tab, setTab] = useState("today");
  const [busy, setBusy] = useState(false);
  const [statusChanging, setStatusChanging] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const addErr = (msg) => setErrors(e => [...e.slice(-2), msg]);

  // ── Load current user on mount ─────────────────────────────────────────────
  useEffect(() => {
    if (!b24params.domain || !b24params.sid) return;
    (async () => {
      setLoading(true); setLoadMsg("Определяем пользователя…");
      try {
        const user = await b24(b24params.domain, b24params.sid, "user.current");
        const u = { id: user.ID, name: `${user.NAME} ${user.LAST_NAME}`.trim(), position: user.WORK_POSITION || "Менеджер", isAdmin: user.IS_ADMIN === "Y" };
        setCurrentUser(u);
        setViewUser(u);
        setIsAdmin(u.isAdmin);
        if (u.isAdmin) {
          const allUsers = await b24(b24params.domain, b24params.sid, "user.get", { filter: { ACTIVE: true } });
          setUsers((allUsers || []).map(x => ({ id: x.ID, name: `${x.NAME} ${x.LAST_NAME}`.trim(), position: x.WORK_POSITION || "Менеджер" })));
        }
      } catch (e) { addErr(e.message); }
      setLoading(false); setLoadMsg("");
    })();
  }, []);

  // ── Load data when viewUser changes ───────────────────────────────────────
  useEffect(() => {
    if (!viewUser || !b24params.domain) return;
    loadUserData(viewUser.id);
  }, [viewUser]);

  const loadUserData = useCallback(async (userId) => {
    setLoading(true); setDeals([]); setTasks([]); setQueue([]); setCalEvents([]);
    try {
      setLoadMsg("Загружаем сделки…");
      const dealsRaw = await b24(b24params.domain, b24params.sid, "crm.deal.list", {
        filter: { ASSIGNED_BY_ID: userId, "!STAGE_ID": ["WON", "LOSE"] },
        select: ["ID", "TITLE", "STAGE_ID", "OPPORTUNITY", "CURRENCY_ID", "DATE_CREATE", "COMMENTS", "CONTACT_ID"]
      });
      setDeals(dealsRaw || []);

      setLoadMsg("Загружаем задачи…");
      const tasksRaw = await b24(b24params.domain, b24params.sid, "tasks.task.list", {
        filter: { RESPONSIBLE_ID: userId, "!STATUS": 5 },
        select: ["ID", "TITLE", "STATUS", "PRIORITY", "DEADLINE", "UF_CRM_TASK", "DESCRIPTION", "CREATED_BY"]
      });

      const now = new Date();
      const allTasks = ((tasksRaw || {}).tasks || tasksRaw || []).map(t => ({
        id: t.ID || t.id,
        title: t.TITLE || t.title,
        status: "pending",
        priority: (t.PRIORITY || t.priority) > 1 ? "high" : "medium",
        deadline: fmtDate(t.DEADLINE || t.deadline),
        dealId: ((t.UF_CRM_TASK || t.uf_crm_task || [])[0] || "").replace(/^D_/, ""),
        description: t.DESCRIPTION || t.description || "",
        type: "call",
        tags: [],
        comment: "",
        timeStart: null,
        timeEnd: null,
      }));

      const todayTasks = allTasks.filter(t => isToday(t.deadline));
      const futureTasks = allTasks.filter(t => isFuture(t.deadline));
      const overdueTasks = allTasks.filter(t => isOverdue(t.deadline));

      setTasks([...overdueTasks, ...todayTasks]);
      setQueue(futureTasks);

      setLoadMsg("Загружаем календарь…");
      try {
        const evRaw = await b24(b24params.domain, b24params.sid, "calendar.event.getNearest", { type: "user", ownerId: userId });
        const evArr = Array.isArray(evRaw) ? evRaw : [];
        const todayEvs = evArr.filter(e => fmtDate(e.DATE_FROM) === todayStr).map(e => ({
          id: e.ID,
          title: e.NAME,
          timeStart: e.DATE_FROM ? new Date(e.DATE_FROM).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "",
          timeEnd: e.DATE_TO ? new Date(e.DATE_TO).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "",
          type: "meeting",
        }));
        setCalEvents(todayEvs);
      } catch { /* calendar not critical */ }

    } catch (e) { addErr(e.message); }
    setLoading(false); setLoadMsg("");
  }, [b24params]);

  // ── Task actions ──────────────────────────────────────────────────────────
  const quickAction = useCallback(async (taskId, resultType, autoComment) => {
    setStatusChanging(taskId);
    setTasks(ts => ts.filter(t => t.id !== taskId));
    try {
      await b24(b24params.domain, b24params.sid, "tasks.task.update", { taskId, fields: { STATUS: 5 } });
      await b24(b24params.domain, b24params.sid, "task.comment.add", { TASK_ID: taskId, FIELDS: { POST_MESSAGE: autoComment } });
    } catch (e) { addErr(e.message); }
    setStatusChanging(null);
  }, [b24params]);

  const handleComplete = useCallback(async (taskId, { result, comment }) => {
    setBusy(true);
    setTasks(ts => ts.map(t => t.id === taskId ? { ...t, status: "done", comment, resultType: result } : t));
    try {
      await b24(b24params.domain, b24params.sid, "tasks.task.update", { taskId, fields: { STATUS: 5 } });
      await b24(b24params.domain, b24params.sid, "task.comment.add", { TASK_ID: taskId, FIELDS: { POST_MESSAGE: `[${RESULT_OPTS.find(r => r.id === result)?.label}] ${comment}` } });
    } catch (e) { addErr(e.message); }
    setBusy(false);
  }, [b24params]);

  const handleReschedule = useCallback(async (taskId, { date, comment }) => {
    setBusy(true);
    const newDl = new Date(date).toISOString();
    setTasks(ts => ts.map(t => t.id === taskId ? { ...t, status: "rescheduled", comment, deadline: fmtDate(newDl) } : t));
    try {
      await b24(b24params.domain, b24params.sid, "tasks.task.update", { taskId, fields: { DEADLINE: newDl } });
      await b24(b24params.domain, b24params.sid, "task.comment.add", { TASK_ID: taskId, FIELDS: { POST_MESSAGE: `[Перенесено на ${fmtDate(newDl)}] ${comment}` } });
    } catch (e) { addErr(e.message); }
    setBusy(false);
  }, [b24params]);

  const handleUpdateTags = useCallback((taskId, tags) => {
    setTasks(ts => ts.map(t => t.id === taskId ? { ...t, tags } : t));
    setQueue(qs => qs.map(t => t.id === taskId ? { ...t, tags } : t));
  }, []);

  // ── Computed ─────────────────────────────────────────────────────────────
  const todayTasks = tasks.filter(t => isToday(t.deadline) && t.status !== "done" && t.status !== "rescheduled");
  const overdueTasks = tasks.filter(t => isOverdue(t.deadline));
  const doneTasks = tasks.filter(t => t.status === "done");
  const rescheduledTasks = tasks.filter(t => t.status === "rescheduled");

  const noB24 = !b24params.domain || !b24params.sid;

  const TABS = [
    { id: "today",  label: `Сегодня (${todayTasks.length})` },
    { id: "queue",  label: `Очередь (${queue.length})` },
    { id: "report", label: `Отчёт${doneTasks.length > 0 ? " ●" : ""}` },
    { id: "settings", label: "Настройки" },
  ];

  return (
    <div style={{ padding: "0 0 2rem" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div>
          <p style={{ margin: 0, fontSize: 10, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Рабочий день</p>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 500 }}>{todayStr}</h2>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {isAdmin && users.length > 0 && (
            <select onChange={e => { const u = users.find(x => String(x.id) === e.target.value); if (u) setViewUser(u); }} value={String(viewUser?.id || "")} style={{ fontSize: 12, padding: "5px 10px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)" }}>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}
          <button onClick={() => viewUser && loadUserData(viewUser.id)} disabled={loading} style={{ fontSize: 11, padding: "5px 12px" }}>↻ Обновить</button>
        </div>
      </div>

      {/* No B24 warning */}
      {noB24 && (
        <div style={{ background: C.amber.bg, border: `0.5px solid ${C.amber.border}`, borderRadius: "var(--border-radius-lg)", padding: "14px 16px", marginBottom: 16 }}>
          <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 500, color: C.amber.text }}>Откройте приложение из Bitrix24</p>
          <p style={{ margin: 0, fontSize: 12, color: C.amber.text }}>Прямой переход по URL не поддерживается — Bitrix24 должен передать параметры авторизации.</p>
        </div>
      )}

      {/* Errors */}
      {errors.map((e, i) => <div key={i} style={{ background: C.red.bg, border: `0.5px solid ${C.red.border}`, borderRadius: "var(--border-radius-md)", padding: "8px 12px", marginBottom: 8 }}><p style={{ margin: 0, fontSize: 12, color: C.red.text }}>⚠ {e}</p></div>)}

      {/* Loading */}
      {loading && <div style={{ marginBottom: 12 }}><Spin label={loadMsg} /></div>}

      {/* User bar */}
      {viewUser && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, padding: "8px 12px", background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)" }}>
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: C.purple.bg, color: C.purple.text, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 500, flexShrink: 0 }}>
            {viewUser.name.split(" ").slice(0, 2).map(n => n[0]).join("")}
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>{viewUser.name}</p>
            <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-secondary)" }}>{viewUser.position}</p>
          </div>
          {isAdmin && currentUser?.id !== viewUser?.id && <Badge color="purple" sm>просмотр</Badge>}
        </div>
      )}

      {/* Calendar grid */}
      {calEvents.length > 0 && <MiniGrid events={calEvents} />}

      {/* Stats */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <StatCard label="Сегодня" value={todayTasks.length} color="blue" />
        <StatCard label="Выполнено" value={doneTasks.length} color="green" />
        <StatCard label="Просрочено" value={overdueTasks.length} color={overdueTasks.length > 0 ? "red" : "gray"} />
        <StatCard label="Очередь" value={queue.length} color="gray" />
      </div>

      {/* Overdue alert */}
      {overdueTasks.length > 0 && (
        <div style={{ background: C.red.bg, border: `0.5px solid ${C.red.border}`, borderRadius: "var(--border-radius-lg)", padding: "10px 12px", marginBottom: 12 }}>
          <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 500, color: C.red.text }}>⚠ Просроченные — закрыть или перенести</p>
          {overdueTasks.map(t => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", borderBottom: `0.5px solid ${C.red.border}` }}>
              <span style={{ flex: 1, fontSize: 12, color: C.red.text }}>{t.title}</span>
              <span style={{ fontSize: 11, color: C.red.text }}>{t.deadline}</span>
              <button onClick={() => handleReschedule(t.id, { date: tomorrowISO(), comment: "Автоперенос на завтра" })} disabled={busy} style={{ fontSize: 10, padding: "2px 8px" }}>→ Завтра</button>
              <button onClick={() => quickAction(t.id, "done", "Закрыто")} disabled={busy} style={{ fontSize: 10, padding: "2px 8px" }}>✓</button>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "0.5px solid var(--color-border-tertiary)", marginBottom: 12 }}>
        {TABS.map(t => <button key={t.id} onClick={() => setTab(t.id)} style={{ background: "transparent", border: "none", padding: "6px 12px", fontSize: 12, cursor: "pointer", color: tab === t.id ? "var(--color-text-primary)" : "var(--color-text-secondary)", borderBottom: tab === t.id ? "2px solid var(--color-text-primary)" : "2px solid transparent", fontWeight: tab === t.id ? 500 : 400 }}>{t.label}</button>)}
      </div>

      {/* Today tab */}
      {tab === "today" && (
        <>
          {todayTasks.length === 0 && !loading && <p style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>Нет дел на сегодня. Возьмите задачи из очереди.</p>}
          {todayTasks.map(t => <TaskCard key={t.id} task={t} allTasks={[...tasks, ...calEvents]} deals={deals}
            onQuickDone={id => quickAction(id, "done", "Выполнено")}
            onQuickCallback={id => quickAction(id, "callback", "Клиент перезвонит")}
            onQuickNoAnswer={id => quickAction(id, "no_answer", "Не ответил")}
            onComplete={handleComplete} onReschedule={handleReschedule} onUpdateTags={handleUpdateTags}
            busy={busy} statusChanging={statusChanging} />)}
          {doneTasks.length > 0 && (
            <>
              <p style={{ margin: "12px 0 6px", fontSize: 10, color: "var(--color-text-secondary)", textTransform: "uppercase" }}>Выполнено ({doneTasks.length})</p>
              {doneTasks.map(t => <TaskCard key={t.id} task={t} allTasks={tasks} deals={deals}
                onQuickDone={() => {}} onQuickCallback={() => {}} onQuickNoAnswer={() => {}}
                onComplete={handleComplete} onReschedule={handleReschedule} onUpdateTags={handleUpdateTags}
                busy={busy} statusChanging={statusChanging} />)}
            </>
          )}
        </>
      )}

      {/* Queue tab */}
      {tab === "queue" && (
        <>
          <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--color-text-secondary)" }}>Задачи без даты или на будущие дни</p>
          {queue.length === 0 && <p style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>Очередь пуста</p>}
          {queue.map(t => <TaskCard key={t.id} task={t} allTasks={tasks} deals={deals}
            onQuickDone={id => quickAction(id, "done", "Выполнено")}
            onQuickCallback={id => quickAction(id, "callback", "Клиент перезвонит")}
            onQuickNoAnswer={id => quickAction(id, "no_answer", "Не ответил")}
            onComplete={handleComplete} onReschedule={handleReschedule} onUpdateTags={handleUpdateTags}
            busy={busy} statusChanging={statusChanging} isQueue />)}
        </>
      )}

      {tab === "report" && <ReportTab tasks={tasks} queue={queue} userName={viewUser?.name || ""} />}

      {tab === "settings" && (
        <div>
          <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 500 }}>Теги</p>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 16 }}>
            {TAG_PRESETS.map(t => <span key={t.id} style={{ background: t.bg, color: t.color, border: `0.5px solid ${t.color}`, borderRadius: 5, padding: "3px 9px", fontSize: 11, fontWeight: 500 }}>{t.label}</span>)}
          </div>
          <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 12 }}>
            <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 500 }}>Правила</p>
            {["Обязательный комментарий при переносе", "Блокировка слотов при встречах", "Запрет закрытия без результата", "Отчёт руководителю в конце дня"].map((r, i) => (
              <label key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "5px 0", borderBottom: "0.5px solid var(--color-border-tertiary)", cursor: "pointer" }}>
                <input type="checkbox" defaultChecked />{r}
              </label>
            ))}
          </div>
          <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 12, marginTop: 4 }}>
            <p style={{ margin: "0 0 4px", fontSize: 10, color: "var(--color-text-tertiary)" }}>Подключение</p>
            <p style={{ margin: 0, fontSize: 12 }}>{b24params.domain || "Не подключено"}</p>
            <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-tertiary)" }}>APP_SID: {b24params.sid ? b24params.sid.slice(0, 8) + "…" : "—"}</p>
          </div>
        </div>
      )}
    </div>
  );
}
