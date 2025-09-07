document.addEventListener('DOMContentLoaded', () => {
  // =========================
  // VARIÁVEIS GLOBAIS
  // =========================
  const taskForm = document.getElementById('task-form');
  const taskInput = document.getElementById('task-input');
  const taskList = document.getElementById('task-list');
  const searchInput = document.getElementById('search-input');
  const filterButtonsContainer = document.getElementById('filter-buttons');
  let apiKey = localStorage.getItem('gemini-api-key') || "";
  let activeFilter = 'Todos';
  let attachedFileContent = null;

  const statuses = [
    { name: 'Aberto',        classes:'bg-blue-100 text-blue-800',     darkClasses:'dark:bg-blue-900/50 dark:text-blue-300',   color:'#3b82f6' },
    { name: 'Em Andamento',  classes:'bg-yellow-100 text-yellow-800', darkClasses:'dark:bg-yellow-900/50 dark:text-yellow-300', color:'#f59e0b' },
    { name: 'Desenvolvido',  classes:'bg-purple-100 text-purple-800', darkClasses:'dark:bg-purple-900/50 dark:text-purple-300', color:'#8b5cf6' },
    { name: 'Teste',         classes:'bg-indigo-100 text-indigo-800', darkClasses:'dark:bg-indigo-900/50 dark:text-indigo-300', color:'#6366f1' },
    { name: 'Finalizado',    classes:'bg-green-100 text-green-800',   darkClasses:'dark:bg-green-900/50 dark:text-green-300',  color:'#22c55e' }
  ];
  const finalizadoIndex = 4;
  const emAndamentoIndex = 1;

  let statusPieChart = null;
  let activityBarChart = null;
  let statusDurationChart = null;

  // =========================
  // UI / DASHBOARD
  // =========================
  function initializeStatusSummary() {
    const box = document.getElementById('status-summary');
    if (!box) return;
    box.innerHTML = statuses.map((s,i)=>`
      <div>
        <div class="flex justify-between items-center mb-1">
          <span class="text-sm font-medium text-gray-600 dark:text-gray-300">${s.name}</span>
          <span id="status-percent-${i}" class="text-sm font-medium text-gray-500 dark:text-gray-400">0 (0%)</span>
        </div>
        <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
          <div id="status-bar-${i}" class="h-2.5 rounded-full transition-all duration-500" style="width:0%;background-color:${s.color}"></div>
        </div>
      </div>`).join('');
  }

  function updateStatusSummary() {
    const all = document.querySelectorAll('.task-item');
    const total = all.length;
    const counts = Array(statuses.length).fill(0);
    all.forEach(t=>{
      const b = t.querySelector('.status-badge');
      if (b) counts[parseInt(b.dataset.statusIndex)]++;
    });
    counts.forEach((count,i)=>{
      const pct = total>0 ? Math.round((count/total)*100) : 0;
      const p = document.getElementById(`status-percent-${i}`);
      const bar = document.getElementById(`status-bar-${i}`);
      if (p && bar) { p.textContent = `${count} (${pct}%)`; bar.style.width = `${pct}%`; }
    });
  }

  function updateDashboard() {
    const allTasks = document.querySelectorAll('.task-entry');
    const totalTasks = allTasks.length;
    const completedTasks = document.querySelectorAll('.task-item.completed').length;

    document.getElementById('kpi-total').textContent = totalTasks;
    document.getElementById('kpi-completed').textContent = completedTasks;
    document.getElementById('kpi-pending').textContent = totalTasks - completedTasks;

    const statusCounts = Array(statuses.length).fill(0);
    allTasks.forEach(entry=>{
      const idx = parseInt(entry.querySelector('.task-item .status-badge').dataset.statusIndex);
      statusCounts[idx]++;
    });
    updatePieChart(statusCounts);

    const labels = [];
    const activityCounts = Array(7).fill(0);
    const today = new Date(); today.setHours(0,0,0,0);
    for (let i=6;i>=0;i--){
      const d = new Date(today); d.setDate(today.getDate()-i);
      labels.push(d.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}));
    }
    allTasks.forEach(entry=>{
      const dt = new Date(entry.dataset.timestamp); dt.setHours(0,0,0,0);
      const diff = Math.floor((today - dt)/(1000*60*60*24));
      if (diff>=0 && diff<7) activityCounts[6-diff]++;
    });
    updateBarChart(labels, activityCounts);

    const statusDurations = calculateStatusDurations();
    updateStatusDurationChart(statusDurations);
  }

  function updatePieChart(data) {
    const ctx = document.getElementById('status-pie-chart')?.getContext('2d'); if (!ctx) return;
    const isDark = document.documentElement.classList.contains('dark');
    if (statusPieChart) statusPieChart.destroy();
    statusPieChart = new Chart(ctx, {
      type:'pie',
      data:{ labels:statuses.map(s=>s.name),
        datasets:[{ data, backgroundColor:statuses.map(s=>s.color), borderColor:isDark?'#374151':'#ffffff', borderWidth:2 }]
      },
      options:{ responsive:true, plugins:{ legend:{ position:'bottom', labels:{ color:isDark?'#d1d5db':'#4b5563' }}}}
    });
  }

  function updateBarChart(labels, data) {
    const ctx = document.getElementById('activity-bar-chart')?.getContext('2d'); if (!ctx) return;
    const isDark = document.documentElement.classList.contains('dark');
    if (activityBarChart) activityBarChart.destroy();
    activityBarChart = new Chart(ctx, {
      type:'bar',
      data:{ labels, datasets:[{ label:'Tarefas Criadas', data, backgroundColor:'rgba(59,130,246,0.5)', borderColor:'rgba(59,130,246,1)', borderWidth:1 }]},
      options:{
        responsive:true,
        scales:{
          y:{ beginAtZero:true, ticks:{ color:isDark?'#d1d5db':'#4b5563', stepSize:1 }, grid:{ color:isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)'} },
          x:{ ticks:{ color:isDark?'#d1d5db':'#4b5563' }, grid:{ display:false } }
        },
        plugins:{ legend:{ display:false } }
      }
    });
  }

  function updateStatusDurationChart(data) {
    const ctx = document.getElementById('status-duration-chart')?.getContext('2d'); if (!ctx) return;
    const isDark = document.documentElement.classList.contains('dark');
    if (statusDurationChart) statusDurationChart.destroy();
    statusDurationChart = new Chart(ctx, {
      type:'bar',
      data:{ labels:statuses.map(s=>s.name),
        datasets:[{ label:'Horas Gastas', data, backgroundColor:statuses.map(s=>s.color+'80'), borderColor:statuses.map(s=>s.color), borderWidth:1 }]
      },
      options:{
        indexAxis:'y',
        responsive:true,
        scales:{
          x:{ beginAtZero:true, ticks:{ color:isDark?'#d1d5db':'#4b5563' }, grid:{ color:isDark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)'} },
          y:{ ticks:{ color:isDark?'#d1d5db':'#4b5563' }, grid:{ display:false } }
        },
        plugins:{ legend:{ display:false } }
      }
    });
  }

  function calculateStatusDurations() {
    const durations = Array(statuses.length).fill(0);
    const items = document.querySelectorAll('.task-item, .subtask-item');
    items.forEach(item=>{
      const history = JSON.parse(item.dataset.statusHistory || '[]');
      history.forEach(rec=>{
        const start = new Date(rec.startTime);
        const end = rec.endTime ? new Date(rec.endTime) : new Date();
        const idx = statuses.findIndex(s=>s.name===rec.statusName);
        if (idx>-1) durations[idx] += (end - start);
      });
    });
    // ms -> horas
    return durations.map(ms => ms / (1000*60*60));
  }

  // =========================
  // CRIAÇÃO DE ITENS
  // =========================
  function setCompletionState(item, isCompleted) {
    const btn = item.querySelector('.toggle-button');
    const icon = btn.querySelector('.fa-check');
    if (isCompleted) {
      item.classList.add('completed');
      btn.classList.add('bg-green-500','border-green-500','dark:bg-green-600','dark:border-green-600');
      icon.classList.add('opacity-100');
    } else {
      item.classList.remove('completed');
      btn.classList.remove('bg-green-500','border-green-500','dark:bg-green-600','dark:border-green-600');
      icon.classList.remove('opacity-100');
    }
  }

  function createTaskElement(taskText, description='Adicionar uma descrição...', statusIdx=0, isCompleted=false, subtasks=[], createdAt=null, statusStartTime=null, statusHistory=null) {
    const entry = document.createElement('div');
    entry.className = 'task-entry';
    const creationDate = createdAt ? new Date(createdAt) : new Date();
    const ts = creationDate.toLocaleString('pt-BR',{dateStyle:'short', timeStyle:'short'});
    entry.dataset.timestamp = creationDate.toISOString();
    const initialHistory = statusHistory || [{ statusName: statuses[statusIdx].name, startTime: creationDate.toISOString(), endTime: null }];

    entry.innerHTML = `
      <div class="task-item flex items-start bg-gray-50 dark:bg-gray-700/60 p-4 rounded-lg"
           data-status-start-time="${statusStartTime || creationDate.toISOString()}"
           data-status-history='${JSON.stringify(initialHistory)}'>
        <button class="toggle-button w-7 h-7 flex-shrink-0 border-2 border-gray-300 dark:border-gray-500 rounded-full mr-4 mt-1 flex items-center justify-center transition">
          <i class="fas fa-check text-white text-xs transition-opacity opacity-0"></i>
        </button>
        <div class="task-details flex-grow">
          <div class="flex items-center gap-3">
            <span class="task-text text-gray-700 dark:text-gray-200">${taskText}</span>
            <span class="status-badge cursor-pointer text-xs font-semibold px-2 py-1 rounded-full ${statuses[statusIdx].classes} ${statuses[statusIdx].darkClasses}" data-status-index="${statusIdx}">${statuses[statusIdx].name}</span>
          </div>
          <p class="task-description text-sm text-gray-500 dark:text-gray-400 mt-1 cursor-pointer">${description}</p>
          <form class="description-form hidden w-full mt-1">
            <input type="text" class="description-input w-full p-1.5 text-sm bg-transparent border-2 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 transition" placeholder="Digite a descrição e pressione Enter...">
          </form>
          <div class="text-xs text-gray-400 dark:text-gray-500 mt-2 flex items-center justify-between">
            <div class="flex items-center"><i class="fas fa-calendar-alt mr-1.5"></i><span class="timestamp">${ts}</span></div>
            <div class="status-timer flex items-center"><i class="fas fa-stopwatch mr-1.5"></i><span>0s</span></div>
          </div>
        </div>
        <div class="task-actions flex items-center gap-2 ml-4">
          <button class="edit-description-button text-gray-400 hover:text-green-500 dark:hover:text-green-400 transition" title="Editar descrição"><i class="fas fa-pencil-alt"></i></button>
          <button class="generate-description-btn text-gray-400 hover:text-cyan-500 dark:hover:text-cyan-400 transition ${!apiKey?'hidden':''}" title="✨ Gerar Descrição com IA"><i class="fas fa-wand-magic-sparkles"></i></button>
          <button class="add-subtask-button text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition" title="Adicionar subtarefa"><i class="fas fa-plus-circle"></i></button>
          <button class="generate-subtasks-btn text-gray-400 hover:text-purple-500 dark:hover:text-purple-400 transition ${!apiKey?'hidden':''}" title="✨ Gerar Subtarefas com IA"><i class="fas fa-sitemap"></i></button>
          <button class="delete-button text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition" title="Excluir tarefa"><i class="fas fa-trash-alt"></i></button>
        </div>
      </div>
      <div class="subtask-section pl-12 pr-4">
        <div class="subtask-list space-y-2 mt-2"></div>
        <form class="subtask-form hidden mt-2 flex items-center gap-2">
          <input type="text" placeholder="Nova subtarefa..." class="subtask-input flex-grow p-2 text-sm bg-transparent border-2 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 transition" autocomplete="off">
          <button type="submit" class="submit-subtask-button bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 px-3 py-2 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 transition"><i class="fas fa-level-down-alt fa-rotate-90"></i></button>
        </form>
      </div>
    `;

    if (isCompleted) setCompletionState(entry.querySelector('.task-item'), true);

    const subtaskList = entry.querySelector('.subtask-list');
    (subtasks||[]).forEach(sub=>{
      const el = createSubtaskElement(sub.text, entry, sub.status, sub.completed, sub.createdAt, sub.statusStartTime, sub.statusHistory);
      if (el) subtaskList.appendChild(el);
    });

    attachTaskEvents(entry);
    return entry;
  }

  function createSubtaskElement(text, parentEntry, statusName='Aberto', isCompleted=false, createdAt=null, statusStartTime=null, statusHistory=null) {
    const item = document.createElement('div');
    item.className = 'subtask-item flex items-start bg-gray-50/50 dark:bg-gray-700/30 p-2 rounded-md';
    let idx = statuses.findIndex(s=>s.name===statusName); if (idx<0) idx=0;
    const creationDate = createdAt ? new Date(createdAt) : new Date();
    const ts = creationDate.toLocaleString('pt-BR',{dateStyle:'short', timeStyle:'short'});
    const initialHistory = statusHistory || [{ statusName: statuses[idx].name, startTime: creationDate.toISOString(), endTime: null }];

    item.dataset.timestamp = creationDate.toISOString();
    item.dataset.statusStartTime = statusStartTime || creationDate.toISOString();
    item.dataset.statusHistory = JSON.stringify(initialHistory);

    item.innerHTML = `
      <button class="toggle-button w-6 h-6 flex-shrink-0 border-2 border-gray-300 dark:border-gray-500 rounded-full mr-3 mt-1 flex items-center justify-center transition">
        <i class="fas fa-check text-white text-xs transition-opacity opacity-0"></i>
      </button>
      <div class="flex-grow">
        <div class="flex items-center gap-2">
          <span class="task-text text-gray-600 dark:text-gray-300 text-sm">${text}</span>
          <span class="status-badge cursor-pointer text-xs font-semibold px-2 py-1 rounded-full ${statuses[idx].classes} ${statuses[idx].darkClasses}" data-status-index="${idx}">${statuses[idx].name}</span>
        </div>
        <div class="text-xs text-gray-400 dark:text-gray-500 mt-1 flex items-center justify-between">
          <div class="flex items-center"><i class="fas fa-calendar-alt mr-1"></i><span class="timestamp">${ts}</span></div>
          <div class="status-timer flex items-center"><i class="fas fa-stopwatch mr-1"></i><span>0s</span></div>
        </div>
      </div>
      <button class="delete-button flex-shrink-0 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition ml-2"><i class="fas fa-times"></i></button>
    `;

    if (isCompleted) setCompletionState(item, true);

    item.querySelector('.delete-button').addEventListener('click', () => {
      item.classList.add('opacity-0','scale-90');
      setTimeout(()=>{ item.remove(); syncParentStatus(parentEntry); saveTasks(); }, 300);
    });

    item.querySelector('.toggle-button').addEventListener('click', () => toggleTaskCompletion(item, parentEntry));
    item.querySelector('.status-badge').addEventListener('click', (e) => {
      const currentIndex = parseInt(e.target.dataset.statusIndex);
      changeStatus(item, (currentIndex+1)%statuses.length, parentEntry);
    });

    return item;
  }

  // =========================
  // AI (Gemini)
  // =========================
  async function callGeminiAPI(systemPrompt, userQuery, button) {
    if (!apiKey) { alert("Por favor, configure sua API Key do Gemini primeiro."); return null; }
    const icon = button.querySelector('i'); icon.classList.add('fa-spin'); button.disabled = true;
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
    const payload = {
      contents: [{ parts: [{ text: userQuery }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      tools: [{
        functionDeclarations: [{
          name: "createTask",
          description: "Cria uma nova tarefa principal com uma descrição e subtarefas.",
          parameters: {
            type: "OBJECT",
            properties: {
              taskText: { type: "STRING" },
              description: { type: "STRING" },
              subtasks: { type: "ARRAY", items: { type: "STRING" } }
            },
            required: ["taskText"]
          }
        }]
      }]
    };
    try {
      const r = await fetch(apiUrl, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
      if (!r.ok) throw new Error(`API Error: ${r.statusText}`);
      const j = await r.json();
      return j.candidates?.[0];
    } catch(e) {
      console.error("Erro na chamada da API Gemini:", e);
      return null;
    } finally {
      icon.classList.remove('fa-spin'); button.disabled = false;
    }
  }

  function handleCreateTask(args) {
    const { taskText, description, subtasks } = args || {};
    if (!taskText) return "Não foi possível criar a tarefa. O título está faltando.";
    const subObjs = (subtasks||[]).map(t=>({ text:t, status:"Aberto", completed:false, createdAt:new Date().toISOString() }));
    const newTask = createTaskElement(taskText, description, 0, false, subObjs, new Date().toISOString());
    taskList.prepend(newTask);
    saveTasks(); updateStatusSummary(); updateDashboard();
    return `Tarefa "${taskText}" criada com ${subObjs.length} subtarefas.`;
  }

  async function generateSubtasks(entry) {
    const btn = entry.querySelector('.generate-subtasks-btn');
    const title = entry.querySelector('.task-item .task-text').textContent;
    let desc = entry.querySelector('.task-item .task-description').textContent;
    if (desc === 'Adicionar uma descrição...') desc = '';
    const sys = "Você é um assistente de produtividade. Divida a tarefa em 3-5 subtarefas (português). Uma por linha, sem numeração.";
    const prompt = `Tarefa: "${title}"\nDescrição: "${desc}"`;
    const resp = await callGeminiAPI(sys, prompt, btn);
    const text = resp?.content?.parts?.[0]?.text;
    if (!text) return;
    const list = entry.querySelector('.subtask-list');
    text.split('\n').filter(s=>s.trim()).forEach(s=> list.appendChild(createSubtaskElement(s.trim(), entry)));
    syncParentStatus(entry); saveTasks();
  }

  async function generateDescription(entry) {
    const btn = entry.querySelector('.generate-description-btn');
    const title = entry.querySelector('.task-item .task-text').textContent;
    const sys = "Escreva uma descrição curta e útil (1-2 frases) para a tarefa informada. Responda apenas com a descrição.";
    const resp = await callGeminiAPI(sys, `Gere uma descrição para: "${title}"`, btn);
    const text = resp?.content?.parts?.[0]?.text;
    entry.querySelector('.task-description').textContent = (text || "Erro ao gerar descrição.").trim();
    saveTasks();
  }

  // Chat
  async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    const fullMessage = attachedFileContent ? `Contexto do arquivo:\n${attachedFileContent}\n\n---\n\nInstrução do usuário: ${msg}` : msg;
    if (!fullMessage) return;
    if (!apiKey) { alert("Por favor, configure sua API Key do Gemini para usar o chat."); return; }

    appendMessage(msg, 'user'); input.value=''; resetFileAttachment(); appendMessage("...", 'model', true);

    const systemPrompt = "Você é um assistente de produtividade. Ajude a gerenciar a lista de tarefas. Se o usuário pedir para criar uma tarefa (possivelmente a partir de um arquivo), use a função `createTask`.";
    const first = await callGeminiAPI(systemPrompt, fullMessage, document.querySelector('#chat-form button'));
    const part = first?.content?.parts?.[0];

    if (part && part.functionCall) {
      const { name, args } = part.functionCall;
      if (name === 'createTask') {
        const result = handleCreateTask(args);
        const secondPayload = {
          contents: [
            { role:"user", parts:[{ text: fullMessage }] },
            { role:"model", parts:[ part ] },
            { role:"function", parts:[{ functionResponse:{ name:"createTask", response:{ result } } }] }
          ]
        };
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
        const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(secondPayload) });
        const j = await r.json();
        const finalText = j.candidates?.[0]?.content?.parts?.[0]?.text;
        updateMessage(finalText || "Tarefa criada com sucesso!");
      }
    } else {
      updateMessage(part?.text || "Desculpe, não consegui processar seu pedido.");
    }
  }

  function appendMessage(text, role, isLoading=false) {
    const chatHistory = document.getElementById('chat-history');
    const wrap = document.createElement('div');
    const bubble = document.createElement('div');
    wrap.className = role==='user' ? 'flex justify-end' : 'flex justify-start';
    bubble.className = role==='user'
      ? 'bg-blue-500 text-white p-3 rounded-lg max-w-sm'
      : 'bg-blue-100 dark:bg-blue-900/50 text-gray-800 dark:text-gray-200 p-3 rounded-lg max-w-sm';
    if (isLoading) { bubble.id='loading-bubble'; bubble.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`; }
    else bubble.textContent = text;
    wrap.appendChild(bubble); chatHistory.appendChild(wrap); chatHistory.scrollTop = chatHistory.scrollHeight;
  }
  function updateMessage(text){ const b=document.getElementById('loading-bubble'); if(b){ b.textContent=text; b.removeAttribute('id'); } }

  function resetFileAttachment() {
    attachedFileContent = null;
    document.getElementById('chat-file-input').value = "";
    const preview = document.getElementById('file-preview-area');
    preview.classList.add('hidden'); preview.querySelector('#file-preview-name').textContent='';
  }

  // =========================
  // STATUS / HISTÓRICO / TIMERS
  // =========================
  function syncParentStatus(entry) {
    const subs = entry.querySelectorAll('.subtask-item');
    const parentItem = entry.querySelector('.task-item');
    const badge = parentItem.querySelector('.status-badge');

    if (subs.length === 0) { badge.classList.add('cursor-pointer'); updateStatusSummary(); return; }

    badge.classList.remove('cursor-pointer');
    const firstIdx = parseInt(subs[0].querySelector('.status-badge').dataset.statusIndex);
    const allSame = [...subs].every(st => parseInt(st.querySelector('.status-badge').dataset.statusIndex) === firstIdx);
    if (allSame) changeStatus(parentItem, firstIdx);
    else changeStatus(parentItem, emAndamentoIndex);
  }

  function changeStatus(item, newIndex, parentEntry=null) {
    const statusBadge = item.querySelector('.status-badge');
    const status = statuses[newIndex];

    // timer base
    item.dataset.statusStartTime = new Date().toISOString();

    // histórico (fecha o anterior e abre o novo)
    let history = JSON.parse(item.dataset.statusHistory || '[]');
    if (history.length > 0) history[history.length - 1].endTime = new Date().toISOString();
    history.push({ statusName: status.name, startTime: new Date().toISOString(), endTime: null });
    item.dataset.statusHistory = JSON.stringify(history);

    // UI do selo
    statusBadge.textContent = status.name;
    statusBadge.className = `status-badge text-xs font-semibold px-2 py-1 rounded-full ${status.classes} ${status.darkClasses} ${ (item.classList.contains('task-item')||item.classList.contains('subtask-item')) ? 'cursor-pointer':'' }`;
    statusBadge.dataset.statusIndex = newIndex;

    // estado de conclusão
    setCompletionState(item, newIndex === finalizadoIndex);

    if (item.classList.contains('subtask-item') && parentEntry) syncParentStatus(parentEntry);
    else updateStatusSummary();

    saveTasks();
    setTimeout(applyFiltersAndSearch, 0);
    setTimeout(updateDashboard, 0);
  }

  function toggleTaskCompletion(item, parentEntry=null) {
    const isMain = item.classList.contains('task-item');
    const isCompleted = item.classList.contains('completed');
    const nextIdx = !isCompleted ? finalizadoIndex : 0;
    changeStatus(item, nextIdx);
    if (isMain) {
      item.closest('.task-entry').querySelectorAll('.subtask-item')
        .forEach(st => changeStatus(st, nextIdx, item.closest('.task-entry')));
    } else {
      changeStatus(item, nextIdx, parentEntry);
    }
  }

  function formatDuration(ms){
    if (ms<0) ms=0;
    let s=Math.floor(ms/1000), m=Math.floor(s/60), h=Math.floor(m/60), d=Math.floor(h/24);
    s%=60; m%=60; h%=24;
    let out=""; if(d) out+=`${d}d `; if(h) out+=`${h}h `; if(m) out+=`${m}m `; out+=`${s}s`; return out.trim();
  }

  function startTimers() {
    setInterval(()=>{
      document.querySelectorAll('.task-item, .subtask-item').forEach(it=>{
        const span = it.querySelector('.status-timer span'); if (!span) return;
        const start = new Date(it.dataset.statusStartTime);
        span.textContent = formatDuration(new Date() - start);
      });
    }, 1000);
  }

  function saveTasks() {
    const data = [];
    document.querySelectorAll('.task-entry').forEach(entry=>{
      const item = entry.querySelector('.task-item');
      const text = item.querySelector('.task-text').textContent;
      let description = item.querySelector('.task-description').textContent; if (description==='Adicionar uma descrição...') description = '';
      const idx = parseInt(item.querySelector('.status-badge').dataset.statusIndex);
      const createdAt = new Date(entry.dataset.timestamp).toISOString();
      const statusStartTime = new Date(item.dataset.statusStartTime).toISOString();
      const statusHistory = JSON.parse(item.dataset.statusHistory || '[]');
      const completed = item.classList.contains('completed');

      const subtasks = [];
      entry.querySelectorAll('.subtask-item').forEach(st=>{
        subtasks.push({
          text: st.querySelector('.task-text').textContent,
          status: statuses[parseInt(st.querySelector('.status-badge').dataset.statusIndex)].name,
          completed: st.classList.contains('completed'),
          createdAt: new Date(st.dataset.timestamp).toISOString(),
          statusStartTime: new Date(st.dataset.statusStartTime).toISOString(),
          statusHistory: JSON.parse(st.dataset.statusHistory || '[]')
        });
      });

      data.push({
        text, description, status: statuses[idx].name, completed,
        createdAt, statusStartTime, statusHistory, subtasks
      });
    });
    localStorage.setItem('tasks-data', JSON.stringify(data));
  }

  function loadTasks() {
    const saved = localStorage.getItem('tasks-data');
    if (saved) {
      JSON.parse(saved).forEach(t=>{
        const idx = statuses.findIndex(s=>s.name===t.status); 
        const el = createTaskElement(
          t.text,
          t.description || 'Adicionar uma descrição...',
          idx>=0?idx:0,
          t.completed,
          t.subtasks,
          t.createdAt,
          t.statusStartTime,
          t.statusHistory
        );
        taskList.appendChild(el);
      });
    } else {
      const t1 = createTaskElement("Reunião de equipe","Discutir os resultados do último trimestre.", emAndamentoIndex, false,
        [{text:"Preparar apresentação", status:"Aberto", completed:false, createdAt:new Date().toISOString()}],
        new Date().toISOString());
      if (t1) taskList.appendChild(t1);
      const t2 = createTaskElement("Enviar relatório mensal","Adicionar uma descrição...", finalizadoIndex, true, [], new Date(Date.now()-2*24*60*60*1000).toISOString());
      if (t2) taskList.appendChild(t2);
    }
  }

  // =========================
  // FILTROS / TEMA / EVENTOS
  // =========================
  function applyFiltersAndSearch() {
    const term = searchInput.value.toLowerCase();
    document.querySelectorAll('.task-entry').forEach(entry=>{
      const text = entry.querySelector('.task-item .task-text').textContent.toLowerCase();
      const desc = entry.querySelector('.task-item .task-description').textContent.toLowerCase();
      const status = entry.querySelector('.task-item .status-badge').textContent;
      const searchMatch = text.includes(term) || desc.includes(term);
      const filterMatch = activeFilter==='Todos' || status===activeFilter;
      entry.style.display = (searchMatch && filterMatch) ? '' : 'none';
    });
  }

  function initializeFilters() {
    let html = `<button data-filter="Todos" class="filter-btn active px-3 py-1 text-sm font-medium rounded-md bg-blue-600 text-white dark:bg-blue-600 transition">Todos</button>`;
    statuses.forEach(s => html += `<button data-filter="${s.name}" class="filter-btn px-3 py-1 text-sm font-medium rounded-md bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 transition">${s.name}</button>`);
    filterButtonsContainer.innerHTML = html;
  }

  function applyTheme() {
    const isDark = localStorage.getItem('color-theme') === 'dark' || (!('color-theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
    document.getElementById('theme-toggle-light-icon').classList.toggle('hidden', !isDark);
    document.getElementById('theme-toggle-dark-icon').classList.toggle('hidden', isDark);
    if (statusPieChart || activityBarChart) setTimeout(updateDashboard, 50);
  }

  function updateAIVisibility() {
    document.querySelectorAll('.generate-description-btn, .generate-subtasks-btn')
      .forEach(btn => apiKey ? btn.classList.remove('hidden') : btn.classList.add('hidden'));
  }

  // Eventos principais
  taskForm.addEventListener('submit', (e)=>{
    e.preventDefault();
    const text = taskInput.value.trim(); if (!text) return;
    const el = createTaskElement(text);
    taskList.prepend(el);
    taskInput.value=''; taskInput.focus();
    updateStatusSummary(); applyFiltersAndSearch(); saveTasks();
  });

  document.getElementById('theme-toggle').addEventListener('click', ()=>{
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('color-theme', isDark ? 'dark' : 'light');
    applyTheme();
  });

  document.getElementById('download-btn').addEventListener('click', ()=>{
    const data = localStorage.getItem('tasks-data');
    if (!data) return alert("Nenhuma tarefa para baixar.");
    const blob = new Blob([data], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download='tarefas.json';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  });

  searchInput.addEventListener('input', applyFiltersAndSearch);

  filterButtonsContainer.addEventListener('click', (e)=>{
    const btn = e.target.closest('.filter-btn'); if (!btn) return;
    const current = filterButtonsContainer.querySelector('.active');
    if (current) {
      current.classList.remove('active','bg-blue-600','text-white','dark:bg-blue-600');
      current.classList.add('bg-gray-200','dark:bg-gray-700','text-gray-700','dark:text-gray-200');
    }
    btn.classList.add('active','bg-blue-600','text-white','dark:bg-blue-600');
    btn.classList.remove('bg-gray-200','dark:bg-gray-700','text-gray-700','dark:text-gray-200');
    activeFilter = btn.dataset.filter;
    applyFiltersAndSearch();
  });

  const apiKeyBtn = document.getElementById('api-key-btn');
  const apiKeyModal = document.getElementById('api-key-modal');
  const closeModalBtn = document.getElementById('close-modal-btn');
  const saveApiKeyBtn = document.getElementById('save-api-key-btn');
  const apiKeyInput = document.getElementById('api-key-input');

  apiKeyBtn.addEventListener('click', ()=>{ apiKeyInput.value = apiKey; apiKeyModal.classList.remove('hidden'); });
  closeModalBtn.addEventListener('click', ()=> apiKeyModal.classList.add('hidden'));
  apiKeyModal.addEventListener('click', (e)=>{ if (e.target===apiKeyModal) apiKeyModal.classList.add('hidden'); });
  saveApiKeyBtn.addEventListener('click', ()=>{
    const newKey = apiKeyInput.value.trim();
    localStorage.setItem('gemini-api-key', newKey);
    apiKey = newKey; updateAIVisibility(); apiKeyModal.classList.add('hidden');
  });

  const tabs = document.getElementById('tabs');
  const tasksView = document.getElementById('tasks-view');
  const analysisView = document.getElementById('analysis-view');
  const chatView = document.getElementById('chat-view');

  tabs.addEventListener('click', (e)=>{
    const t = e.target.closest('.tab-btn'); if (!t) return;
    tabs.querySelectorAll('.tab-btn').forEach(btn=>btn.classList.remove('active'));
    t.classList.add('active');
    tasksView.classList.add('hidden'); analysisView.classList.add('hidden'); chatView.classList.add('hidden');
    const tab = t.dataset.tab;
    if (tab==='analysis'){ analysisView.classList.remove('hidden'); updateDashboard(); }
    else if (tab==='chat'){ chatView.classList.remove('hidden'); }
    else { tasksView.classList.remove('hidden'); }
  });

  document.getElementById('chat-form').addEventListener('submit', (e)=>{ e.preventDefault(); sendChatMessage(); });

  const attachFileBtn = document.getElementById('attach-file-btn');
  const chatFileInput = document.getElementById('chat-file-input');
  const filePreviewArea = document.getElementById('file-preview-area');
  const filePreviewName = document.getElementById('file-preview-name');
  const removeFileBtn = document.getElementById('remove-file-btn');

  attachFileBtn.addEventListener('click', ()=> chatFileInput.click());
  chatFileInput.addEventListener('change', (e)=>{
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev)=>{
        attachedFileContent = ev.target.result;
        filePreviewName.textContent = file.name;
        filePreviewArea.classList.remove('hidden'); filePreviewArea.classList.add('flex');
      };
      reader.readAsText(file);
    }
  });
  removeFileBtn.addEventListener('click', resetFileAttachment);

  // Inicialização
  applyTheme();
  initializeStatusSummary();
  initializeFilters();
  loadTasks();
  document.querySelectorAll('.task-entry').forEach(entry=>{ attachTaskEvents(entry); syncParentStatus(entry); });
  updateStatusSummary();
  applyFiltersAndSearch();
  updateAIVisibility();
  startTimers();

  // ========= Eventos dos itens dinâmicos =========
  function attachTaskEvents(entry) {
    const taskItem = entry.querySelector('.task-item');
    const deleteButton = entry.querySelector('.delete-button');
    const toggleButton = entry.querySelector('.toggle-button');
    const addSubtaskButton = entry.querySelector('.add-subtask-button');
    const subtaskForm = entry.querySelector('.subtask-form');
    const subtaskInput = entry.querySelector('.subtask-input');
    const subtaskList = entry.querySelector('.subtask-list');

    const editDescriptionButton = entry.querySelector('.edit-description-button');
    const taskDescription = entry.querySelector('.task-description');
    const descriptionForm = entry.querySelector('.description-form');
    const descriptionInput = entry.querySelector('.description-input');

    const statusBadge = entry.querySelector('.status-badge');
    const generateSubtasksBtn = entry.querySelector('.generate-subtasks-btn');
    const generateDescriptionBtn = entry.querySelector('.generate-description-btn');

    if (generateSubtasksBtn) generateSubtasksBtn.addEventListener('click', ()=> generateSubtasks(entry));
    if (generateDescriptionBtn) generateDescriptionBtn.addEventListener('click', ()=> generateDescription(entry));

    deleteButton.addEventListener('click', ()=>{
      entry.classList.add('opacity-0','scale-90');
      setTimeout(()=>{ entry.remove(); updateStatusSummary(); updateDashboard(); saveTasks(); }, 300);
    });

    toggleButton.addEventListener('click', ()=> toggleTaskCompletion(taskItem));

    statusBadge.addEventListener('click', ()=>{
      if (subtaskList.children.length > 0) return;
      const current = parseInt(statusBadge.dataset.statusIndex);
      changeStatus(taskItem, (current+1)%statuses.length);
    });

    function toggleDescEdit() {
      taskDescription.classList.toggle('hidden');
      descriptionForm.classList.toggle('hidden');
      if (!descriptionForm.classList.contains('hidden')) {
        descriptionInput.value = taskDescription.textContent === 'Adicionar uma descrição...' ? '' : taskDescription.textContent;
        descriptionInput.focus();
      }
    }

    editDescriptionButton.addEventListener('click', toggleDescEdit);
    taskDescription.addEventListener('click', toggleDescEdit);

    descriptionForm.addEventListener('submit', (e)=>{
      e.preventDefault();
      const val = descriptionInput.value.trim();
      taskDescription.textContent = val === '' ? 'Adicionar uma descrição...' : val;
      toggleDescEdit(); saveTasks();
    });

    addSubtaskButton.addEventListener('click', ()=>{ subtaskForm.classList.toggle('hidden'); subtaskInput.focus(); });

    subtaskForm.addEventListener('submit', (e)=>{
      e.preventDefault();
      const text = subtaskInput.value.trim();
      if (text) {
        const st = createSubtaskElement(text, entry);
        subtaskList.appendChild(st);
        subtaskInput.value=''; syncParentStatus(entry); saveTasks();
      }
    });
  }

});
