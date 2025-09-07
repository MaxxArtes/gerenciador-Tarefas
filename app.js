// ===================================================================
// SCRIPT PRINCIPAL
// ===================================================================
document.addEventListener('DOMContentLoaded', () => {
  // ===================================================================
  // VARIÁVEIS GLOBAIS E CONSTANTES
  // ===================================================================
  const taskForm = document.getElementById('task-form');
  const taskInput = document.getElementById('task-input');
  const taskList = document.getElementById('task-list');
  const searchInput = document.getElementById('search-input');
  const filterButtonsContainer = document.getElementById('filter-buttons');

  let apiKey = localStorage.getItem('gemini-api-key') || "";
  let activeFilter = 'Todos';
  let attachedFileContent = null;
  let projectsData = {};
  let activeProject = '';

  const statuses = [
    { name: 'Aberto',        classes: 'bg-blue-100 text-blue-800',      darkClasses: 'dark:bg-blue-900/50 dark:text-blue-300',    color: '#3b82f6' },
    { name: 'Em Andamento',  classes: 'bg-yellow-100 text-yellow-800',  darkClasses: 'dark:bg-yellow-900/50 dark:text-yellow-300', color: '#f59e0b' },
    { name: 'Desenvolvido',  classes: 'bg-purple-100 text-purple-800',  darkClasses: 'dark:bg-purple-900/50 dark:text-purple-300', color: '#8b5cf6' },
    { name: 'Teste',         classes: 'bg-indigo-100 text-indigo-800',  darkClasses: 'dark:bg-indigo-900/50 dark:text-indigo-300', color: '#6366f1' },
    { name: 'Finalizado',    classes: 'bg-green-100 text-green-800',    darkClasses: 'dark:bg-green-900/50 dark:text-green-300',  color: '#22c55e' }
  ];
  const finalizadoIndex = 4;
  const emAndamentoIndex = 1;

  let statusPieChart = null;
  let activityBarChart = null;
  let statusDurationChart = null;

  // ===================================================================
  // FUNÇÕES DE DASHBOARD E RESUMOS
  // ===================================================================
  function initializeStatusSummary() {
    const summaryContainer = document.getElementById('status-summary');
    if (!summaryContainer) return;
    summaryContainer.innerHTML = statuses.map((status, index) => `
      <div>
        <div class="flex justify-between items-center mb-1">
          <span class="text-sm font-medium text-gray-600 dark:text-gray-300">${status.name}</span>
          <span id="status-percent-${index}" class="text-sm font-medium text-gray-500 dark:text-gray-400">0 (0%)</span>
        </div>
        <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
          <div id="status-bar-${index}" class="h-2.5 rounded-full transition-all duration-500" style="width: 0%; background-color: ${status.color}"></div>
        </div>
      </div>
    `).join('');
  }

  function updateStatusSummary() {
    const allTasks = taskList.querySelectorAll('.task-item');
    const totalTasks = allTasks.length;
    const counts = Array(statuses.length).fill(0);

    allTasks.forEach(task => {
      const statusBadge = task.querySelector('.status-badge');
      if (statusBadge) {
        const statusIndex = parseInt(statusBadge.dataset.statusIndex);
        counts[statusIndex]++;
      }
    });

    counts.forEach((count, index) => {
      const percentage = totalTasks > 0 ? ((count / totalTasks) * 100).toFixed(0) : 0;
      const percentEl = document.getElementById(`status-percent-${index}`);
      const barEl = document.getElementById(`status-bar-${index}`);
      if (percentEl && barEl) {
        percentEl.textContent = `${count} (${percentage}%)`;
        barEl.style.width = `${percentage}%`;
      }
    });
  }

  function calculateStatusDurations() {
    const durations = Array(statuses.length).fill(0);
    const allItems = document.querySelectorAll('.task-item, .subtask-item');

    allItems.forEach(item => {
      const history = safeParseJSON(item.dataset.statusHistory || '[]', []);
      history.forEach(record => {
        const startTime = new Date(record.startTime);
        const endTime = record.endTime ? new Date(record.endTime) : new Date();
        const duration = endTime - startTime;
        const statusIndex = statuses.findIndex(s => s.name === record.statusName);
        if (statusIndex > -1) durations[statusIndex] += duration;
      });
    });
    return durations; // ms
  }

  function updatePieChart(data) {
    const ctx = document.getElementById('status-pie-chart').getContext('2d');
    const isDark = document.documentElement.classList.contains('dark');
    if (statusPieChart) statusPieChart.destroy();

    statusPieChart = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: statuses.map(s => s.name),
        datasets: [{
          label: 'Tarefas por Status',
          data,
          backgroundColor: statuses.map(s => s.color),
          borderColor: isDark ? '#374151' : '#ffffff',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: isDark ? '#d1d5db' : '#4b5563' }
          }
        }
      }
    });
  }

  function updateBarChart(labels, data) {
    const ctx = document.getElementById('activity-bar-chart').getContext('2d');
    const isDark = document.documentElement.classList.contains('dark');
    if (activityBarChart) activityBarChart.destroy();

    activityBarChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Tarefas Criadas',
          data,
          backgroundColor: 'rgba(59, 130, 246, 0.5)',
          borderColor: 'rgba(59, 130, 246, 1)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true,
            ticks: { color: isDark ? '#d1d5db' : '#4b5563', stepSize: 1 },
            grid: { color: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }
          },
          x: {
            ticks: { color: isDark ? '#d1d5db' : '#4b5563' },
            grid: { display: false }
          }
        },
        plugins: { legend: { display: false } }
      }
    });
  }

  function updateStatusDurationChart(data) {
    const ctx = document.getElementById('status-duration-chart').getContext('2d');
    const isDark = document.documentElement.classList.contains('dark');
    if (statusDurationChart) statusDurationChart.destroy();

    statusDurationChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: statuses.map(s => s.name),
        datasets: [{
          label: 'Tempo Gasto',
          data: data.map(d => d / (1000 * 60 * 60)), // horas
          backgroundColor: statuses.map(s => s.color + '80'),
          borderColor: statuses.map(s => s.color),
          borderWidth: 1
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        scales: {
          x: {
            beginAtZero: true,
            ticks: { color: isDark ? '#d1d5db' : '#4b5563' },
            title: { display: true, text: 'Horas', color: isDark ? '#d1d5db' : '#4b5563' },
            grid: { color: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }
          },
          y: {
            ticks: { color: isDark ? '#d1d5db' : '#4b5563' },
            grid: { display: false }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                let label = ctx.dataset.label ? `${ctx.dataset.label}: ` : '';
                if (ctx.parsed.x != null) label += formatDuration(data[ctx.dataIndex]);
                return label;
              }
            }
          }
        }
      }
    });
  }

  function updateDashboard() {
    const allEntries = document.querySelectorAll('.task-entry');
    const total = allEntries.length;
    const completed = document.querySelectorAll('.task-item.completed').length;

    document.getElementById('kpi-total').textContent = total;
    document.getElementById('kpi-completed').textContent = completed;
    document.getElementById('kpi-pending').textContent = total - completed;

    const statusCounts = Array(statuses.length).fill(0);
    allEntries.forEach(entry => {
      const idx = parseInt(entry.querySelector('.task-item .status-badge').dataset.statusIndex);
      statusCounts[idx]++;
    });
    updatePieChart(statusCounts);

    // últimos 7 dias
    const labels = [];
    const activityCounts = Array(7).fill(0);
    const today = new Date(); today.setHours(0,0,0,0);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      labels.push(d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }));
    }
    allEntries.forEach(entry => {
      const created = new Date(entry.dataset.timestamp);
      created.setHours(0,0,0,0);
      const diff = Math.floor((today - created) / (1000 * 60 * 60 * 24));
      if (diff >= 0 && diff < 7) activityCounts[6 - diff]++;
    });
    updateBarChart(labels, activityCounts);

    updateStatusDurationChart(calculateStatusDurations());
  }

  // ===================================================================
  // CRIAÇÃO DE TAREFAS/SUBTAREFAS E EVENTOS
  // ===================================================================
  function setCompletionState(item, isCompleted) {
    const toggleButton = item.querySelector('.toggle-button');
    const checkIcon = toggleButton.querySelector('.fa-check');
    if (isCompleted) {
      item.classList.add('completed');
      toggleButton.classList.add('bg-green-500','border-green-500','dark:bg-green-600','dark:border-green-600');
      checkIcon.classList.add('opacity-100');
    } else {
      item.classList.remove('completed');
      toggleButton.classList.remove('bg-green-500','border-green-500','dark:bg-green-600','dark:border-green-600');
      checkIcon.classList.remove('opacity-100');
    }
  }

  function changeStatus(item, newIndex, parentTaskEntry = null) {
    const statusBadge = item.querySelector('.status-badge');
    const status = statuses[newIndex];

    item.dataset.statusStartTime = new Date().toISOString();

    let history = safeParseJSON(item.dataset.statusHistory || '[]', []);
    if (history.length > 0) history[history.length - 1].endTime = new Date().toISOString();
    history.push({ statusName: status.name, startTime: new Date().toISOString(), endTime: null });
    item.dataset.statusHistory = JSON.stringify(history);

    statusBadge.textContent = status.name;
    statusBadge.className = `status-badge text-xs font-semibold px-2 py-1 rounded-full ${status.classes} ${status.darkClasses} cursor-pointer`;
    statusBadge.dataset.statusIndex = newIndex;

    setCompletionState(item, newIndex === finalizadoIndex);

    if (item.classList.contains('subtask-item') && parentTaskEntry) {
      syncParentStatus(parentTaskEntry);
    } else {
      updateStatusSummary();
    }

    saveProjectData();
    setTimeout(applyFiltersAndSearch, 0);
    setTimeout(updateDashboard, 0);
  }

  function toggleTaskCompletion(item, parentTaskEntry = null) {
    const isMainTask = item.classList.contains('task-item');
    const isCompleted = item.classList.contains('completed');
    const newIndex = !isCompleted ? finalizadoIndex : 0;

    if (isMainTask) {
      changeStatus(item, newIndex);
      const subtasks = item.closest('.task-entry').querySelectorAll('.subtask-item');
      subtasks.forEach(st => changeStatus(st, newIndex, item.closest('.task-entry')));
    } else {
      changeStatus(item, newIndex, parentTaskEntry);
    }
  }

  function syncParentStatus(taskEntry) {
    const subtasks = taskEntry.querySelectorAll('.subtask-item');
    const parentTaskItem = taskEntry.querySelector('.task-item');
    const parentStatusBadge = parentTaskItem.querySelector('.status-badge');

    if (subtasks.length === 0) {
      parentStatusBadge.classList.add('cursor-pointer');
      updateStatusSummary();
      return;
    }

    parentStatusBadge.classList.remove('cursor-pointer');
    const first = parseInt(subtasks[0].querySelector('.status-badge').dataset.statusIndex);
    const allSame = [...subtasks].every(st => parseInt(st.querySelector('.status-badge').dataset.statusIndex) === first);
    changeStatus(parentTaskItem, allSame ? first : emAndamentoIndex);
  }

  function createSubtaskElement(subtaskText, parentTaskEntry, statusName = 'Aberto', isCompleted = false, createdAt = null, statusStartTime = null, statusHistory = null) {
    const subtaskItem = el('div', 'subtask-item flex items-start bg-gray-50/50 dark:bg-gray-700/30 p-2 rounded-md');
    let statusIdx = statuses.findIndex(s => s.name === statusName);
    if (statusIdx < 0) statusIdx = 0;

    const creationDate = createdAt ? new Date(createdAt) : new Date();
    const timestamp = creationDate.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    const initialHistory = statusHistory || [{ statusName: statuses[statusIdx].name, startTime: creationDate.toISOString(), endTime: null }];

    subtaskItem.dataset.timestamp = creationDate.toISOString();
    subtaskItem.dataset.statusStartTime = statusStartTime || creationDate.toISOString();
    subtaskItem.dataset.statusHistory = JSON.stringify(initialHistory);

    subtaskItem.innerHTML = `
      <button class="toggle-button w-6 h-6 flex-shrink-0 border-2 border-gray-300 dark:border-gray-500 rounded-full mr-3 mt-1 flex items-center justify-center transition">
        <i class="fas fa-check text-white text-xs transition-opacity opacity-0"></i>
      </button>
      <div class="flex-grow">
        <div class="flex items-center gap-2">
          <span class="task-text text-gray-600 dark:text-gray-300 text-sm">${subtaskText}</span>
          <span class="status-badge cursor-pointer text-xs font-semibold px-2 py-1 rounded-full ${statuses[statusIdx].classes} ${statuses[statusIdx].darkClasses}" data-status-index="${statusIdx}">${statuses[statusIdx].name}</span>
        </div>
        <div class="text-xs text-gray-400 dark:text-gray-500 mt-1 flex items-center justify-between">
          <div class="flex items-center">
            <i class="fas fa-calendar-alt mr-1"></i>
            <span class="timestamp">${timestamp}</span>
          </div>
          <div class="status-timer flex items-center">
            <i class="fas fa-stopwatch mr-1"></i>
            <span>0s</span>
          </div>
        </div>
      </div>
      <button class="delete-button flex-shrink-0 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition ml-2"><i class="fas fa-times"></i></button>
    `;

    if (isCompleted) setCompletionState(subtaskItem, true);

    subtaskItem.querySelector('.delete-button').addEventListener('click', () => {
      subtaskItem.classList.add('opacity-0', 'scale-90');
      setTimeout(() => {
        subtaskItem.remove();
        syncParentStatus(parentTaskEntry);
        saveProjectData(); // corrigido (antes havia saveTasks())
      }, 300);
    });

    subtaskItem.querySelector('.toggle-button').addEventListener('click', () => {
      toggleTaskCompletion(subtaskItem, parentTaskEntry);
    });

    subtaskItem.querySelector('.status-badge').addEventListener('click', (e) => {
      const currentIndex = parseInt(e.target.dataset.statusIndex);
      const nextIndex = (currentIndex + 1) % statuses.length;
      changeStatus(subtaskItem, nextIndex, parentTaskEntry);
    });

    return subtaskItem;
  }

  function createTaskElement(taskText, description = 'Adicionar uma descrição...', statusIdx = 0, isCompleted = false, subtasks = [], createdAt = null, statusStartTime = null, statusHistory = null) {
    const taskEntry = el('div', 'task-entry');
    const creationDate = createdAt ? new Date(createdAt) : new Date();
    const timestamp = creationDate.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

    taskEntry.dataset.timestamp = creationDate.toISOString();
    const initialHistory = statusHistory || [{ statusName: statuses[statusIdx].name, startTime: creationDate.toISOString(), endTime: null }];

    taskEntry.innerHTML = `
      <div class="task-item flex items-start bg-gray-50 dark:bg-gray-700/60 p-4 rounded-lg" data-status-start-time="${statusStartTime || creationDate.toISOString()}" data-status-history='${JSON.stringify(initialHistory)}'>
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
            <div class="flex items-center">
              <i class="fas fa-calendar-alt mr-1.5"></i>
              <span class="timestamp">${timestamp}</span>
            </div>
            <div class="status-timer flex items-center">
              <i class="fas fa-stopwatch mr-1.5"></i>
              <span>0s</span>
            </div>
          </div>
        </div>
        <div class="task-actions flex items-center gap-2 ml-4">
          <button class="edit-description-button text-gray-400 hover:text-green-500 dark:hover:text-green-400 transition" title="Editar descrição"><i class="fas fa-pencil-alt"></i></button>
          <button class="generate-description-btn text-gray-400 hover:text-cyan-500 dark:hover:text-cyan-400 transition ${!apiKey ? 'hidden' : ''}" title="✨ Gerar Descrição com IA"><i class="fas fa-wand-magic-sparkles"></i></button>
          <button class="add-subtask-button text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition" title="Adicionar subtarefa"><i class="fas fa-plus-circle"></i></button>
          <button class="generate-subtasks-btn text-gray-400 hover:text-purple-500 dark:hover:text-purple-400 transition ${!apiKey ? 'hidden' : ''}" title="✨ Gerar Subtarefas com IA"><i class="fas fa-sitemap"></i></button>
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

    if (isCompleted) setCompletionState(taskEntry.querySelector('.task-item'), true);

    const subtaskList = taskEntry.querySelector('.subtask-list');
    subtasks.forEach(sub => {
      const subEl = createSubtaskElement(sub.text, taskEntry, sub.status, sub.completed, sub.createdAt, sub.statusStartTime, sub.statusHistory);
      if (subEl) subtaskList.appendChild(subEl);
    });

    attachTaskEvents(taskEntry);
    return taskEntry;
  }

  function attachTaskEvents(taskEntry) {
    const taskItem = taskEntry.querySelector('.task-item');
    const deleteButton = taskEntry.querySelector('.delete-button');
    const toggleButton = taskEntry.querySelector('.toggle-button');
    const addSubtaskButton = taskEntry.querySelector('.add-subtask-button');
    const subtaskForm = taskEntry.querySelector('.subtask-form');
    const subtaskInput = taskEntry.querySelector('.subtask-input');
    const subtaskList = taskEntry.querySelector('.subtask-list');

    const editDescriptionButton = taskEntry.querySelector('.edit-description-button');
    const taskDescription = taskEntry.querySelector('.task-description');
    const descriptionForm = taskEntry.querySelector('.description-form');
    const descriptionInput = taskEntry.querySelector('.description-input');

    const statusBadge = taskEntry.querySelector('.status-badge');
    const generateSubtasksBtn = taskEntry.querySelector('.generate-subtasks-btn');
    const generateDescriptionBtn = taskEntry.querySelector('.generate-description-btn');

    if (generateSubtasksBtn) {
      generateSubtasksBtn.addEventListener('click', () => generateSubtasks(taskEntry));
    }
    if (generateDescriptionBtn) {
      generateDescriptionBtn.addEventListener('click', () => generateDescription(taskEntry));
    }

    deleteButton.addEventListener('click', () => {
      taskEntry.classList.add('opacity-0', 'scale-90');
      setTimeout(() => {
        taskEntry.remove();
        updateStatusSummary();
        updateDashboard();
        saveProjectData();
      }, 300);
    });

    toggleButton.addEventListener('click', () => {
      toggleTaskCompletion(taskItem);
    });

    statusBadge.addEventListener('click', () => {
      if (subtaskList.children.length > 0) return;
      const current = parseInt(statusBadge.dataset.statusIndex);
      const next = (current + 1) % statuses.length;
      changeStatus(taskItem, next);
    });

    function handleDescriptionEdit() {
      taskDescription.classList.toggle('hidden');
      descriptionForm.classList.toggle('hidden');
      if (!descriptionForm.classList.contains('hidden')) {
        descriptionInput.value = taskDescription.textContent === 'Adicionar uma descrição...' ? '' : taskDescription.textContent;
        descriptionInput.focus();
      }
    }

    editDescriptionButton.addEventListener('click', handleDescriptionEdit);
    taskDescription.addEventListener('click', handleDescriptionEdit);

    descriptionForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const newDescription = descriptionInput.value.trim();
      taskDescription.textContent = newDescription === '' ? 'Adicionar uma descrição...' : newDescription;
      handleDescriptionEdit();
      saveProjectData();
    });

    addSubtaskButton.addEventListener('click', () => {
      subtaskForm.classList.toggle('hidden');
      subtaskInput.focus();
    });

    subtaskForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = subtaskInput.value.trim();
      if (!text) return;
      const newSub = createSubtaskElement(text, taskEntry);
      subtaskList.appendChild(newSub);
      subtaskInput.value = '';
      syncParentStatus(taskEntry);
      saveProjectData();
    });
  }

  // ===================================================================
  // FILTROS, BUSCA, TEMA e IA
  // ===================================================================
  function applyFiltersAndSearch() {
    const searchTerm = searchInput.value.toLowerCase();
    document.querySelectorAll('.task-entry').forEach(taskEntry => {
      const taskText = taskEntry.querySelector('.task-item .task-text').textContent.toLowerCase();
      const taskDesc = taskEntry.querySelector('.task-item .task-description').textContent.toLowerCase();
      const taskStatus = taskEntry.querySelector('.task-item .status-badge').textContent;

      const searchMatch = taskText.includes(searchTerm) || taskDesc.includes(searchTerm);
      const filterMatch = activeFilter === 'Todos' || taskStatus === activeFilter;
      taskEntry.style.display = (searchMatch && filterMatch) ? '' : 'none';
    });
  }

  function initializeFilters() {
    let html = `<button data-filter="Todos" class="filter-btn active px-3 py-1 text-sm font-medium rounded-md bg-blue-600 text-white dark:bg-blue-600 transition">Todos</button>`;
    statuses.forEach(s => {
      html += `<button data-filter="${s.name}" class="filter-btn px-3 py-1 text-sm font-medium rounded-md bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 transition">${s.name}</button>`;
    });
    filterButtonsContainer.innerHTML = html;
  }

  function applyTheme() {
    const isDark = localStorage.getItem('color-theme') === 'dark' ||
      (!('color-theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
    syncThemeIcons();
    if (statusPieChart || activityBarChart) setTimeout(updateDashboard, 50);
  }

  function updateAIVisibility() {
    const aiButtons = document.querySelectorAll('.generate-description-btn, .generate-subtasks-btn');
    aiButtons.forEach(btn => apiKey ? btn.classList.remove('hidden') : btn.classList.add('hidden'));
  }

  async function callGeminiAPI(systemPrompt, userQuery, button) {
    if (!apiKey) {
      alert("Por favor, configure sua API Key do Gemini primeiro.");
      return null;
    }

    const icon = button.querySelector('i');
    icon.classList.add('fa-spin');
    button.disabled = true;

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
              taskText: { type: "STRING", description: "Título da tarefa" },
              description: { type: "STRING", description: "Descrição detalhada" },
              subtasks: { type: "ARRAY", description: "Lista de subtarefas", items: { type: "STRING" } }
            },
            required: ["taskText"]
          }
        }]
      }]
    };

    try {
      const res = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
      const result = await res.json();
      return result.candidates?.[0];
    } catch (err) {
      console.error("Erro na chamada da API Gemini:", err);
      return null;
    } finally {
      icon.classList.remove('fa-spin');
      button.disabled = false;
    }
  }

  function handleCreateTask(args) {
    const { taskText, description, subtasks } = args || {};
    if (!taskText) return "Não foi possível criar a tarefa. O título está faltando.";

    const subObjs = (subtasks || []).map(t => ({ text: t, status: "Aberto", completed: false, createdAt: new Date().toISOString() }));
    const newTask = createTaskElement(taskText, description || 'Adicionar uma descrição...', 0, false, subObjs, new Date().toISOString());
    taskList.prepend(newTask);
    saveProjectData();
    updateStatusSummary();
    updateDashboard();
    return `Tarefa "${taskText}" criada no projeto ${activeProject} com ${subObjs.length} subtarefas.`;
  }

  function appendMessage(text, role, isLoading = false) {
    const chatHistory = document.getElementById('chat-history');
    const wrapper = el('div', role === 'user' ? 'flex justify-end' : 'flex justify-start');
    const bubble = el('div', role === 'user'
      ? 'bg-blue-500 text-white p-3 rounded-lg max-w-sm'
      : 'bg-blue-100 dark:bg-blue-900/50 text-gray-800 dark:text-gray-200 p-3 rounded-lg max-w-sm'
    );

    if (isLoading) {
      bubble.id = 'loading-bubble';
      bubble.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;
    } else {
      bubble.textContent = text;
    }

    wrapper.appendChild(bubble);
    chatHistory.appendChild(wrapper);
    chatHistory.scrollTop = chatHistory.scrollHeight;
  }

  function updateMessage(text) {
    const loading = document.getElementById('loading-bubble');
    if (loading) {
      loading.textContent = text;
      loading.removeAttribute('id');
    }
  }

  async function sendChatMessage() {
    const chatInput = document.getElementById('chat-input');
    const userMessage = chatInput.value.trim();
    const fullMessage = attachedFileContent
      ? `Contexto do arquivo:\n${attachedFileContent}\n\n---\n\nInstrução do usuário: ${userMessage}`
      : userMessage;

    if (!fullMessage) return;
    if (!apiKey) {
      alert("Por favor, configure sua API Key do Gemini para usar o chat.");
      return;
    }

    appendMessage(userMessage, 'user');
    chatInput.value = '';
    resetFileAttachment();
    appendMessage("...", 'model', true);

    const systemPrompt = "Você é um assistente de produtividade para listas de tarefas. Se o usuário pedir para criar uma tarefa, use a função createTask; caso contrário, responda de forma útil.";
    const first = await callGeminiAPI(systemPrompt, fullMessage, document.querySelector('#chat-form button'));
    const part = first?.content?.parts?.[0];

    if (part && part.functionCall) {
      const { name, args } = part.functionCall;
      if (name === 'createTask') {
        const resultText = handleCreateTask(args);
        // segunda chamada para fechar o ciclo de tool-usage (opcional)
        updateMessage(resultText || "Tarefa criada com sucesso!");
      } else {
        updateMessage("Função desconhecida.");
      }
    } else {
      updateMessage(part?.text || "Desculpe, não consegui processar seu pedido.");
    }
  }

  function resetFileAttachment() {
    attachedFileContent = null;
    document.getElementById('chat-file-input').value = "";
    const preview = document.getElementById('file-preview-area');
    preview.classList.add('hidden');
    preview.classList.remove('flex');
    preview.querySelector('#file-preview-name').textContent = '';
  }

  // ===================================================================
  // PERSISTÊNCIA e PROJETOS
  // ===================================================================
  function saveProjectData() {
    const tasksData = [];
    taskList.querySelectorAll('.task-entry').forEach(taskEntry => {
      const taskItem = taskEntry.querySelector('.task-item');
      const taskText = taskItem.querySelector('.task-text').textContent;
      let description = taskItem.querySelector('.task-description').textContent;
      if (description === 'Adicionar uma descrição...') description = '';

      const statusIndex = parseInt(taskItem.querySelector('.status-badge').dataset.statusIndex);
      const statusName = statuses[statusIndex].name;
      const completed = taskItem.classList.contains('completed');
      const createdAt = new Date(taskEntry.dataset.timestamp).toISOString();
      const statusStartTime = new Date(taskItem.dataset.statusStartTime).toISOString();
      const statusHistory = safeParseJSON(taskItem.dataset.statusHistory || '[]', []);

      const subtasksData = [];
      taskEntry.querySelectorAll('.subtask-item').forEach(subtaskItem => {
        const subtaskText = subtaskItem.querySelector('.task-text').textContent;
        const subtaskStatusIndex = parseInt(subtaskItem.querySelector('.status-badge').dataset.statusIndex);
        const subtaskStatusName = statuses[subtaskStatusIndex].name;
        const subtaskCompleted = subtaskItem.classList.contains('completed');
        const subtaskCreatedAt = new Date(subtaskItem.dataset.timestamp).toISOString();
        const subtaskStatusStartTime = new Date(subtaskItem.dataset.statusStartTime).toISOString();
        const subtaskStatusHistory = safeParseJSON(subtaskItem.dataset.statusHistory || '[]', []);

        subtasksData.push({
          text: subtaskText,
          status: subtaskStatusName,
          completed: subtaskCompleted,
          createdAt: subtaskCreatedAt,
          statusStartTime: subtaskStatusStartTime,
          statusHistory: subtaskStatusHistory
        });
      });

      tasksData.push({
        text: taskText,
        description,
        status: statusName,
        completed,
        createdAt,
        statusStartTime,
        statusHistory,
        subtasks: subtasksData
      });
    });

    projectsData[activeProject] = tasksData;
    localStorage.setItem('projects-data', JSON.stringify(projectsData));
  }

  function loadTasksForProject() {
    taskList.innerHTML = '';
    const tasksToLoad = projectsData[activeProject] || [];
    tasksToLoad.forEach(t => {
      const statusIndex = Math.max(0, statuses.findIndex(s => s.name === t.status));
      const el = createTaskElement(
        t.text,
        t.description || 'Adicionar uma descrição...',
        statusIndex,
        t.completed,
        t.subtasks || [],
        t.createdAt,
        t.statusStartTime,
        t.statusHistory
      );
      taskList.appendChild(el);
    });

    document.querySelectorAll('.task-entry').forEach(attachTaskEvents);
    updateStatusSummary();
    applyFiltersAndSearch();
    updateAIVisibility();
  }

  function renderProjectTabs() {
    const tabsContainer = document.getElementById('project-tabs');
    tabsContainer.innerHTML = '';
    Object.keys(projectsData).forEach(projectName => {
      const tab = el('button',
        `project-tab px-3 py-1 text-sm font-medium rounded-md transition ${projectName === activeProject ? 'active' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200'}`
      );
      tab.dataset.project = projectName;
      tab.textContent = projectName;
      tabsContainer.appendChild(tab);
    });
    document.getElementById('main-header-title').textContent = activeProject;
  }

  function switchProject(projectName) {
    activeProject = projectName;
    localStorage.setItem('active-project', projectName);
    renderProjectTabs();
    loadTasksForProject();
  }

  function loadInitialData() {
    const saved = localStorage.getItem('projects-data');
    projectsData = saved ? safeParseJSON(saved, {}) : {
      "Projeto Pessoal": [],
      "Trabalho": []
    };

    const savedActive = localStorage.getItem('active-project');
    activeProject = (savedActive && projectsData[savedActive]) ? savedActive : Object.keys(projectsData)[0];

    if (!activeProject) {
      projectsData = { "Meu Projeto": [] };
      activeProject = "Meu Projeto";
    }
  }

  // ===================================================================
  // TIMERS (cronômetro por status)
  // ===================================================================
  function startTimers() {
    setInterval(() => {
      document.querySelectorAll('.task-item, .subtask-item').forEach(item => {
        const timerSpan = item.querySelector('.status-timer span');
        if (!timerSpan) return;
        const start = new Date(item.dataset.statusStartTime);
        const elapsed = new Date() - start;
        timerSpan.textContent = formatDuration(elapsed);
      });
    }, 1000);
  }

  // ===================================================================
  // EVENT LISTENERS
  // ===================================================================
  // Criar tarefa
  taskForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = taskInput.value.trim();
    if (!text) return;
    const newTask = createTaskElement(text);
    taskList.prepend(newTask);
    taskInput.value = '';
    taskInput.focus();
    saveProjectData();
    updateStatusSummary();
    applyFiltersAndSearch();
  });

  // Tema
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('color-theme', isDark ? 'dark' : 'light');
    applyTheme();
  });

  // Download JSON
  document.getElementById('download-btn').addEventListener('click', () => {
    const dataStr = localStorage.getItem('projects-data');
    if (!dataStr) return alert("Nenhuma tarefa para baixar.");
    downloadJSON('tarefas.json', safeParseJSON(dataStr, {}));
  });

  // Busca
  searchInput.addEventListener('input', debounce(applyFiltersAndSearch, 150));

  // Filtros
  filterButtonsContainer.addEventListener('click', (e) => {
    const target = e.target.closest('.filter-btn');
    if (!target) return;

    const currentActive = filterButtonsContainer.querySelector('.active');
    if (currentActive) {
      currentActive.classList.remove('active','bg-blue-600','text-white','dark:bg-blue-600');
      currentActive.classList.add('bg-gray-200','dark:bg-gray-700','text-gray-700','dark:text-gray-200');
    }

    target.classList.add('active','bg-blue-600','text-white','dark:bg-blue-600');
    target.classList.remove('bg-gray-200','dark:bg-gray-700','text-gray-700','dark:text-gray-200');

    activeFilter = target.dataset.filter;
    applyFiltersAndSearch();
  });

  // Modal API Key
  const apiKeyBtn = document.getElementById('api-key-btn');
  const apiKeyModal = document.getElementById('api-key-modal');
  const closeModalBtn = document.getElementById('close-modal-btn');
  const saveApiKeyBtn = document.getElementById('save-api-key-btn');
  const apiKeyInput = document.getElementById('api-key-input');

  apiKeyBtn.addEventListener('click', () => {
    apiKeyInput.value = apiKey;
    apiKeyModal.classList.remove('hidden');
  });
  closeModalBtn.addEventListener('click', () => apiKeyModal.classList.add('hidden'));
  apiKeyModal.addEventListener('click', (e) => { if (e.target === apiKeyModal) apiKeyModal.classList.add('hidden'); });
  saveApiKeyBtn.addEventListener('click', () => {
    const newKey = apiKeyInput.value.trim();
    localStorage.setItem('gemini-api-key', newKey);
    apiKey = newKey;
    updateAIVisibility();
    apiKeyModal.classList.add('hidden');
  });

  // Tabs
  const tabs = document.getElementById('tabs');
  const tasksView = document.getElementById('tasks-view');
  const analysisView = document.getElementById('analysis-view');
  const chatView = document.getElementById('chat-view');

  tabs.addEventListener('click', (e) => {
    const target = e.target.closest('.tab-btn');
    if (!target) return;

    tabs.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    target.classList.add('active');

    tasksView.classList.add('hidden');
    analysisView.classList.add('hidden');
    chatView.classList.add('hidden');

    const tab = target.dataset.tab;
    if (tab === 'analysis') {
      analysisView.classList.remove('hidden');
      updateDashboard();
    } else if (tab === 'chat') {
      chatView.classList.remove('hidden');
    } else {
      tasksView.classList.remove('hidden');
    }
  });

  // Chat IA
  document.getElementById('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    sendChatMessage();
  });

  const attachFileBtn = document.getElementById('attach-file-btn');
  const chatFileInput = document.getElementById('chat-file-input');
  const filePreviewArea = document.getElementById('file-preview-area');
  const filePreviewName = document.getElementById('file-preview-name');
  const removeFileBtn = document.getElementById('remove-file-btn');

  attachFileBtn.addEventListener('click', () => chatFileInput.click());
  chatFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      attachedFileContent = event.target.result;
      filePreviewName.textContent = file.name;
      filePreviewArea.classList.remove('hidden');
      filePreviewArea.classList.add('flex');
    };
    reader.readAsText(file);
  });
  removeFileBtn.addEventListener('click', resetFileAttachment);

  // Projetos
  document.getElementById('add-project-btn').addEventListener('click', () => {
    const projectName = prompt("Digite o nome do novo projeto:");
    if (!projectName) return;
    if (projectsData[projectName]) return alert("Um projeto com este nome já existe.");
    projectsData[projectName] = [];
    switchProject(projectName);
    saveProjectData();
  });

  document.getElementById('project-tabs').addEventListener('click', (e) => {
    const target = e.target.closest('.project-tab');
    if (target) switchProject(target.dataset.project);
  });

  // ===================================================================
  // INICIALIZAÇÃO
  // ===================================================================
  applyTheme();
  initializeStatusSummary();
  initializeFilters();
  loadInitialData();
  renderProjectTabs();
  loadTasksForProject();
  updateAIVisibility();
  startTimers();
});
