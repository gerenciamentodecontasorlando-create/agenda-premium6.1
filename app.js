/* BTX Agenda Premium 6.1 — app.js
   - Offline-first (IndexedDB)
   - Multi-profissionais (profissional ativo)
   - Agenda dia/semana, status, WhatsApp 1-toque, busca
   - Documentos: Receita inteligente, Orçamento, Atestado, Laudo, Recibo (PDF individualizados)
   - Backup/Restore JSON
*/

const KEYS = {
  PASS: "cfg.pass",
  LICENSE: "cfg.license",
  CLINIC: "data.clinic",
  PROFS: "data.profs",
  ACTIVE_PROF: "data.active_prof",
  APPTS: "data.appts", // array
};

const DEFAULT_PASS = "btx007";

const DEFAULT_CLINIC = {
  nome: "Sua Clínica",
  endereco: "Endereço completo",
  cidadeUF: "Cidade - UF",
  telefone: "(00) 00000-0000",
  cnpj: "",
};

const DEFAULT_PROF = () => ({
  id: crypto.randomUUID(),
  nome: "Profissional 1",
  registro: "CRO/CRM/OUTRO",
  numero: "00000",
  contato: "(00) 00000-0000",
  email: "",
  endereco: "Endereço do profissional (opcional)",
  assinatura: "________________________________",
});

function $(id){ return document.getElementById(id); }
function todayISO(){ return new Date().toISOString().slice(0,10); }
function fmtDateBR(iso){
  if(!iso) return "";
  const [y,m,d]=iso.split("-");
  return `${d}/${m}/${y}`;
}
function onlyDigits(s){ return String(s||"").replace(/\D/g,""); }

function setStatus(msg){
  const el = $("statusLine");
  if(el) el.textContent = msg;
}

async function boot(){
  // SW
  if("serviceWorker" in navigator){
    try{ await navigator.serviceWorker.register("./sw.js"); }catch(e){}
  }

  // UI refs
  setupInstall();
  setupLogin();
  setupNav();
  setupBackupRestore();

  // Defaults first run
  const pass = await idbGet(KEYS.PASS);
  if(!pass) await idbSet(KEYS.PASS, DEFAULT_PASS);

  let clinic = await idbGet(KEYS.CLINIC);
  if(!clinic){ clinic = DEFAULT_CLINIC; await idbSet(KEYS.CLINIC, clinic); }

  let profs = await idbGet(KEYS.PROFS);
  if(!profs || !Array.isArray(profs) || profs.length===0){
    profs = [DEFAULT_PROF()];
    await idbSet(KEYS.PROFS, profs);
    await idbSet(KEYS.ACTIVE_PROF, profs[0].id);
  }

  let appts = await idbGet(KEYS.APPTS);
  if(!Array.isArray(appts)) await idbSet(KEYS.APPTS, []);

  // Prefill dates
  ["rxData","orcData","atData","ldData","rcData","dayPick"].forEach(id=>{ const el=$(id); if(el) el.value=todayISO(); });

  // Fill config
  $("cfgPass").value = await idbGet(KEYS.PASS) || DEFAULT_PASS;
  $("cfgLicense").value = await idbGet(KEYS.LICENSE) || "";

  // Fill professionals select
  await refreshProfessionalsUI();

  // Clinic footer
  await refreshClinicFooter();

  // Agenda controls
  setupAgenda();
  setupDocs();

  // Search
  setupSearch();

  // Default tab
  openTab("agenda");

  setStatus("Pronto. Offline-first ativo.");
}

function setupInstall(){
  const btn = $("btnInstall");
  const info = $("installInfo");
  let deferredPrompt = null;

  window.addEventListener("beforeinstallprompt", (e)=>{
    e.preventDefault();
    deferredPrompt = e;
    if(info) info.textContent = "Pronto para instalar no dispositivo.";
  });

  btn?.addEventListener("click", async ()=>{
    if(!deferredPrompt){
      if(info) info.textContent = "Se não aparecer, use: Menu do navegador → Instalar app.";
      return;
    }
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  });
}

function setupLogin(){
  $("btnLogin")?.addEventListener("click", async ()=>{
    const pass = $("loginPass").value.trim();
    const saved = (await idbGet(KEYS.PASS)) || DEFAULT_PASS;
    if(pass !== saved){
      alert("Senha incorreta.");
      return;
    }
    $("screenLogin").classList.add("hidden");
    $("screenMain").classList.remove("hidden");
  });

  $("btnLock")?.addEventListener("click", ()=>{
    $("loginPass").value = "";
    $("screenMain").classList.add("hidden");
    $("screenLogin").classList.remove("hidden");
  });

  // Enter to login
  $("loginPass")?.addEventListener("keydown",(e)=>{
    if(e.key==="Enter") $("btnLogin").click();
  });
}

function setupNav(){
  document.querySelectorAll(".navItem").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      openTab(btn.dataset.tab);
    });
  });
}

function openTab(name){
  document.querySelectorAll(".tab").forEach(t=>t.classList.add("hidden"));
  document.querySelectorAll(".navItem").forEach(b=>b.classList.remove("active"));
  $("tab-"+name)?.classList.remove("hidden");
  document.querySelector(`.navItem[data-tab="${name}"]`)?.classList.add("active");
}

function setupBackupRestore(){
  $("btnBackup")?.addEventListener("click", async ()=>{
    const dump = await idbDump();
    const blob = new Blob([JSON.stringify(dump, null, 2)], {type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `btx_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    setStatus("Backup exportado.");
  });

  $("fileRestore")?.addEventListener("change", async (e)=>{
    const file = e.target.files?.[0];
    if(!file) return;
    const txt = await file.text();
    let data=null;
    try{ data = JSON.parse(txt); }catch(err){ alert("JSON inválido."); return; }

    // Restaura chaves conhecidas somente
    const allow = Object.values(KEYS);
    for(const k of allow){
      if(k in data) await idbSet(k, data[k]);
    }
    alert("Restaurado! Recarregue a página.");
    setStatus("Restaurado (recarregar recomendado).");
  });
}

async function refreshClinicFooter(){
  const clinic = await idbGet(KEYS.CLINIC) || DEFAULT_CLINIC;
  $("footerClinic").textContent = `${clinic.nome} • ${clinic.endereco} • ${clinic.cidadeUF} • ${clinic.telefone}`;
}

async function getActiveProf(){
  const profs = await idbGet(KEYS.PROFS) || [];
  const activeId = await idbGet(KEYS.ACTIVE_PROF);
  let p = profs.find(x=>x.id===activeId) || profs[0];
  return {p, profs};
}

async function refreshProfessionalsUI(){
  const {p, profs} = await getActiveProf();
  const sel = $("selProf");
  sel.innerHTML = "";
  profs.forEach(pr=>{
    const opt = document.createElement("option");
    opt.value = pr.id;
    opt.textContent = `${pr.nome} (${pr.registro} ${pr.numero})`;
    sel.appendChild(opt);
  });
  sel.value = p.id;

  $("activeProfLine").textContent = `Profissional ativo: ${p.nome} • ${p.registro} ${p.numero}`;

  sel.onchange = async ()=>{
    await idbSet(KEYS.ACTIVE_PROF, sel.value);
    await refreshProfessionalsUI();
    setStatus("Profissional ativo atualizado.");
  };

  $("btnProfNew").onclick = async ()=>{
    await modalProfForm();
  };

  $("btnClinicEdit").onclick = async ()=>{
    await modalClinicForm();
  };
}

function modalOpen(title, bodyNode, footButtons=[]){
  $("modalTitle").textContent = title;
  const body = $("modalBody");
  const foot = $("modalFoot");
  body.innerHTML = "";
  foot.innerHTML = "";
  body.appendChild(bodyNode);

  footButtons.forEach(btn=>foot.appendChild(btn));

  $("modal").classList.remove("hidden");
  $("modalClose").onclick = ()=>$("modal").classList.add("hidden");
}

async function modalClinicForm(){
  const clinic = await idbGet(KEYS.CLINIC) || DEFAULT_CLINIC;

  const box = document.createElement("div");
  box.innerHTML = `
    <label class="lbl">Nome da clínica</label>
    <input id="_c_nome" class="inp" value="${escapeHtml(clinic.nome)}" />
    <label class="lbl">Endereço</label>
    <input id="_c_end" class="inp" value="${escapeHtml(clinic.endereco)}" />
    <label class="lbl">Cidade/UF</label>
    <input id="_c_cid" class="inp" value="${escapeHtml(clinic.cidadeUF)}" />
    <label class="lbl">Telefone</label>
    <input id="_c_tel" class="inp" value="${escapeHtml(clinic.telefone)}" />
    <label class="lbl">CNPJ (opcional)</label>
    <input id="_c_cnpj" class="inp" value="${escapeHtml(clinic.cnpj||"")}" />
  `;

  const btnSave = mkBtn("Salvar", "primary", async ()=>{
    const upd = {
      nome: $("._tmp")?null:null, // noop
      nome: document.getElementById("_c_nome").value.trim(),
      endereco: document.getElementById("_c_end").value.trim(),
      cidadeUF: document.getElementById("_c_cid").value.trim(),
      telefone: document.getElementById("_c_tel").value.trim(),
      cnpj: document.getElementById("_c_cnpj").value.trim(),
    };
    await idbSet(KEYS.CLINIC, upd);
    await refreshClinicFooter();
    $("modal").classList.add("hidden");
    setStatus("Clínica atualizada.");
  });

  modalOpen("Dados da clínica", box, [btnSave, mkBtn("Cancelar","ghost", ()=>$("modal").classList.add("hidden"))]);
}

async function modalProfForm(editId=null){
  const data = await idbGet(KEYS.PROFS) || [];
  let prof = editId ? data.find(p=>p.id===editId) : DEFAULT_PROF();

  const box = document.createElement("div");
  box.innerHTML = `
    <label class="lbl">Nome</label>
    <input id="_p_nome" class="inp" value="${escapeHtml(prof.nome)}" />
    <div class="row2">
      <div>
        <label class="lbl">Registro</label>
        <input id="_p_reg" class="inp" value="${escapeHtml(prof.registro)}" />
      </div>
      <div>
        <label class="lbl">Número</label>
        <input id="_p_num" class="inp" value="${escapeHtml(prof.numero)}" />
      </div>
    </div>
    <div class="row2">
      <div>
        <label class="lbl">Contato</label>
        <input id="_p_cont" class="inp" value="${escapeHtml(prof.contato)}" />
      </div>
      <div>
        <label class="lbl">E-mail</label>
        <input id="_p_mail" class="inp" value="${escapeHtml(prof.email||"")}" />
      </div>
    </div>
    <label class="lbl">Endereço (opcional)</label>
    <input id="_p_end" class="inp" value="${escapeHtml(prof.endereco||"")}" />
    <label class="lbl">Linha de assinatura (opcional)</label>
    <input id="_p_ass" class="inp" value="${escapeHtml(prof.assinatura||"")}" />
    <div class="sep"></div>
    <div class="muted small">Dica: você pode criar vários profissionais (clínica integrada) e alternar o “ativo”.</div>
  `;

  const btnSave = mkBtn("Salvar", "primary", async ()=>{
    const upd = {
      ...prof,
      nome: document.getElementById("_p_nome").value.trim(),
      registro: document.getElementById("_p_reg").value.trim(),
      numero: document.getElementById("_p_num").value.trim(),
      contato: document.getElementById("_p_cont").value.trim(),
      email: document.getElementById("_p_mail").value.trim(),
      endereco: document.getElementById("_p_end").value.trim(),
      assinatura: document.getElementById("_p_ass").value.trim(),
    };

    let profs = await idbGet(KEYS.PROFS) || [];
    const idx = profs.findIndex(p=>p.id===upd.id);
    if(idx>=0) profs[idx]=upd; else profs.push(upd);

    await idbSet(KEYS.PROFS, profs);
    await idbSet(KEYS.ACTIVE_PROF, upd.id);
    await refreshProfessionalsUI();
    $("modal").classList.add("hidden");
    setStatus("Profissional salvo.");
  });

  const btnDel = mkBtn("Excluir","danger", async ()=>{
    if(!confirm("Excluir este profissional?")) return;
    let profs = await idbGet(KEYS.PROFS) || [];
    profs = profs.filter(p=>p.id!==prof.id);
    if(profs.length===0) profs=[DEFAULT_PROF()];
    await idbSet(KEYS.PROFS, profs);
    await idbSet(KEYS.ACTIVE_PROF, profs[0].id);
    await refreshProfessionalsUI();
    $("modal").classList.add("hidden");
    setStatus("Profissional excluído.");
  });

  modalOpen(editId? "Editar profissional":"Novo profissional", box, [btnSave, editId?btnDel:null, mkBtn("Cancelar","ghost", ()=>$("modal").classList.add("hidden"))].filter(Boolean));
}

function mkBtn(label, kind="ghost", onClick=()=>{}){
  const b = document.createElement("button");
  b.className = "btn "+kind;
  b.textContent = label;
  b.onclick = onClick;
  return b;
}

function escapeHtml(s){
  return String(s||"").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

/* =========================
   AGENDA
========================= */
let currentDay = todayISO();

function setupAgenda(){
  $("btnToday").onclick = ()=>{ currentDay=todayISO(); $("dayPick").value=currentDay; renderAgenda(); };
  $("btnPrevDay").onclick = ()=>{ currentDay=shiftDay(currentDay,-1); $("dayPick").value=currentDay; renderAgenda(); };
  $("btnNextDay").onclick = ()=>{ currentDay=shiftDay(currentDay, 1); $("dayPick").value=currentDay; renderAgenda(); };

  $("dayPick").onchange = ()=>{ currentDay=$("dayPick").value||todayISO(); renderAgenda(); };
  $("viewMode").onchange = ()=>renderAgenda();

  $("btnSaveAppt").onclick = ()=>saveApptQuick();
  $("btnNewAppt").onclick = ()=>{ document.getElementById("aPaciente").focus(); };

  $("btnAgendaPDF").onclick = ()=>agendaPDF();

  $("dayPick").value = currentDay;
  renderAgenda();
}

function shiftDay(iso, delta){
  const d = new Date(iso+"T00:00:00");
  d.setDate(d.getDate()+delta);
  return d.toISOString().slice(0,10);
}

async function saveApptQuick(){
  const dia = $("dayPick").value || todayISO();
  const hora = $("aHora").value || "";
  const paciente = $("aPaciente").value.trim();
  const fone = $("aFone").value.trim();
  const servico = $("aServico").value.trim();
  const obs = $("aObs").value.trim();
  const status = $("aStatus").value;

  if(!paciente){ alert("Digite o nome do paciente."); return; }

  const {p} = await getActiveProf();

  const appt = {
    id: crypto.randomUUID(),
    dia, hora,
    paciente,
    fone: onlyDigits(fone),
    servico,
    obs,
    status,
    profId: p.id,
    profNome: p.nome,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  let appts = await idbGet(KEYS.APPTS) || [];
  appts.push(appt);
  appts = appts.sort((a,b)=> (a.dia+a.hora).localeCompare(b.dia+b.hora));
  await idbSet(KEYS.APPTS, appts);

  // clear
  $("aHora").value = "";
  $("aPaciente").value = "";
  $("aFone").value = "";
  $("aServico").value = "";
  $("aObs").value = "";
  $("aStatus").value = "pendente";

  setStatus("Agendamento salvo.");
  renderAgenda();
}

async function renderAgenda(){
  const mode = $("viewMode").value;
  const appts = await idbGet(KEYS.APPTS) || [];
  const profs = await idbGet(KEYS.PROFS) || [];
  const profMap = new Map(profs.map(p=>[p.id,p]));

  if(mode==="day"){
    $("agendaTitle").textContent = `Agenda do dia — ${fmtDateBR(currentDay)}`;
    const list = appts.filter(a=>a.dia===currentDay);
    drawAgendaList(list, profMap);
  }else{
    const week = weekRange(currentDay);
    $("agendaTitle").textContent = `Agenda da semana — ${fmtDateBR(week.start)} a ${fmtDateBR(week.end)}`;
    const list = appts.filter(a=>a.dia>=week.start && a.dia<=week.end);
    drawAgendaList(list, profMap, true);
  }
}

function weekRange(dayISO){
  const d = new Date(dayISO+"T00:00:00");
  const day = d.getDay(); // 0 sunday
  const diffToMon = (day===0? -6 : 1-day);
  const mon = new Date(d); mon.setDate(d.getDate()+diffToMon);
  const sun = new Date(mon); sun.setDate(mon.getDate()+6);
  return {start: mon.toISOString().slice(0,10), end: sun.toISOString().slice(0,10)};
}

function drawAgendaList(list, profMap, showDay=false){
  const box = $("agendaList");
  box.innerHTML = "";
  if(list.length===0){
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "Nenhum agendamento.";
    box.appendChild(empty);
    return;
  }
  list.forEach(a=>{
    const div = document.createElement("div");
    div.className = "appt";
    const badge = document.createElement("div");
    badge.className = "badge "+a.status;
    badge.textContent = a.status.toUpperCase();

    const mid = document.createElement("div");
    const title = document.createElement("div");
    title.className="apptTitle";
    title.textContent = `${a.hora||"--:--"} • ${a.paciente}${showDay?` • ${fmtDateBR(a.dia)}`:""}`;

    const sub = document.createElement("div");
    sub.className="apptSub";
    const profName = a.profNome || (profMap.get(a.profId)?.nome || "—");
    const svc = a.servico ? ` • ${a.servico}`:"";
    sub.textContent = `${profName}${svc}${a.obs?` • ${a.obs}`:""}`;

    mid.appendChild(title); mid.appendChild(sub);

    const actions = document.createElement("div");
    actions.className="apptActions";

    const btnEdit = mkBtn("Editar", "", ()=>editAppt(a.id));
    const btnWA = mkBtn("WhatsApp", "", ()=>openWhatsApp(a));
    const btnDel = mkBtn("Excluir", "danger", ()=>deleteAppt(a.id));

    actions.append(btnEdit, btnWA, btnDel);

    div.append(badge, mid, actions);
    box.appendChild(div);
  });
}

function openWhatsApp(a){
  const phone = onlyDigits(a.fone||"");
  if(!phone){ alert("Sem telefone/WhatsApp neste agendamento."); return; }
  const msg = encodeURIComponent(`Olá, ${a.paciente}! Confirmando seu atendimento em ${fmtDateBR(a.dia)} ${a.hora||""}. BTX Agenda`);
  const url = `https://wa.me/55${phone}?text=${msg}`;
  window.open(url, "_blank");
}

async function editAppt(id){
  const appts = await idbGet(KEYS.APPTS) || [];
  const a = appts.find(x=>x.id===id);
  if(!a) return;

  const box = document.createElement("div");
  box.innerHTML = `
    <div class="row2">
      <div>
        <label class="lbl">Dia</label>
        <input id="_e_dia" class="inp" type="date" value="${a.dia}" />
      </div>
      <div>
        <label class="lbl">Hora</label>
        <input id="_e_hora" class="inp" type="time" value="${a.hora||""}" />
      </div>
    </div>
    <label class="lbl">Paciente</label>
    <input id="_e_pac" class="inp" value="${escapeHtml(a.paciente)}" />
    <div class="row2">
      <div>
        <label class="lbl">WhatsApp</label>
        <input id="_e_fone" class="inp" value="${escapeHtml(a.fone||"")}" />
      </div>
      <div>
        <label class="lbl">Status</label>
        <select id="_e_status" class="inp">
          ${["pendente","confirmado","realizado","faltou","remarcado"].map(s=>`<option value="${s}" ${a.status===s?"selected":""}>${s}</option>`).join("")}
        </select>
      </div>
    </div>
    <label class="lbl">Serviço / Profissional (texto)</label>
    <input id="_e_serv" class="inp" value="${escapeHtml(a.servico||"")}" />
    <label class="lbl">Observações</label>
    <textarea id="_e_obs" class="inp" rows="3">${escapeHtml(a.obs||"")}</textarea>
  `;

  const btnSave = mkBtn("Salvar","primary", async ()=>{
    a.dia = document.getElementById("_e_dia").value;
    a.hora = document.getElementById("_e_hora").value;
    a.paciente = document.getElementById("_e_pac").value.trim();
    a.fone = onlyDigits(document.getElementById("_e_fone").value);
    a.status = document.getElementById("_e_status").value;
    a.servico = document.getElementById("_e_serv").value.trim();
    a.obs = document.getElementById("_e_obs").value.trim();
    a.updatedAt = Date.now();

    const idx = appts.findIndex(x=>x.id===id);
    appts[idx]=a;
    appts.sort((x,y)=> (x.dia+(x.hora||"")).localeCompare(y.dia+(y.hora||"")));
    await idbSet(KEYS.APPTS, appts);
    $("modal").classList.add("hidden");
    setStatus("Agendamento atualizado.");
    renderAgenda();
  });

  modalOpen("Editar agendamento", box, [btnSave, mkBtn("Cancelar","ghost", ()=>$("modal").classList.add("hidden"))]);
}

async function deleteAppt(id){
  if(!confirm("Excluir este agendamento?")) return;
  let appts = await idbGet(KEYS.APPTS) || [];
  appts = appts.filter(a=>a.id!==id);
  await idbSet(KEYS.APPTS, appts);
  setStatus("Agendamento excluído.");
  renderAgenda();
}

async function agendaPDF(){
  const mode = $("viewMode").value;
  const appts = await idbGet(KEYS.APPTS) || [];
  const clinic = await idbGet(KEYS.CLINIC) || DEFAULT_CLINIC;

  let list=[], title="";
  if(mode==="day"){
    list = appts.filter(a=>a.dia===currentDay);
    title = `Agenda do dia — ${fmtDateBR(currentDay)}`;
  }else{
    const w=weekRange(currentDay);
    list = appts.filter(a=>a.dia>=w.start && a.dia<=w.end);
    title = `Agenda da semana — ${fmtDateBR(w.start)} a ${fmtDateBR(w.end)}`;
  }

  const pdf = pdfStart(`${clinic.nome}`, clinic);
  pdf.setFontSize(14);
  pdf.text(title, 14, 42);

  pdf.setFontSize(10);
  let y=52;
  if(list.length===0){
    pdf.text("Nenhum agendamento.", 14, y);
  }else{
    for(const a of list){
      const line = `${a.dia} ${a.hora||"--:--"} • ${a.paciente} • ${a.status} • ${a.profNome||""} ${a.servico||""}`;
      y = pdfWrap(pdf, line, 14, y, 180, 5);
      if(y>270){ pdf.addPage(); y=20; }
    }
  }

  pdfSave(pdf, `agenda_${mode}_${new Date().toISOString().slice(0,10)}.pdf`);
}

/* =========================
   BUSCA
========================= */
function setupSearch(){
  const input = $("q");
  input.oninput = async ()=>{
    const q = input.value.trim().toLowerCase();
    const box = $("qResults");
    box.innerHTML = "";
    if(q.length<2) return;
    const appts = await idbGet(KEYS.APPTS) || [];
    const hits = appts.filter(a=> (a.paciente||"").toLowerCase().includes(q)).slice(0,12);
    hits.forEach(a=>{
      const div = document.createElement("div");
      div.className="qItem";
      div.innerHTML = `<b>${escapeHtml(a.paciente)}</b><div class="muted small">${fmtDateBR(a.dia)} ${a.hora||""} • ${escapeHtml(a.status)}</div>`;
      div.onclick = ()=>{
        currentDay = a.dia;
        $("dayPick").value = currentDay;
        openTab("agenda");
        renderAgenda();
      };
      box.appendChild(div);
    });
  };
}

/* =========================
   DOCUMENTOS + PDF
========================= */
const RX_PRESETS = {
  "Analgésico": [
    {nome:"Dipirona 500mg", texto:"Dipirona 500mg\nTomar 1 comprimido de 6/6h por 3 dias.\n"},
    {nome:"Paracetamol 750mg", texto:"Paracetamol 750mg\nTomar 1 comprimido de 8/8h por 3 dias.\n"},
    {nome:"Ibuprofeno 600mg (dor)", texto:"Ibuprofeno 600mg\nTomar 1 comprimido de 8/8h após refeições por 3 dias.\n"},
  ],
  "Anti-inflamatório": [
    {nome:"Nimesulida 100mg", texto:"Nimesulida 100mg\nTomar 1 comprimido de 12/12h após refeições por 3 dias.\n"},
    {nome:"Diclofenaco 50mg", texto:"Diclofenaco 50mg\nTomar 1 comprimido de 8/8h após refeições por 3 dias.\n"},
    {nome:"Prednisona 20mg (curto)", texto:"Prednisona 20mg\nTomar 1 comprimido pela manhã por 3 dias.\n"},
  ],
  "Antibiótico": [
    {nome:"Amoxicilina 500mg", texto:"Amoxicilina 500mg\nTomar 1 cápsula de 8/8h por 7 dias.\n"},
    {nome:"Amoxicilina + Clavulanato 875/125mg", texto:"Amoxicilina + Clavulanato 875/125mg\nTomar 1 comprimido de 12/12h por 7 dias.\n"},
    {nome:"Azitromicina 500mg", texto:"Azitromicina 500mg\nTomar 1 comprimido ao dia por 3 dias.\n"},
  ],
  "Antifúngico": [
    {nome:"Nistatina suspensão", texto:"Nistatina suspensão oral\nBochechar/aplicar 4x ao dia por 7-14 dias.\n"},
    {nome:"Fluconazol 150mg", texto:"Fluconazol 150mg\nTomar 1 cápsula dose única (conforme avaliação).\n"},
  ],
  "Hipertensão": [
    {nome:"Losartana 50mg", texto:"Losartana 50mg\nTomar 1 comprimido ao dia (conforme prescrição médica).\n"},
    {nome:"Amlodipino 5mg", texto:"Amlodipino 5mg\nTomar 1 comprimido ao dia (conforme prescrição médica).\n"},
  ],
  "Diabetes": [
    {nome:"Metformina 500mg", texto:"Metformina 500mg\nTomar 1 comprimido com refeições (conforme prescrição médica).\n"},
    {nome:"Glibenclamida 5mg", texto:"Glibenclamida 5mg\nTomar 1 comprimido ao dia (conforme prescrição médica).\n"},
  ],
};

function setupDocs(){
  // RX
  const cat = $("rxCat");
  const model = $("rxModel");

  cat.innerHTML = Object.keys(RX_PRESETS).map(k=>`<option value="${k}">${k}</option>`).join("");
  function refreshModels(){
    const k = cat.value;
    const opts = RX_PRESETS[k] || [];
    model.innerHTML = opts.map((o,i)=>`<option value="${i}">${o.nome}</option>`).join("");
  }
  cat.onchange = refreshModels;
  refreshModels();

  $("btnRxAdd").onclick = ()=>{
    const k = cat.value;
    const idx = Number(model.value||0);
    const preset = (RX_PRESETS[k]||[])[idx];
    if(!preset) return;
    const t = $("rxText");
    t.value = (t.value.trim()? (t.value.trim()+"\n\n"):"") + preset.texto;
  };

  $("btnRxClear").onclick = ()=>{
    $("rxPaciente").value=""; $("rxData").value=todayISO(); $("rxText").value="";
  };

  $("btnRxPDF").onclick = async ()=>{
    const paciente = $("rxPaciente").value.trim();
    const data = $("rxData").value;
    const texto = $("rxText").value.trim();
    if(!paciente || !texto){ alert("Preencha paciente e receita."); return; }
    const {p} = await getActiveProf();
    const clinic = await idbGet(KEYS.CLINIC) || DEFAULT_CLINIC;

    const pdf = pdfStart("Receituário", clinic);
    pdf.setFontSize(13);
    pdf.text("RECEITUÁRIO", 105, 40, {align:"center"});

    pdf.setFontSize(11);
    pdf.text(`Paciente: ${paciente}`, 14, 52);
    pdf.text(`Data: ${fmtDateBR(data)}`, 150, 52);

    let y = 64;
    y = pdfWrap(pdf, texto, 14, y, 182, 6);

    pdfFooter(pdf, p, clinic);
    pdfSave(pdf, `receita_${safeName(paciente)}_${data}.pdf`);
  };

  // ORC
  $("btnOrcClear").onclick = ()=>{
    $("orcPaciente").value=""; $("orcData").value=todayISO(); $("orcTexto").value=""; $("orcValidade").value=""; $("orcObs").value="";
  };
  $("btnOrcPDF").onclick = async ()=>{
    const paciente = $("orcPaciente").value.trim();
    const data = $("orcData").value;
    const texto = $("orcTexto").value.trim();
    if(!paciente || !texto){ alert("Preencha paciente e descrição do orçamento."); return; }
    const {p} = await getActiveProf();
    const clinic = await idbGet(KEYS.CLINIC) || DEFAULT_CLINIC;

    const pdf = pdfStart("Orçamento", clinic);
    pdf.setFontSize(13);
    pdf.text("ORÇAMENTO", 105, 40, {align:"center"});

    pdf.setFontSize(11);
    pdf.text(`Paciente: ${paciente}`, 14, 52);
    pdf.text(`Data: ${fmtDateBR(data)}`, 150, 52);

    let y = 64;
    y = pdfWrap(pdf, texto, 14, y, 182, 6);

    const validade = $("orcValidade").value.trim();
    const obs = $("orcObs").value.trim();
    if(validade){ y += 6; pdf.text(`Validade: ${validade}`, 14, y); y += 6; }
    if(obs){ y += 2; y = pdfWrap(pdf, `Obs.: ${obs}`, 14, y, 182, 6); }

    pdfFooter(pdf, p, clinic);
    pdfSave(pdf, `orcamento_${safeName(paciente)}_${data}.pdf`);
  };

  // ATESTADO
  $("btnAtClear").onclick = ()=>{
    $("atPaciente").value=""; $("atData").value=todayISO(); $("atDias").value=""; $("atCid").value=""; 
    $("atTexto").value="Atesto para os devidos fins que o(a) paciente acima identificado(a) esteve sob meus cuidados nesta data, necessitando afastamento de suas atividades por ____ dia(s).";
  };

  $("btnAtPDF").onclick = async ()=>{
    const paciente = $("atPaciente").value.trim();
    const data = $("atData").value;
    const dias = $("atDias").value;
    const cid = $("atCid").value.trim();
    let texto = $("atTexto").value.trim();
    if(!paciente){ alert("Preencha o paciente."); return; }

    texto = texto.replace("____", dias? String(dias): "____");

    const {p} = await getActiveProf();
    const clinic = await idbGet(KEYS.CLINIC) || DEFAULT_CLINIC;

    const pdf = pdfStart("Atestado", clinic);
    pdf.setFontSize(13);
    pdf.text("ATESTADO", 105, 40, {align:"center"});

    pdf.setFontSize(11);
    pdf.text(`Paciente: ${paciente}`, 14, 52);
    pdf.text(`Data: ${fmtDateBR(data)}`, 150, 52);
    if(cid) pdf.text(`CID: ${cid}`, 14, 60);

    let y = cid ? 72 : 64;
    y = pdfWrap(pdf, texto, 14, y, 182, 6);

    pdfFooter(pdf, p, clinic, true);
    pdfSave(pdf, `atestado_${safeName(paciente)}_${data}.pdf`);
  };

  // LAUDO
  $("btnLdClear").onclick = ()=>{
    $("ldPaciente").value=""; $("ldData").value=todayISO(); $("ldTexto").value="";
  };
  $("btnLdPDF").onclick = async ()=>{
    const paciente = $("ldPaciente").value.trim();
    const data = $("ldData").value;
    const texto = $("ldTexto").value.trim();
    if(!paciente || !texto){ alert("Preencha paciente e laudo."); return; }
    const {p} = await getActiveProf();
    const clinic = await idbGet(KEYS.CLINIC) || DEFAULT_CLINIC;

    const pdf = pdfStart("Laudo", clinic);
    pdf.setFontSize(13);
    pdf.text("LAUDO", 105, 40, {align:"center"});
    pdf.setFontSize(11);
    pdf.text(`Paciente: ${paciente}`, 14, 52);
    pdf.text(`Data: ${fmtDateBR(data)}`, 150, 52);

    let y=64;
    y = pdfWrap(pdf, texto, 14, y, 182, 6);

    pdfFooter(pdf, p, clinic, true);
    pdfSave(pdf, `laudo_${safeName(paciente)}_${data}.pdf`);
  };

  // RECIBO
  $("btnRcClear").onclick = ()=>{
    $("rcPaciente").value=""; $("rcData").value=todayISO(); $("rcValor").value=""; $("rcRef").value=""; $("rcObs").value="";
  };
  $("btnRcPDF").onclick = async ()=>{
    const paciente = $("rcPaciente").value.trim();
    const data = $("rcData").value;
    const valor = $("rcValor").value.trim();
    const ref = $("rcRef").value.trim();
    const obs = $("rcObs").value.trim();
    if(!paciente || !valor || !ref){ alert("Preencha recebemos de, valor e referente a."); return; }
    const {p} = await getActiveProf();
    const clinic = await idbGet(KEYS.CLINIC) || DEFAULT_CLINIC;

    const pdf = pdfStart("Recibo", clinic);
    pdf.setFontSize(13);
    pdf.text("RECIBO", 105, 40, {align:"center"});
    pdf.setFontSize(11);
    pdf.text(`Data: ${fmtDateBR(data)}`, 150, 52);

    const texto = `Recebemos de ${paciente} a quantia de ${valor}, referente a ${ref}.`;
    let y=64;
    y = pdfWrap(pdf, texto, 14, y, 182, 6);
    if(obs){ y += 6; y = pdfWrap(pdf, `Obs.: ${obs}`, 14, y, 182, 6); }

    pdfFooter(pdf, p, clinic, true);
    pdfSave(pdf, `recibo_${safeName(paciente)}_${data}.pdf`);
  };

  // CONFIG
  $("btnSavePass").onclick = async ()=>{
    const pass = $("cfgPass").value.trim() || DEFAULT_PASS;
    await idbSet(KEYS.PASS, pass);
    alert("Senha salva.");
    setStatus("Senha atualizada.");
  };

  $("btnSaveLicense").onclick = async ()=>{
    await idbSet(KEYS.LICENSE, $("cfgLicense").value.trim());
    alert("Chave salva.");
  };

  $("btnFactoryReset").onclick = async ()=>{
    if(!confirm("Resetar tudo? Isso apaga agenda, profissionais e configurações.")) return;
    await idbClearAll();
    alert("Reset feito. Recarregue.");
    location.reload();
  };
}

function safeName(s){
  return String(s||"").toLowerCase().replace(/\s+/g,"_").replace(/[^a-z0-9_\-]/g,"");
}

/* ============= PDF helpers ============= */
function ensureJsPDF(){
  const ok = window.jspdf && window.jspdf.jsPDF;
  if(!ok){
    alert("Biblioteca de PDF (jsPDF) não carregou. Abra 1 vez online e recarregue.");
    throw new Error("jsPDF missing");
  }
  return window.jspdf.jsPDF;
}

function pdfStart(title, clinic){
  const jsPDF = ensureJsPDF();
  const pdf = new jsPDF({unit:"mm", format:"a4"});
  // header line
  pdf.setFontSize(12);
  pdf.text(clinic.nome || "Clínica", 14, 16);
  pdf.setFontSize(10);
  pdf.text(`${clinic.endereco} • ${clinic.cidadeUF}`, 14, 22);
  pdf.text(`${clinic.telefone}${clinic.cnpj?` • CNPJ: ${clinic.cnpj}`:""}`, 14, 27);
  pdf.setDrawColor(45,140,255);
  pdf.line(14, 31, 196, 31);
  return pdf;
}

function pdfFooter(pdf, prof, clinic, addLine=false){
  const y = 270;
  pdf.setDrawColor(180);
  pdf.line(14, y, 196, y);

  pdf.setFontSize(10);
  const left = `${prof.nome} • ${prof.registro} ${prof.numero}`;
  const right = prof.contato || clinic.telefone || "";
  pdf.text(left, 14, y+8);
  pdf.text(right, 196, y+8, {align:"right"});

  if(addLine){
    pdf.text(prof.assinatura||"______________________________", 105, y+18, {align:"center"});
  }
}

function pdfWrap(pdf, text, x, y, maxWidth, lineHeight){
  const lines = pdf.splitTextToSize(text, maxWidth);
  for(const ln of lines){
    if(y>270){ pdf.addPage(); y=20; }
    pdf.text(ln, x, y);
    y += lineHeight;
  }
  return y;
}

function pdfSave(pdf, filename){
  pdf.save(filename);
}

/* =========================
   INIT
========================= */
document.addEventListener("DOMContentLoaded", boot);
