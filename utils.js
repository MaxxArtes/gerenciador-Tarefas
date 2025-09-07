/* Utils gerais e helpers puros (sem tocar no DOM quando possível) */

/** Formata duração em ms => 'Xd Yh Zm Ws' */
function formatDuration(milliseconds) {
  if (milliseconds < 0) milliseconds = 0;
  let seconds = Math.floor(milliseconds / 1000);
  let minutes = Math.floor(seconds / 60);
  let hours = Math.floor(minutes / 60);
  let days = Math.floor(hours / 24);

  seconds %= 60;
  minutes %= 60;
  hours %= 24;

  let result = "";
  if (days > 0) result += `${days}d `;
  if (hours > 0) result += `${hours}h `;
  if (minutes > 0) result += `${minutes}m `;
  result += `${seconds}s`;
  return result.trim();
}

/** Debounce simples */
function debounce(fn, wait = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(null, args), wait);
  };
}

/** Parse JSON com fallback */
function safeParseJSON(str, fallback = null) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

/** Baixa um JSON como arquivo */
function downloadJSON(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Storage helpers */
const storage = {
  get(key, def = null) {
    const raw = localStorage.getItem(key);
    return raw == null ? def : raw;
  },
  set(key, value) {
    localStorage.setItem(key, value);
  }
};

/** Atualiza ícones de tema conforme estado do <html class="dark"> */
function syncThemeIcons() {
  const isDark = document.documentElement.classList.contains('dark');
  document.getElementById('theme-toggle-light-icon')?.classList.toggle('hidden', !isDark);
  document.getElementById('theme-toggle-dark-icon')?.classList.toggle('hidden', isDark);
}

/** Cria elemento com classes e HTML (helper pequeno) */
function el(tag, className = '', html = '') {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html) e.innerHTML = html;
  return e;
}
