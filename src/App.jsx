import { useState, useEffect, useCallback } from "react";

// ── BX24 ──────────────────────────────────────────────────────────────────────
const bx24 = (method, params = {}) => new Promise((resolve, reject) => {
  if (!window.BX24) return reject(new Error("Откройте из Bitrix24"));
  window.BX24.callMethod(method, params, r => {
    if (r.error()) reject(new Error(JSON.stringify(r.error())));
    else resolve(r.data());
  });
});

const claude = async (msg, sys) => {
  const r = await fetch("/api/claude", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 800, system: sys, messages: [{ role: "user", content: msg }] }) });
  const d = await r.json();
  return (d.content || []).filter(b => b.type === "text").map(b => b.text).join("");
};

const tryJSON = t => { try { const s=t.indexOf("{"),e=t.lastIndexOf("}"); return s>=0?JSON.parse(t.slice(s,e+1)):null; } catch { return null; } };

// ── Date helpers ──────────────────────────────────────────────────────────────
const now = new Date();
const todayStr = now.toLocaleDateString("ru-RU");
const fmt = iso => iso ? new Date(iso).toLocaleDateString("ru-RU") : null;
const isToday = dl => dl === todayStr;
const isOver = dl => { if (!dl) return false; const [d,m,y]=dl.split("."); return new Date(+y,m-1,+d)<new Date(now.toDateString()); };
const isFut = dl => !dl||(!isToday(dl)&&!isOver(dl));
const nowTime = () => new Date().toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"});
const monthStart = () => { const d=new Date(); d.setDate(1); d.setHours(0,0,0,0); return d.toISOString(); };
const MONTH_NAME = now.toLocaleString("ru",{month:"long"});
const YEAR = now.getFullYear();
const MONTH = now.getMonth()+1;
const DAYS_IN_MONTH = new Date(YEAR,MONTH,0).getDate();
const DAY_NUM = now.getDate();

const CRM_CHECKLIST_FIELD = "UF_CRM_1780013484958";
const PLAN_OPTION_KEY = `sales_plans_${YEAR}`;

// ── Role system ───────────────────────────────────────────────────────────────
const getRole = (user, storedROPs = []) => {
  if (!user) return "manager";
  if (user.isAdmin) return "admin";
  if (storedROPs.includes(String(user.id))) return "rop";
  const pos = (user.position || "").toLowerCase();
  if (pos.includes("роп") || pos.includes("руководитель отдела") || pos.includes("rop") || pos.includes("sales manager head")) return "rop";
  return "manager";
};
const canViewOthers = role => role === "admin" || role === "rop";
const canManagePlan = role => role === "admin" || role === "rop";
const canReassign = role => role === "admin" || role === "rop";
const canManageSettings = role => role === "admin";

const ROLE_LABELS = { admin: "Администратор", rop: "РОП", manager: "Менеджер" };
const ROLE_COLORS = { admin: "purple", rop: "teal", manager: "gray" };

// ── Colors ────────────────────────────────────────────────────────────────────
const C = {
  purple:{bg:"#EEEDFE",text:"#3C3489",border:"#AFA9EC"},teal:{bg:"#E1F5EE",text:"#0F6E56",border:"#5DCAA5"},
  coral:{bg:"#FAECE7",text:"#712B13",border:"#F0997B"},amber:{bg:"#FAEEDA",text:"#633806",border:"#EF9F27"},
  blue:{bg:"#E6F1FB",text:"#0C447C",border:"#85B7EB"},green:{bg:"#EAF3DE",text:"#3B6D11",border:"#97C459"},
  gray:{bg:"#F1EFE8",text:"#444441",border:"#B4B2A9"},red:{bg:"#FCEBEB",text:"#791F1F",border:"#F09595"},
};
const TAGS=[{id:"hot",label:"Горячий",c:"#A32D2D",bg:"#FCEBEB"},{id:"kp_wait",label:"Ждёт КП",c:"#854F0B",bg:"#FAEEDA"},{id:"negotiat",label:"Переговоры",c:"#185FA5",bg:"#E6F1FB"},{id:"contract",label:"К договору",c:"#3B6D11",bg:"#EAF3DE"},{id:"slow",label:"Долго думает",c:"#5F5E5A",bg:"#F1EFE8"},{id:"vip",label:"VIP",c:"#534AB7",bg:"#EEEDFE"}];
const RESULTS=[{id:"done",label:"Выполнено",color:"green"},{id:"callback",label:"Перезвонит",color:"blue"},{id:"no_answer",label:"Не ответил",color:"amber"},{id:"refuse",label:"Отказ",color:"red"}];

// ── Primitives ────────────────────────────────────────────────────────────────
const Badge=({color="gray",children,sm})=>{const c=C[color]||C.gray;return<span style={{background:c.bg,color:c.text,border:`0.5px solid ${c.border}`,borderRadius:6,padding:sm?"1px 6px":"2px 9px",fontSize:sm?10:11,fontWeight:500,whiteSpace:"nowrap"}}>{children}</span>;};
const Spin=({label="Загрузка…"})=><span style={{display:"flex",alignItems:"center",gap:8,color:"var(--color-text-secondary)",fontSize:13}}><svg width="13" height="13" viewBox="0 0 13 13" style={{animation:"spin 1s linear infinite",flexShrink:0}}><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style><circle cx="6.5" cy="6.5" r="5" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="20 8"/></svg>{label}</span>;
const Stat=({label,value,color="gray",note})=><div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"10px 14px",flex:1,minWidth:80}}><p style={{margin:0,fontSize:10,color:"var(--color-text-secondary)"}}>{label}</p><p style={{margin:0,fontSize:20,fontWeight:500,color:C[color].text}}>{value}</p>{note&&<p style={{margin:0,fontSize:9,color:"var(--color-text-tertiary)",marginTop:2}}>{note}</p>}</div>;

// ── Plan bar ──────────────────────────────────────────────────────────────────
function PlanBar({ wonAmount, monthPlan }) {
  if (!monthPlan) return null;
  const pct = Math.min(100, Math.round(wonAmount / monthPlan * 100));
  const expectedPct = Math.min(100, Math.round(DAY_NUM / DAYS_IN_MONTH * 100));
  const expectedAmt = Math.round(monthPlan / DAYS_IN_MONTH * DAY_NUM);
  const onTrack = wonAmount >= expectedAmt * 0.8;
  const bc = pct >= 100 ? "green" : onTrack ? "teal" : pct >= 50 ? "amber" : "red";

  return (
    <div style={{ marginBottom: 12, background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-lg)", padding: "12px 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
        <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>План — {MONTH_NAME} {YEAR}</p>
        <span style={{ fontSize: 13, fontWeight: 500, color: C[bc].text }}>{pct}%</span>
      </div>
      <div style={{ position: "relative", height: 8, background: "var(--color-border-tertiary)", borderRadius: 4, marginBottom: 8, overflow: "visible" }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${pct}%`, background: C[bc].border, borderRadius: 4, transition: "width 0.6s" }} />
        <div style={{ position: "absolute", left: `${expectedPct}%`, top: -3, bottom: -3, width: 2, background: "#999", borderRadius: 1, zIndex: 2 }} title="Ожидаемый прогресс" />
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {[
          ["Факт", `${(wonAmount/1000).toFixed(0)}k ₽`, bc],
          ["Цель/мес", `${(monthPlan/1000).toFixed(0)}k ₽`, "gray"],
          ["Цель/нед", `${(monthPlan/4.33/1000).toFixed(0)}k ₽`, "gray"],
          ["Цель/день", `${(monthPlan/22/1000).toFixed(0)}k ₽`, "gray"],
        ].map(([l, v, c]) => (
          <div key={l} style={{ flex: 1, minWidth: 60 }}>
            <p style={{ margin: 0, fontSize: 9, color: "var(--color-text-tertiary)" }}>{l}</p>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: C[c].text }}>{v}</p>
          </div>
        ))}
      </div>
      {!onTrack && wonAmount < monthPlan && (
        <div style={{ marginTop: 6, padding: "4px 8px", background: C.amber.bg, borderRadius: 5 }}>
          <p style={{ margin: 0, fontSize: 11, color: C.amber.text }}>Отставание: нужно ещё {((expectedAmt - wonAmount)/1000).toFixed(0)}k ₽ чтобы быть в графике</p>
        </div>
      )}
    </div>
  );
}

// ── Plan Manager (Admin/ROP) ───────────────────────────────────────────────────
function PlanManager({ users, plans, onSave, currentRole, storedROPs, onROPToggle }) {
  const [localPlans, setLocalPlans] = useState({ ...plans });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true);
    await onSave(localPlans);
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const totalPlan = Object.values(localPlans).reduce((s, v) => s + (Number(v) || 0), 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>План продаж — {YEAR}</p>
        <button onClick={save} disabled={saving} style={{ fontSize: 11, padding: "5px 14px" }}>
          {saving ? <Spin label="Сохраняем…" /> : saved ? "✓ Сохранено" : "Сохранить"}
        </button>
      </div>

      <div style={{ background: C.blue.bg, border: `0.5px solid ${C.blue.border}`, borderRadius: "var(--border-radius-md)", padding: "8px 12px", marginBottom: 10 }}>
        <p style={{ margin: 0, fontSize: 11, color: C.blue.text }}>Общий план команды: <strong>{(totalPlan / 1_000_000).toFixed(1)} млн ₽/год</strong> · {(totalPlan / 12 / 1000).toFixed(0)}k ₽/мес</p>
      </div>

      {users.map(u => (
        <div key={u.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: C.purple.bg, color: C.purple.text, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 500, flexShrink: 0 }}>
            {u.name.split(" ").slice(0, 2).map(n => n[0]).join("")}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</p>
            <p style={{ margin: 0, fontSize: 10, color: "var(--color-text-tertiary)" }}>{u.position}</p>
          </div>
          {canManageSettings(currentRole) && (
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: C.teal.text, cursor: "pointer" }}>
              <input type="checkbox" checked={storedROPs.includes(String(u.id))} onChange={() => onROPToggle(u.id)} style={{ cursor: "pointer" }} />
              РОП
            </label>
          )}
          <div style={{ textAlign: "right" }}>
            <p style={{ margin: 0, fontSize: 9, color: "var(--color-text-tertiary)", marginBottom: 2 }}>Годовой план, ₽</p>
            <input
              type="number"
              value={localPlans[u.id] || ""}
              onChange={e => setLocalPlans(p => ({ ...p, [u.id]: e.target.value }))}
              placeholder="0"
              style={{ width: 110, fontSize: 12, padding: "4px 6px", textAlign: "right", boxSizing: "border-box" }}
            />
            {localPlans[u.id] > 0 && <p style={{ margin: "2px 0 0", fontSize: 9, color: "var(--color-text-tertiary)" }}>{(localPlans[u.id] / 12 / 1000).toFixed(0)}k/мес</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Reassign button ───────────────────────────────────────────────────────────
function ReassignButton({ users, currentId, onReassign, busy }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen(v => !v)} disabled={busy} style={{ fontSize: 10, padding: "3px 9px" }}>
        ↗ Переназначить
      </button>
      {open && (
        <div style={{ position: "absolute", top: "100%", right: 0, zIndex: 100, background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", boxShadow: "0 4px 12px rgba(0,0,0,0.12)", minWidth: 180, maxHeight: 220, overflowY: "auto" }}>
          {users.filter(u => String(u.id) !== String(currentId)).map(u => (
            <div key={u.id} onClick={() => { onReassign(u); setOpen(false); }} style={{ padding: "8px 12px", fontSize: 12, cursor: "pointer", borderBottom: "0.5px solid var(--color-border-tertiary)", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: C.purple.bg, color: C.purple.text, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 500, flexShrink: 0 }}>
                {u.name.split(" ").slice(0, 2).map(n => n[0]).join("")}
              </div>
              <div><p style={{ margin: 0, fontSize: 12 }}>{u.name}</p><p style={{ margin: 0, fontSize: 10, color: "var(--color-text-tertiary)" }}>{u.position}</p></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Stage selector ────────────────────────────────────────────────────────────
function StageSelector({ deal, stages, onStageChange, busy }) {
  const [open, setOpen] = useState(false);
  const si = stages.find(s => s.STATUS_ID === deal?.STAGE_ID) || { NAME: deal?.STAGE_ID || "—", COLOR: "#999" };
  if (!deal) return null;
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen(v => !v)} disabled={busy} style={{ fontSize: 11, padding: "3px 10px", background: `${si.COLOR}22`, color: si.COLOR, border: `0.5px solid ${si.COLOR}66`, borderRadius: 5, cursor: "pointer", fontWeight: 500 }}>
        {si.NAME} ▾
      </button>
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 100, background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", minWidth: 180, maxHeight: 220, overflowY: "auto" }}>
          {stages.map(s => (
            <div key={s.STATUS_ID} onClick={() => { onStageChange(deal.ID, s.STATUS_ID); setOpen(false); }} style={{ padding: "7px 12px", fontSize: 12, cursor: "pointer", borderBottom: "0.5px solid var(--color-border-tertiary)", display: "flex", alignItems: "center", gap: 8, background: s.STATUS_ID === deal.STAGE_ID ? "var(--color-background-secondary)" : "transparent" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.COLOR || "#999", flexShrink: 0 }} />
              {s.NAME}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Deal block ────────────────────────────────────────────────────────────────
function DealBlock({ deal, stages, users, role, onStageChange, onReassign, busy }) {
  if (!deal) return null;
  const days = Math.round((Date.now() - new Date(deal.DATE_CREATE)) / 86400000);
  const dc = days > 21 ? "red" : days > 14 ? "amber" : "green";
  const checklist = deal[CRM_CHECKLIST_FIELD] ? String(deal[CRM_CHECKLIST_FIELD]).split("\n").filter(Boolean) : [];
  const responsible = users.find(u => String(u.id) === String(deal.ASSIGNED_BY_ID));

  return (
    <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 10, marginTop: 8 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "6px 10px", minWidth: 80 }}>
          <p style={{ margin: 0, fontSize: 10, color: "var(--color-text-tertiary)" }}>Сумма</p>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: C.teal.text }}>{deal.OPPORTUNITY > 0 ? Number(deal.OPPORTUNITY).toLocaleString("ru") + " ₽" : "—"}</p>
        </div>
        <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "6px 10px", minWidth: 60 }}>
          <p style={{ margin: 0, fontSize: 10, color: "var(--color-text-tertiary)" }}>Цикл</p>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: C[dc].text }}>{days}д</p>
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <p style={{ margin: 0, fontSize: 10, color: "var(--color-text-tertiary)", marginBottom: 3 }}>Стадия</p>
          <StageSelector deal={deal} stages={stages} onStageChange={onStageChange} busy={busy} />
        </div>
      </div>

      {/* Responsible + reassign */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: "6px 10px", background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)" }}>
        <div style={{ width: 22, height: 22, borderRadius: "50%", background: C.gray.bg, color: C.gray.text, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 500, flexShrink: 0 }}>
          {responsible ? responsible.name.split(" ").slice(0, 2).map(n => n[0]).join("") : "?"}
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-secondary)" }}>Ответственный</p>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 500 }}>{responsible?.name || deal.ASSIGNED_BY_ID || "—"}</p>
        </div>
        {canReassign(role) && users.length > 1 && (
          <ReassignButton users={users} currentId={deal.ASSIGNED_BY_ID} onReassign={u => onReassign(deal.ID, u)} busy={busy} />
        )}
      </div>

      {deal.UF_CRM_COMMENTS && (
        <div style={{ background: C.blue.bg, border: `0.5px solid ${C.blue.border}`, borderRadius: "var(--border-radius-md)", padding: "7px 10px", marginBottom: 6 }}>
          <p style={{ margin: "0 0 2px", fontSize: 9, color: C.blue.text, textTransform: "uppercase", fontWeight: 500 }}>Комментарий КЦ</p>
          <p style={{ margin: 0, fontSize: 12, color: C.blue.text }}>{deal.UF_CRM_COMMENTS}</p>
        </div>
      )}
      {deal.COMMENTS && (
        <div style={{ background: C.amber.bg, border: `0.5px solid ${C.amber.border}`, borderRadius: "var(--border-radius-md)", padding: "7px 10px", marginBottom: 6 }}>
          <p style={{ margin: "0 0 2px", fontSize: 9, color: C.amber.text, textTransform: "uppercase", fontWeight: 500 }}>Комментарий к сделке</p>
          <p style={{ margin: 0, fontSize: 12, color: C.amber.text }}>{deal.COMMENTS}</p>
        </div>
      )}
      {days > 14 && <div style={{ background: C.red.bg, border: `0.5px solid ${C.red.border}`, borderRadius: "var(--border-radius-md)", padding: "6px 10px", marginBottom: 6 }}>
        <p style={{ margin: 0, fontSize: 11, color: C.red.text }}>⚠ {days} дней без закрытия</p>
      </div>}
      {checklist.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <p style={{ margin: "0 0 4px", fontSize: 9, color: "var(--color-text-tertiary)", textTransform: "uppercase" }}>Чек-лист ({checklist.length})</p>
          {checklist.slice(-5).map((entry, i) => <div key={i} style={{ display: "flex", gap: 5, padding: "2px 0", fontSize: 11, color: "var(--color-text-secondary)", borderBottom: "0.5px solid var(--color-border-tertiary)" }}><span style={{ color: C.green.text, flexShrink: 0 }}>✓</span>{entry}</div>)}
        </div>
      )}
    </div>
  );
}

// ── Deal card ─────────────────────────────────────────────────────────────────
function DealCard({ item, deals, stages, users, role, onQuickResult, onComplete, onReschedule, onTagsChange, onStageChange, onReassign, busy, statusChanging }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState(null);
  const [comment, setComment] = useState("");
  const [result, setResult] = useState("done");
  const [date, setDate] = useState("");
  const [hint, setHint] = useState(null);
  const [hintLoad, setHintLoad] = useState(false);

  const done = item.status === "done";
  const overdue = isOver(item.deadline);
  const deal = deals.find(d => String(d.ID) === String(item.dealId));
  const border = done ? "var(--color-border-tertiary)" : overdue ? C.red.border : item.priority === "high" ? C.coral.border : "var(--color-border-tertiary)";

  const getHint = async () => {
    if (hint !== null || hintLoad || !deal) return;
    setHintLoad(true);
    try {
      const t = await claude(`Дело: "${item.title}". Сделка: "${deal.TITLE}". Стадия: ${deal.STAGE_ID}. Сумма: ${deal.OPPORTUNITY} ₽. Комментарий КЦ: "${deal.UF_CRM_COMMENTS || "нет"}". Доп: "${deal.COMMENTS || "нет"}". Фраза для открытия звонка (1-2 предложения).`, "Эксперт по продажам. Только фраза.");
      setHint(t.trim());
    } catch { setHint(""); }
    setHintLoad(false);
  };

  const toggle = () => { if (!open) getHint(); setOpen(v => !v); setMode(null); };
  const doComplete = () => { if (comment.trim().length < 3) return; onComplete(item.id, item.source, { result, comment }, item.dealId); setMode(null); setOpen(false); setComment(""); };
  const doReschedule = () => { if (!date || comment.trim().length < 3) return; onReschedule(item.id, item.source, { date, comment }, item.dealId); setMode(null); setOpen(false); setComment(""); setDate(""); };

  return (
    <div style={{ border: `0.5px solid ${border}`, background: done ? "var(--color-background-secondary)" : "var(--color-background-primary)", borderRadius: "var(--border-radius-lg)", marginBottom: 6, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 11px", cursor: "pointer" }} onClick={toggle}>
        <div style={{ width: 22, height: 22, borderRadius: "50%", background: item.typeId === 4 ? C.purple.bg : C.blue.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 9, color: item.typeId === 4 ? C.purple.text : C.blue.text, fontWeight: 600 }}>{item.source === "task" ? "T" : item.typeId === 4 ? "●" : "○"}</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: "0 0 3px", fontSize: 13, fontWeight: 500, color: done ? "var(--color-text-tertiary)" : "var(--color-text-primary)", textDecoration: done ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</p>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
            {item.deadline && <Badge color={overdue ? "red" : done ? "green" : isToday(item.deadline) ? "blue" : "gray"} sm>{overdue ? "⚠ " : ""}{item.deadline}</Badge>}
            {item.priority === "high" && !done && <Badge color="coral" sm>срочно</Badge>}
            {deal && <Badge color="gray" sm>{deal.TITLE?.slice(0, 20)}{deal.TITLE?.length > 20 ? "…" : ""}</Badge>}
            {(item.tags || []).map(tid => { const t = TAGS.find(x => x.id === tid); return t ? <span key={tid} style={{ background: t.bg, color: t.c, border: `0.5px solid ${t.c}`, borderRadius: 3, padding: "0 5px", fontSize: 9, fontWeight: 500 }}>{t.label}</span> : null; })}
          </div>
        </div>
        <div style={{ flexShrink: 0, display: "flex", gap: 4, alignItems: "center" }}>
          {done && <Badge color="green" sm>✓</Badge>}
          {item.status === "rescheduled" && <Badge color="amber" sm>→</Badge>}
          {statusChanging === item.id && <Spin label="" />}
          <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{open ? "▲" : "▽"}</span>
        </div>
      </div>

      {!done && !open && (
        <div style={{ display: "flex", gap: 4, padding: "4px 11px 8px", borderTop: "0.5px solid var(--color-border-tertiary)" }}>
          {RESULTS.map(r => <button key={r.id} onClick={e => { e.stopPropagation(); onQuickResult(item.id, item.source, r.id, r.label, item.dealId); }} disabled={busy} style={{ fontSize: 10, padding: "3px 8px", background: C[r.color].bg, color: C[r.color].text, border: `0.5px solid ${C[r.color].border}`, borderRadius: 5, cursor: "pointer", fontWeight: 500 }}>{r.label}</button>)}
          <button onClick={e => { e.stopPropagation(); toggle(); }} style={{ fontSize: 10, padding: "3px 8px", marginLeft: "auto", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 5, cursor: "pointer", color: "var(--color-text-tertiary)" }}>Детали</button>
        </div>
      )}

      {open && (
        <div style={{ padding: "0 11px 11px" }}>
          {hintLoad && <div style={{ marginBottom: 8 }}><Spin label="Готовим скрипт…" /></div>}
          {hint && <div style={{ background: C.teal.bg, border: `0.5px solid ${C.teal.border}`, borderRadius: "var(--border-radius-md)", padding: "7px 10px", marginBottom: 8 }}>
            <p style={{ margin: "0 0 2px", fontSize: 9, color: C.teal.text, textTransform: "uppercase", fontWeight: 500 }}>Скрипт открытия</p>
            <p style={{ margin: 0, fontSize: 12, color: C.teal.text }}>{hint}</p>
          </div>}
          {item.description && <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "6px 10px", marginBottom: 8 }}>
            <p style={{ margin: "0 0 2px", fontSize: 9, color: "var(--color-text-tertiary)", textTransform: "uppercase" }}>Описание</p>
            <p style={{ margin: 0, fontSize: 12 }}>{item.description}</p>
          </div>}
          <DealBlock deal={deal} stages={stages} users={users} role={role} onStageChange={onStageChange} onReassign={onReassign} busy={busy} />
          {!done && mode === null && (
            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap", borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 8, alignItems: "center" }}>
              <button onClick={() => setMode("complete")} style={{ fontSize: 11, padding: "4px 11px" }}>✓ Результат</button>
              <button onClick={() => setMode("reschedule")} style={{ fontSize: 11, padding: "4px 11px" }}>→ Перенести</button>
              <div style={{ flex: 1 }} />
              {TAGS.map(tag => { const active = (item.tags || []).includes(tag.id); return <span key={tag.id} onClick={() => onTagsChange(item.id, active ? (item.tags || []).filter(x => x !== tag.id) : [...(item.tags || []), tag.id])} style={{ background: active ? tag.bg : "transparent", color: active ? tag.c : "var(--color-text-tertiary)", border: `0.5px solid ${active ? tag.c : "var(--color-border-tertiary)"}`, borderRadius: 4, padding: "2px 7px", fontSize: 9, cursor: "pointer" }}>{tag.label}</span>; })}
            </div>
          )}
          {mode === "complete" && (
            <div style={{ marginTop: 8, padding: 10, background: C.green.bg, border: `0.5px solid ${C.green.border}`, borderRadius: "var(--border-radius-md)" }}>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                {RESULTS.map(r => <button key={r.id} onClick={() => setResult(r.id)} style={{ fontSize: 10, padding: "3px 9px", background: result === r.id ? C[r.color].bg : "transparent", border: result === r.id ? `1.5px solid ${C[r.color].border}` : "0.5px solid var(--color-border-tertiary)", borderRadius: 5, cursor: "pointer", color: result === r.id ? C[r.color].text : "var(--color-text-secondary)", fontWeight: result === r.id ? 500 : 400 }}>{r.label}</button>)}
              </div>
              <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="О чём говорили? Что договорились?" style={{ width: "100%", minHeight: 50, fontSize: 12, padding: 7, boxSizing: "border-box", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", resize: "vertical", marginBottom: 6 }} />
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button onClick={() => setMode(null)} style={{ fontSize: 11, padding: "4px 12px" }}>Отмена</button>
                <button onClick={doComplete} disabled={comment.trim().length < 3} style={{ fontSize: 11, padding: "4px 12px" }}>Сохранить ↗</button>
              </div>
            </div>
          )}
          {mode === "reschedule" && (
            <div style={{ marginTop: 8, padding: 10, background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-md)" }}>
              <div style={{ marginBottom: 6 }}>
                <label style={{ fontSize: 10, color: "var(--color-text-secondary)", display: "block", marginBottom: 2 }}>Новая дата *</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width: "100%", fontSize: 12, padding: "5px 8px", boxSizing: "border-box" }} />
              </div>
              <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Обязательно: что произошло? Почему переносим?" style={{ width: "100%", minHeight: 50, fontSize: 12, padding: 7, boxSizing: "border-box", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-primary)", resize: "vertical", marginBottom: 6 }} />
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button onClick={() => setMode(null)} style={{ fontSize: 11, padding: "4px 12px" }}>Отмена</button>
                <button onClick={doReschedule} disabled={!date || comment.trim().length < 3} style={{ fontSize: 11, padding: "4px 12px" }}>Перенести ↗</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Report tab ────────────────────────────────────────────────────────────────
function ReportTab({ items, queue, userName, kpi, monthPlan }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const done = items.filter(t => t.status === "done");
  const rescheduled = items.filter(t => t.status === "rescheduled");
  const pending = items.filter(t => t.status === "pending");
  const pct = items.length > 0 ? Math.round(done.length / items.length * 100) : 0;

  const generate = async () => {
    setLoading(true); setErr(""); setReport(null);
    try {
      const planPct = monthPlan > 0 && kpi ? Math.min(100, Math.round(kpi.wonAmount / monthPlan * 100)) : 0;
      const text = await claude(
        `Отчёт менеджера ${userName} за ${todayStr}. Выполнено: ${done.length}/${items.length}. Перенесено: ${rescheduled.length}. Не закрыто: ${pending.length}. KPI: выиграно ${kpi?.wonDeals || 0} сделок, ${kpi?.wonAmount || 0} ₽, конверсия ${kpi?.pct || 0}%, выполнение плана ${planPct}%. Выполненные: ${JSON.stringify(done.slice(0, 8).map(t => ({ title: t.title, result: t.resultType, comment: t.comment })))}. Верни JSON: {rating,rating_comment,done_summary,risks:[{deal,risk}],tomorrow:[{action}],manager_note}`,
        "Строгий РОП. Честный отчёт. ТОЛЬКО JSON без markdown."
      );
      setReport(tryJSON(text) || { rating: 5, rating_comment: "Нет данных", done_summary: `Выполнено ${done.length}/${items.length}`, risks: [], tomorrow: [], manager_note: "" });
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
      <div style={{ height: 4, background: "var(--color-background-secondary)", borderRadius: 2, marginBottom: 12, overflow: "hidden" }}><div style={{ height: "100%", width: `${pct}%`, background: C.green.border, borderRadius: 2 }} /></div>
      {done.length > 0 && <div style={{ marginBottom: 14 }}>
        <p style={{ margin: "0 0 6px", fontSize: 10, color: "var(--color-text-secondary)", textTransform: "uppercase" }}>Выполненные дела</p>
        {done.map(t => <div key={t.id} style={{ display: "flex", gap: 8, padding: "6px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
          <span style={{ color: C.green.text }}>✓</span>
          <div style={{ flex: 1 }}><p style={{ margin: 0, fontSize: 12, fontWeight: 500 }}>{t.title}</p><p style={{ margin: 0, fontSize: 11, color: "var(--color-text-secondary)" }}>{t.comment || "—"}</p></div>
          {t.resultType && <Badge color={RESULTS.find(r => r.id === t.resultType)?.color || "gray"} sm>{RESULTS.find(r => r.id === t.resultType)?.label}</Badge>}
        </div>)}
      </div>}
      <button onClick={generate} disabled={loading} style={{ fontSize: 12, padding: "7px 16px" }}>{loading ? <Spin label="Анализируем…" /> : "Отчёт для руководителя ↗"}</button>
      {err && <p style={{ fontSize: 11, color: C.red.text, marginTop: 6 }}>{err}</p>}
      {report && <div style={{ marginTop: 12 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 12px", background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", marginBottom: 10 }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", background: C[rc(report.rating)].bg, color: C[rc(report.rating)].text, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 16, fontWeight: 500 }}>{report.rating}</span><span style={{ fontSize: 8 }}>из 10</span>
          </div>
          <div><p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 500 }}>{report.rating_comment}</p><p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)" }}>{report.done_summary}</p></div>
        </div>
        {(report.risks || []).map((r, i) => <div key={i} style={{ background: C.coral.bg, border: `0.5px solid ${C.coral.border}`, borderRadius: "var(--border-radius-md)", padding: "7px 10px", marginBottom: 6 }}><p style={{ margin: 0, fontSize: 12, color: C.coral.text }}><strong>{r.deal}:</strong> {r.risk}</p></div>)}
        {(report.tomorrow || []).length > 0 && <><p style={{ margin: "10px 0 6px", fontSize: 10, color: "var(--color-text-secondary)", textTransform: "uppercase" }}>Приоритеты завтра</p>{report.tomorrow.map((a, i) => <div key={i} style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}><span style={{ width: 16, height: 16, borderRadius: "50%", background: C.blue.bg, color: C.blue.text, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, flexShrink: 0 }}>{i + 1}</span><span style={{ fontSize: 12 }}>{typeof a === "string" ? a : a.action}</span></div>)}</>}
        {report.manager_note && <div style={{ marginTop: 8, padding: "7px 10px", border: `0.5px solid ${C.purple.border}`, borderRadius: "var(--border-radius-md)", background: C.purple.bg }}><p style={{ margin: "0 0 2px", fontSize: 9, color: C.purple.text, textTransform: "uppercase", fontWeight: 500 }}>Заметка руководителю</p><p style={{ margin: 0, fontSize: 12, color: C.purple.text }}>{report.manager_note}</p></div>}
      </div>}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [initErr, setInitErr] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [viewUser, setViewUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [role, setRole] = useState("manager");
  const [storedROPs, setStoredROPs] = useState([]);
  const [deals, setDeals] = useState([]);
  const [stages, setStages] = useState([]);
  const [items, setItems] = useState([]);
  const [queue, setQueue] = useState([]);
  const [kpi, setKpi] = useState(null);
  const [kpiLoading, setKpiLoading] = useState(false);
  const [plans, setPlans] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState("");
  const [errors, setErrors] = useState([]);
  const [tab, setTab] = useState("today");
  const [busy, setBusy] = useState(false);
  const [statusChanging, setStatusChanging] = useState(null);

  const addErr = msg => setErrors(e => [...e.slice(-2), msg]);

  const appendChecklist = useCallback(async (dealId, text) => {
    if (!dealId) return;
    const deal = deals.find(d => String(d.ID) === String(dealId));
    const existing = deal?.[CRM_CHECKLIST_FIELD] ? String(deal[CRM_CHECKLIST_FIELD]) : "";
    const entry = `${nowTime()} ${todayStr} — ${text}`;
    const newVal = existing ? existing + "\n" + entry : entry;
    try {
      await bx24("crm.deal.update", { id: String(dealId), fields: { [CRM_CHECKLIST_FIELD]: newVal } });
      setDeals(ds => ds.map(d => String(d.ID) === String(dealId) ? { ...d, [CRM_CHECKLIST_FIELD]: newVal } : d));
    } catch {}
  }, [deals]);

  const addComment = useCallback(async (dealId, text) => {
    if (!dealId || !text) return;
    try { await bx24("crm.timeline.comment.add", { fields: { ENTITY_ID: String(dealId), ENTITY_TYPE: "deal", COMMENT: String(text) } }); }
    catch { try { await bx24("crm.deal.update", { id: String(dealId), fields: { COMMENTS: String(text) } }); } catch {} }
  }, []);

  // ── Init ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = () => {
      if (!window.BX24) { setInitErr("BX24 SDK не загружен — откройте из Bitrix24"); return; }
      window.BX24.init(async () => {
        setLoading(true); setLoadMsg("Инициализация…");
        try {
          const [user, stagesRaw, optRaw] = await Promise.all([
            bx24("user.current"),
            bx24("crm.dealcategory.stage.list", { id: 0 }).catch(() => []),
            bx24("app.option.get", { keys: [PLAN_OPTION_KEY, "stored_rops"] }).catch(() => ({})),
          ]);

          const u = { id: user.ID, name: `${user.NAME} ${user.LAST_NAME}`.trim(), position: user.WORK_POSITION || "Менеджер", isAdmin: user.IS_ADMIN === "Y" };
          const rops = optRaw?.stored_rops ? JSON.parse(optRaw.stored_rops) : [];
          const userRole = getRole(u, rops);
          const plansData = optRaw?.[PLAN_OPTION_KEY] ? JSON.parse(optRaw[PLAN_OPTION_KEY]) : {};

          setCurrentUser(u); setViewUser(u); setRole(userRole);
          setStoredROPs(rops); setStages(stagesRaw || []);
          setPlans(plansData);

          if (canViewOthers(userRole)) {
            const all = await bx24("user.get", { filter: { ACTIVE: true }, select: ["ID","NAME","LAST_NAME","WORK_POSITION"] }).catch(() => []);
            setUsers((all || []).map(x => ({ id: x.ID, name: `${x.NAME} ${x.LAST_NAME}`.trim(), position: x.WORK_POSITION || "Менеджер" })));
          }
        } catch (e) { addErr(e.message); }
        setLoading(false); setLoadMsg("");
      });
    };
    if (document.readyState === "complete") init();
    else window.addEventListener("load", init);
    return () => window.removeEventListener("load", init);
  }, []);

  useEffect(() => { if (viewUser) loadData(viewUser.id); }, [viewUser]);

  const loadData = useCallback(async userId => {
    setLoading(true); setDeals([]); setItems([]); setQueue([]); setKpi(null);
    try {
      setLoadMsg("Загружаем сделки…");
      const dealsRaw = await bx24("crm.deal.list", {
        filter: { ASSIGNED_BY_ID: userId, "!STAGE_ID": ["WON", "LOSE"] },
        select: ["ID","TITLE","STAGE_ID","OPPORTUNITY","CURRENCY_ID","DATE_CREATE","COMMENTS","UF_CRM_COMMENTS","ASSIGNED_BY_ID",CRM_CHECKLIST_FIELD]
      }).catch(() => []);
      setDeals(dealsRaw || []);

      setLoadMsg("Загружаем дела…");
      const [actsRaw, tasksRaw] = await Promise.all([
        bx24("crm.activity.list", { filter: { RESPONSIBLE_ID: userId, COMPLETED: 0 }, select: ["ID","SUBJECT","DEADLINE","TYPE_ID","DESCRIPTION","PRIORITY","ASSOCIATED_ENTITY_ID","ASSOCIATED_ENTITY_TYPE"] }).catch(() => []),
        bx24("tasks.task.list", { filter: { RESPONSIBLE_ID: userId, "!STATUS": 5 }, select: ["ID","TITLE","DEADLINE","PRIORITY","UF_CRM_TASK","DESCRIPTION"] }).catch(() => ({ tasks: [] })),
      ]);

      const normalize = (arr, source) => arr.map(a => ({
        id: (source === "activity" ? "a_" : "t_") + (a.ID || a.id),
        rawId: a.ID || a.id,
        source,
        title: a.SUBJECT || a.TITLE || "Без названия",
        status: "pending", priority: Number(a.PRIORITY || 0) > 1 ? "high" : "medium",
        deadline: fmt(a.DEADLINE || a.deadline),
        dealId: source === "activity" ? (a.ASSOCIATED_ENTITY_TYPE === "2" ? a.ASSOCIATED_ENTITY_ID : null) : ((a.UF_CRM_TASK || [])[0] || "").replace(/^D_/, "") || null,
        typeId: Number(a.TYPE_ID) || (source === "task" ? 3 : 6),
        description: a.DESCRIPTION || "", tags: [], comment: "",
      }));

      const all = [...normalize(actsRaw || [], "activity"), ...normalize(((tasksRaw || {}).tasks || tasksRaw || []), "task")];
      setItems(all.filter(a => isToday(a.deadline) || isOver(a.deadline)));
      setQueue(all.filter(a => isFut(a.deadline)));

    } catch (e) { addErr(e.message); }
    setLoading(false); setLoadMsg("");
    // Load KPI separately, non-blocking
    loadKPI(userId);
  }, []);

  // KPI loads independently with 15s timeout
  const loadKPI = useCallback(async userId => {
    setKpiLoading(true);
    const timeout = ms => new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms));
    try {
      const ms = monthStart();
      const [won, allDeals] = await Promise.race([
        Promise.all([
          bx24("crm.deal.list", { filter: { ASSIGNED_BY_ID: userId, STAGE_ID: "WON", ">DATE_CLOSED": ms }, select: ["ID","OPPORTUNITY","DATE_CREATE","DATE_CLOSED"] }).catch(() => []),
          bx24("crm.deal.list", { filter: { ASSIGNED_BY_ID: userId, ">DATE_CREATE": ms }, select: ["ID"] }).catch(() => []),
        ]),
        timeout(15000).then(() => { throw new Error("KPI timeout"); })
      ]);
      const wonAmt = (won || []).reduce((s, d) => s + Number(d.OPPORTUNITY || 0), 0);
      const avgCycle = won?.length > 0 ? Math.round(won.reduce((s, d) => s + Math.round((new Date(d.DATE_CLOSED) - new Date(d.DATE_CREATE)) / 86400000), 0) / won.length) : 0;
      setKpi({ wonDeals: won?.length || 0, wonAmount: wonAmt, totalDeals: allDeals?.length || 0, pct: allDeals?.length > 0 ? Math.round((won?.length || 0) / allDeals.length * 100) : 0, avgCycle });
    } catch (e) {
      // KPI failed silently — don't block the UI
      setKpi({ wonDeals: 0, wonAmount: 0, totalDeals: 0, pct: 0, avgCycle: 0 });
    }
    setKpiLoading(false);
  }, []);

  // ── Save plans ─────────────────────────────────────────────────────────────
  const savePlans = useCallback(async newPlans => {
    setPlans(newPlans);
    try { await bx24("app.option.set", { options: { [PLAN_OPTION_KEY]: JSON.stringify(newPlans) } }); }
    catch (e) { addErr(e.message); }
  }, []);

  const saveROPs = useCallback(async newROPs => {
    setStoredROPs(newROPs);
    try { await bx24("app.option.set", { options: { stored_rops: JSON.stringify(newROPs) } }); }
    catch (e) { addErr(e.message); }
  }, []);

  const toggleROP = useCallback(async userId => {
    const id = String(userId);
    const newROPs = storedROPs.includes(id) ? storedROPs.filter(x => x !== id) : [...storedROPs, id];
    await saveROPs(newROPs);
  }, [storedROPs, saveROPs]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const quickResult = useCallback(async (itemId, source, resultType, label, dealId) => {
    setStatusChanging(itemId);
    const txt = `[${String(label)}] Быстрое закрытие`;
    setItems(ts => ts.filter(t => t.id !== itemId));
    try {
      if (source === "activity") await bx24("crm.activity.update", { id: itemId.replace("a_", ""), fields: { COMPLETED: 1 } });
      else await bx24("tasks.task.update", { taskId: itemId.replace("t_", ""), fields: { STATUS: 5 } });
      await addComment(dealId, txt); await appendChecklist(dealId, txt);
    } catch (e) { addErr(e.message); }
    setStatusChanging(null);
  }, [addComment, appendChecklist]);

  const handleComplete = useCallback(async (itemId, source, { result, comment }, dealId) => {
    setBusy(true);
    const label = RESULTS.find(r => r.id === result)?.label || result;
    const txt = `[${String(label)}] ${String(comment)}`;
    setItems(ts => ts.map(t => t.id === itemId ? { ...t, status: "done", comment: String(comment), resultType: result } : t));
    try {
      if (source === "activity") await bx24("crm.activity.update", { id: itemId.replace("a_", ""), fields: { COMPLETED: 1 } });
      else await bx24("tasks.task.update", { taskId: itemId.replace("t_", ""), fields: { STATUS: 5 } });
      await addComment(dealId, txt); await appendChecklist(dealId, txt);
    } catch (e) { addErr(e.message); }
    setBusy(false);
  }, [addComment, appendChecklist]);

  const handleReschedule = useCallback(async (itemId, source, { date, comment }, dealId) => {
    setBusy(true);
    const iso = new Date(date + "T09:00:00").toISOString();
    const txt = `[Перенесено на ${fmt(iso)}] ${String(comment)}`;
    setItems(ts => ts.map(t => t.id === itemId ? { ...t, status: "rescheduled", comment: String(comment), deadline: fmt(iso) } : t));
    try {
      if (source === "activity") await bx24("crm.activity.update", { id: itemId.replace("a_", ""), fields: { DEADLINE: iso } });
      else await bx24("tasks.task.update", { taskId: itemId.replace("t_", ""), fields: { DEADLINE: iso } });
      await addComment(dealId, txt); await appendChecklist(dealId, txt);
    } catch (e) { addErr(e.message); }
    setBusy(false);
  }, [addComment, appendChecklist]);

  const handleStageChange = useCallback(async (dealId, newStage) => {
    setBusy(true);
    setDeals(ds => ds.map(d => String(d.ID) === String(dealId) ? { ...d, STAGE_ID: newStage } : d));
    const stageName = stages.find(s => s.STATUS_ID === newStage)?.NAME || newStage;
    try {
      await bx24("crm.deal.update", { id: String(dealId), fields: { STAGE_ID: newStage } });
      await appendChecklist(dealId, `Стадия → ${stageName}`);
    } catch (e) { addErr(e.message); }
    setBusy(false);
  }, [stages, appendChecklist]);

  const handleReassign = useCallback(async (dealId, newUser) => {
    setBusy(true);
    setDeals(ds => ds.map(d => String(d.ID) === String(dealId) ? { ...d, ASSIGNED_BY_ID: String(newUser.id) } : d));
    const txt = `Ответственный изменён → ${newUser.name}`;
    try {
      await bx24("crm.deal.update", { id: String(dealId), fields: { ASSIGNED_BY_ID: String(newUser.id) } });
      await appendChecklist(dealId, txt);
    } catch (e) { addErr(e.message); }
    setBusy(false);
  }, [appendChecklist]);

  const handleTagsChange = useCallback((itemId, tags) => {
    setItems(ts => ts.map(t => t.id === itemId ? { ...t, tags } : t));
    setQueue(qs => qs.map(t => t.id === itemId ? { ...t, tags } : t));
  }, []);

  // ── Computed ───────────────────────────────────────────────────────────────
  const todayItems = items.filter(t => isToday(t.deadline) && t.status !== "done" && t.status !== "rescheduled");
  const overdueItems = items.filter(t => isOver(t.deadline));
  const doneItems = items.filter(t => t.status === "done");
  const monthPlan = plans[viewUser?.id] ? Number(plans[viewUser?.id]) / 12 : 0;

  if (initErr) return <div style={{ padding: 24, background: C.amber.bg, borderRadius: 12, margin: 16 }}><p style={{ margin: 0, color: C.amber.text, fontSize: 14, fontWeight: 500 }}>{initErr}</p></div>;

  const cardProps = { deals, stages, users, role, onQuickResult: quickResult, onComplete: handleComplete, onReschedule: handleReschedule, onTagsChange: handleTagsChange, onStageChange: handleStageChange, onReassign: handleReassign, busy, statusChanging };

  const TABS = [
    { id: "today", label: `Сегодня (${todayItems.length})` },
    { id: "queue", label: `Очередь (${queue.length})` },
    { id: "report", label: `Отчёт${doneItems.length > 0 ? " ●" : ""}` },
    ...(canManagePlan(role) ? [{ id: "plan", label: "План" }] : []),
    ...(canManageSettings(role) ? [{ id: "settings", label: "Настройки" }] : []),
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
          {canViewOthers(role) && (
            users.length > 1 ? (
              <select onChange={e => { const u = users.find(x => String(x.id) === e.target.value); if (u) setViewUser(u); }} value={String(viewUser?.id || "")} style={{ fontSize: 12, padding: "5px 10px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)" }}>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            ) : (
              <button onClick={async () => {
                try {
                  const all = await bx24("user.get", { filter: { ACTIVE: true }, select: ["ID","NAME","LAST_NAME","WORK_POSITION"] });
                  setUsers((all || []).map(x => ({ id: x.ID, name: `${x.NAME} ${x.LAST_NAME}`.trim(), position: x.WORK_POSITION || "Менеджер" })));
                } catch(e) { addErr(e.message); }
              }} style={{ fontSize: 11, padding: "5px 12px" }}>
                👥 Сотрудники
              </button>
            )
          )}
          <button onClick={() => viewUser && loadData(viewUser.id)} disabled={loading} style={{ fontSize: 11, padding: "5px 12px" }}>↻</button>
        </div>
      </div>

      {errors.map((e, i) => <div key={i} style={{ background: C.red.bg, border: `0.5px solid ${C.red.border}`, borderRadius: "var(--border-radius-md)", padding: "8px 12px", marginBottom: 8 }}><p style={{ margin: 0, fontSize: 12, color: C.red.text }}>⚠ {e}</p></div>)}
      {loading && <div style={{ marginBottom: 12 }}><Spin label={loadMsg} /></div>}

      {/* User bar */}
      {viewUser && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, padding: "8px 12px", background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)" }}>
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: C[ROLE_COLORS[role] || "gray"].bg, color: C[ROLE_COLORS[role] || "gray"].text, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 500, flexShrink: 0 }}>
            {viewUser.name.split(" ").slice(0, 2).map(n => n[0]).join("")}
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>{viewUser.name}</p>
            <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-secondary)" }}>{viewUser.position}</p>
          </div>
          <Badge color={ROLE_COLORS[role] || "gray"} sm>{ROLE_LABELS[role]}</Badge>
          {canViewOthers(role) && currentUser?.id !== viewUser?.id && <Badge color="amber" sm>просмотр</Badge>}
        </div>
      )}

      {/* Plan bar */}
      {monthPlan > 0 && (kpi || kpiLoading) && <PlanBar wonAmount={kpi?.wonAmount || 0} monthPlan={monthPlan} />}

      {/* Stats */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <Stat label="Дел сегодня" value={todayItems.length} color="blue" />
        <Stat label="Выполнено" value={doneItems.length} color="green" />
        <Stat label="Просрочено" value={overdueItems.length} color={overdueItems.length > 0 ? "red" : "gray"} />
        {kpiLoading ? <div style={{flex:1,minWidth:80,background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"10px 14px"}}><p style={{margin:0,fontSize:10,color:"var(--color-text-secondary)"}}>Конверсия</p><Spin label=""/></div> : kpi && <Stat label="Конверсия" value={(kpi.pct || 0) + "%"} color={kpi.pct >= 30 ? "green" : kpi.pct >= 15 ? "amber" : "red"} note="этот месяц" />}
      </div>

      {/* Overdue */}
      {overdueItems.length > 0 && (
        <div style={{ background: C.red.bg, border: `0.5px solid ${C.red.border}`, borderRadius: "var(--border-radius-lg)", padding: "10px 12px", marginBottom: 12 }}>
          <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 500, color: C.red.text }}>⚠ Просроченные дела</p>
          {overdueItems.map(t => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", borderBottom: `0.5px solid ${C.red.border}` }}>
              <span style={{ flex: 1, fontSize: 12, color: C.red.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
              <span style={{ fontSize: 11, color: C.red.text, flexShrink: 0 }}>{t.deadline}</span>
              <button onClick={() => handleReschedule(t.id, t.source, { date: new Date(Date.now() + 86400000).toISOString().split("T")[0], comment: "Перенесено на завтра" }, t.dealId)} disabled={busy} style={{ fontSize: 10, padding: "2px 8px", flexShrink: 0 }}>→ Завтра</button>
              <button onClick={() => quickResult(t.id, t.source, "done", "Закрыто", t.dealId)} disabled={busy} style={{ fontSize: 10, padding: "2px 8px", flexShrink: 0 }}>✓</button>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "0.5px solid var(--color-border-tertiary)", marginBottom: 12, flexWrap: "wrap" }}>
        {TABS.map(t => <button key={t.id} onClick={() => setTab(t.id)} style={{ background: "transparent", border: "none", padding: "6px 12px", fontSize: 12, cursor: "pointer", color: tab === t.id ? "var(--color-text-primary)" : "var(--color-text-secondary)", borderBottom: tab === t.id ? "2px solid var(--color-text-primary)" : "2px solid transparent", fontWeight: tab === t.id ? 500 : 400 }}>{t.label}</button>)}
      </div>

      {tab === "today" && <>
        {todayItems.length === 0 && !loading && <p style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>Нет дел на сегодня — возьмите из очереди.</p>}
        {todayItems.map(t => <DealCard key={t.id} item={t} {...cardProps} />)}
        {doneItems.length > 0 && <>
          <p style={{ margin: "12px 0 6px", fontSize: 10, color: "var(--color-text-secondary)", textTransform: "uppercase" }}>Выполнено ({doneItems.length})</p>
          {doneItems.map(t => <DealCard key={t.id} item={t} {...cardProps} />)}
        </>}
      </>}

      {tab === "queue" && <>
        <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--color-text-secondary)" }}>Дела на будущие даты — {queue.length} шт.</p>
        {queue.length === 0 && <p style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>Очередь пуста</p>}
        {queue.map(t => <DealCard key={t.id} item={t} {...cardProps} />)}
      </>}

      {tab === "report" && <ReportTab items={items} queue={queue} userName={viewUser?.name || ""} kpi={kpi} monthPlan={monthPlan} />}

      {tab === "plan" && canManagePlan(role) && (
        <PlanManager
          users={users.length > 0 ? users : (currentUser ? [currentUser] : [])}
          plans={plans}
          onSave={savePlans}
          currentRole={role}
          storedROPs={storedROPs}
          onROPToggle={toggleROP}
        />
      )}

      {tab === "settings" && canManageSettings(role) && (
        <div>
          <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 500 }}>Теги</p>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 16 }}>
            {TAGS.map(t => <span key={t.id} style={{ background: t.bg, color: t.c, border: `0.5px solid ${t.c}`, borderRadius: 5, padding: "3px 9px", fontSize: 11, fontWeight: 500 }}>{t.label}</span>)}
          </div>
          <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 12, marginBottom: 12 }}>
            <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 500 }}>Правила</p>
            {["Обязательный комментарий при переносе", `Чек-лист в поле ${CRM_CHECKLIST_FIELD}`, "Комментарий летит в таймлайн сделки", "Отчёт руководителю в конце дня"].map((r, i) => <label key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "5px 0", borderBottom: "0.5px solid var(--color-border-tertiary)", cursor: "pointer" }}><input type="checkbox" defaultChecked />{r}</label>)}
          </div>
          <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 12 }}>
            <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 500 }}>Авто-дело "Связаться с клиентом"</p>
            <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)" }}>CRM → Автоматизация → Роботы → При создании сделки → Создать дело. Тип: Звонок, Исполнитель: Ответственный, Срок: +0 дней.</p>
          </div>
        </div>
      )}
    </div>
  );
}
