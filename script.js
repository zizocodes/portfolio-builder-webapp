/**
 * PortfolioForge — script.js
 * ══════════════════════════════════════════════
 * A complete drag-and-drop portfolio builder
 *
 * Architecture:
 *  - STATE      : Single source of truth (sections, theme, selectedId)
 *  - RENDERERS  : Pure functions turning state → HTML strings
 *  - EVENTS     : All DOM event wiring in initEvents()
 *  - STORAGE    : Auto-save on every state mutation
 *  - EXPORT     : Generates standalone HTML from current state
 * ══════════════════════════════════════════════
 */

'use strict';

/* ═══════════════════════════════════════════
   STATE
═══════════════════════════════════════════ */
let state = {
  sections: [],          // Array of section objects {id, type, data}
  theme: {
    primary: '#6366f1',
    bg: '#0f0f13',
    text: '#f0f0f0',
    font: "'Syne', sans-serif",
    cardStyle: 'glass',
    darkMode: true
  },
  selectedId: null,
  viewport: 'desktop'
};

// Undo/Redo stacks
let undoStack = [];
let redoStack = [];

// Drag state
let dragSource = null;    // 'palette' | 'canvas'
let dragType = null;      // section type from palette
let dragSectionId = null; // id when reordering within canvas
let dragOverSectionId = null;

/* ═══════════════════════════════════════════
   DEFAULT DATA PER SECTION TYPE
═══════════════════════════════════════════ */
const defaultData = {
  hero: {
    eyebrow: 'Available for work',
    name: 'Alex Johnson',
    title: 'Full-Stack Developer & Designer',
    bio: 'I build beautiful, performant web applications with a focus on user experience. 5+ years of professional experience across startups and agencies.',
    ctaText: 'View My Work'
  },
  about: {
    name: 'Alex Johnson',
    bio: "I'm a passionate developer who loves turning complex problems into elegant solutions. When I'm not coding, you'll find me hiking trails or experimenting with generative art.\n\nI believe great software is built at the intersection of technical excellence and thoughtful design.",
    emoji: '👨‍💻'
  },
  skills: {
    sectionTitle: 'My Skills',
    items: [
      { name: 'JavaScript', level: 90 },
      { name: 'React / Vue', level: 85 },
      { name: 'Node.js', level: 80 },
      { name: 'TypeScript', level: 75 },
      { name: 'CSS / Tailwind', level: 88 },
      { name: 'Python', level: 70 }
    ]
  },
  projects: {
    sectionTitle: 'Selected Work',
    items: [
      { tag: 'Web App', title: 'TaskFlow Pro', desc: 'A real-time project management tool built with React, Node, and WebSockets. Used by 2000+ teams.' },
      { tag: 'Open Source', title: 'VizChart', desc: 'Lightweight charting library with 50+ chart types. 8k GitHub stars.' },
      { tag: 'Mobile', title: 'PocketAI', desc: 'On-device AI assistant app for iOS and Android. Finalist at TechCrunch Hackathon.' }
    ]
  },
  contact: {
    heading: "Let's Build Something",
    sub: "Open to freelance projects, full-time roles, and interesting collaborations.",
    email: 'hello@alexjohnson.dev',
    github: 'github.com/alexjohnson',
    linkedin: 'linkedin.com/in/alexjohnson',
    twitter: '@alexjohnsondev'
  },
  footer: {
    name: 'Alex Johnson',
    year: new Date().getFullYear(),
    credit: 'Built with PortfolioForge'
  }
};

/* ═══════════════════════════════════════════
   TEMPLATES
   Each template = a preset theme + section order
═══════════════════════════════════════════ */
const templates = {
  minimal: {
    theme: {
      primary: '#18181b',
      bg: '#fafafa',
      text: '#09090b',
      font: "'DM Sans', sans-serif",
      cardStyle: 'outline',
      darkMode: false
    },
    sections: ['hero', 'about', 'skills', 'projects', 'contact', 'footer']
  },
  creative: {
    theme: {
      primary: '#a855f7',
      bg: '#0d0d1a',
      text: '#f0f0ff',
      font: "'Syne', sans-serif",
      cardStyle: 'glass',
      darkMode: true
    },
    sections: ['hero', 'projects', 'skills', 'about', 'contact', 'footer']
  },
  corporate: {
    theme: {
      primary: '#0ea5e9',
      bg: '#f0f4f8',
      text: '#0a1628',
      font: "'Trebuchet MS', sans-serif",
      cardStyle: 'solid',
      darkMode: false
    },
    sections: ['hero', 'about', 'skills', 'projects', 'contact', 'footer']
  }
};

/* ═══════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════ */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/** Show a toast notification */
function toast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = { success: '✓', error: '✕', info: '◈' };
  el.innerHTML = `<span style="color:${type==='success'?'#10b981':type==='error'?'#ef4444':'var(--ui-accent)'}">${icons[type]}</span> ${msg}`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toast-out 0.3s ease forwards';
    setTimeout(() => el.remove(), 300);
  }, 2800);
}

/* ═══════════════════════════════════════════
   STATE MUTATIONS (with undo support)
═══════════════════════════════════════════ */

/** Push current state to undo stack before mutations */
function saveSnapshot() {
  undoStack.push(deepClone({ sections: state.sections, theme: state.theme }));
  if (undoStack.length > 30) undoStack.shift();
  redoStack = [];
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(deepClone({ sections: state.sections, theme: state.theme }));
  const snap = undoStack.pop();
  state.sections = snap.sections;
  state.theme = snap.theme;
  renderCanvas();
  applyThemeToCanvas();
  syncThemePanel();
  saveToStorage();
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(deepClone({ sections: state.sections, theme: state.theme }));
  const snap = redoStack.pop();
  state.sections = snap.sections;
  state.theme = snap.theme;
  renderCanvas();
  applyThemeToCanvas();
  syncThemePanel();
  saveToStorage();
}

/* ═══════════════════════════════════════════
   SECTION RENDERERS
   Each returns an HTML string for the section content
═══════════════════════════════════════════ */

function renderHero(d) {
  return `
    <div class="section-hero">
      <div class="hero-eyebrow">${escHtml(d.eyebrow)}</div>
      <div class="hero-name">${escHtml(d.name)}</div>
      <div class="hero-title">${escHtml(d.title)}</div>
      <div class="hero-bio">${escHtml(d.bio)}</div>
      <a class="hero-cta">${escHtml(d.ctaText)}</a>
    </div>`;
}

function renderAbout(d) {
  return `
    <div class="section-about">
      <div class="about-content">
        <span class="section-label">About Me</span>
        <h2>${escHtml(d.name)}</h2>
        <div class="about-text">${escHtml(d.bio).replace(/\n/g, '<br>')}</div>
      </div>
      <div class="about-avatar">${escHtml(d.emoji)}</div>
    </div>`;
}

function renderSkills(d) {
  const items = d.items.map(s => `
    <div class="skill-item">
      <div class="skill-name">${escHtml(s.name)}</div>
      <div class="skill-bar">
        <div class="skill-bar-fill" style="width:${s.level}%"></div>
      </div>
    </div>`).join('');
  return `
    <div class="section-skills">
      <span class="section-label">Expertise</span>
      <h2>${escHtml(d.sectionTitle)}</h2>
      <div class="skills-grid">${items}</div>
    </div>`;
}

function renderProjects(d) {
  const cards = d.items.map(p => `
    <div class="project-card">
      <div class="project-tag">${escHtml(p.tag)}</div>
      <div class="project-title">${escHtml(p.title)}</div>
      <div class="project-desc">${escHtml(p.desc)}</div>
      <div class="project-link">View project →</div>
    </div>`).join('');
  return `
    <div class="section-projects">
      <span class="section-label">Portfolio</span>
      <h2>${escHtml(d.sectionTitle)}</h2>
      <div class="projects-grid">${cards}</div>
    </div>`;
}

function renderContact(d) {
  const links = [
    d.email    && `<a class="contact-link">✉ ${escHtml(d.email)}</a>`,
    d.github   && `<a class="contact-link">⌥ ${escHtml(d.github)}</a>`,
    d.linkedin && `<a class="contact-link">in ${escHtml(d.linkedin)}</a>`,
    d.twitter  && `<a class="contact-link">𝕏 ${escHtml(d.twitter)}</a>`
  ].filter(Boolean).join('');
  return `
    <div class="section-contact">
      <span class="section-label">Get In Touch</span>
      <h2>${escHtml(d.heading)}</h2>
      <div class="contact-sub">${escHtml(d.sub)}</div>
      <div class="contact-links">${links}</div>
    </div>`;
}

function renderFooter(d) {
  return `
    <div class="section-footer">
      <div class="footer-text">© ${d.year} ${escHtml(d.name)}</div>
      <div class="footer-credit">${escHtml(d.credit)}</div>
    </div>`;
}

/** Maps type → renderer */
const sectionRenderers = { hero: renderHero, about: renderAbout, skills: renderSkills, projects: renderProjects, contact: renderContact, footer: renderFooter };

/** Section display labels */
const sectionLabels = { hero: '🚀 Hero', about: '👤 About', skills: '⚡ Skills', projects: '📂 Projects', contact: '✉️ Contact', footer: '⚓ Footer' };

/** XSS escape */
function escHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ═══════════════════════════════════════════
   CANVAS RENDERING
═══════════════════════════════════════════ */

function renderCanvas() {
  const canvas = document.getElementById('canvas');
  const empty = document.getElementById('empty-state');

  if (state.sections.length === 0) {
    canvas.innerHTML = '';
    canvas.appendChild(empty || createEmptyState());
    document.getElementById('empty-state')?.style && (document.getElementById('empty-state').style.display = '');
    return;
  }

  // Remove empty state if present
  if (empty) empty.style.display = 'none';

  // Build section HTML
  const html = state.sections.map(sec => buildSectionWrapper(sec)).join('');
  canvas.innerHTML = html;

  // Re-apply selection highlight
  if (state.selectedId) {
    const el = canvas.querySelector(`[data-id="${state.selectedId}"]`);
    if (el) el.classList.add('selected');
  }

  // Wire per-section events
  bindSectionEvents();
}

function createEmptyState() {
  const div = document.createElement('div');
  div.className = 'canvas-empty-state';
  div.id = 'empty-state';
  div.innerHTML = `
    <div class="empty-icon">⬡</div>
    <h3>Start Building</h3>
    <p>Drag blocks from the left panel<br>or choose a template to begin</p>`;
  return div;
}

function buildSectionWrapper(sec) {
  const renderer = sectionRenderers[sec.type];
  if (!renderer) return '';
  const innerHtml = renderer(sec.data);
  return `
    <div class="section-wrapper" data-id="${sec.id}" data-type="${sec.type}" draggable="true">
      <div class="section-drag-handle" title="Drag to reorder">⠿</div>
      <div class="section-toolbar">
        <button class="sec-tool-btn" data-action="edit" title="Edit content">✏</button>
        <button class="sec-tool-btn" data-action="up" title="Move up">↑</button>
        <button class="sec-tool-btn" data-action="down" title="Move down">↓</button>
        <button class="sec-tool-btn danger" data-action="delete" title="Remove section">✕</button>
      </div>
      ${innerHtml}
    </div>`;
}

/* ═══════════════════════════════════════════
   THEME APPLICATION
═══════════════════════════════════════════ */

function applyThemeToCanvas() {
  const canvas = document.getElementById('canvas');
  const t = state.theme;

  // Apply CSS custom properties to canvas
  canvas.style.setProperty('--p-primary', t.primary);
  canvas.style.setProperty('--p-bg', t.bg);
  canvas.style.setProperty('--p-text', t.text);
  canvas.style.setProperty('--p-font', t.font);
  canvas.style.background = t.bg;
  canvas.style.fontFamily = t.font;

  // Card style class
  canvas.classList.remove('card-style-glass', 'card-style-solid', 'card-style-outline');
  canvas.classList.add(`card-style-${t.cardStyle}`);

  // Dark/light toggle
  document.body.classList.toggle('light-preview', !t.darkMode);

  // Sync builder accent to match portfolio primary
  document.documentElement.style.setProperty('--ui-accent', t.primary);
  document.documentElement.style.setProperty('--ui-accent-glow', hexToRgba(t.primary, 0.25));
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function syncThemePanel() {
  const t = state.theme;
  document.getElementById('color-primary').value = t.primary;
  document.getElementById('color-bg').value = t.bg;
  document.getElementById('color-text').value = t.text;
  document.getElementById('hex-primary').textContent = t.primary;
  document.getElementById('hex-bg').textContent = t.bg;
  document.getElementById('hex-text').textContent = t.text;
  document.getElementById('font-select').value = t.font;
  document.getElementById('dark-mode-toggle').checked = t.darkMode;

  document.querySelectorAll('.card-style-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.card === t.cardStyle);
  });
}

/* ═══════════════════════════════════════════
   LOCAL STORAGE
═══════════════════════════════════════════ */

function saveToStorage() {
  try {
    localStorage.setItem('portfolioforge_state', JSON.stringify({ sections: state.sections, theme: state.theme }));
  } catch (e) { /* quota exceeded */ }
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem('portfolioforge_state');
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (saved.sections) state.sections = saved.sections;
    if (saved.theme) state.theme = { ...state.theme, ...saved.theme };
    return true;
  } catch (e) { return false; }
}

/* ═══════════════════════════════════════════
   SECTION CRUD
═══════════════════════════════════════════ */

function addSection(type, insertAfterIndex = -1) {
  saveSnapshot();
  const sec = {
    id: uid(),
    type,
    data: deepClone(defaultData[type])
  };
  if (insertAfterIndex >= 0 && insertAfterIndex < state.sections.length) {
    state.sections.splice(insertAfterIndex + 1, 0, sec);
  } else {
    state.sections.push(sec);
  }
  renderCanvas();
  applyThemeToCanvas();
  selectSection(sec.id);
  saveToStorage();
  toast(`${sectionLabels[type]} added`, 'success');
}

function deleteSection(id) {
  saveSnapshot();
  state.sections = state.sections.filter(s => s.id !== id);
  if (state.selectedId === id) {
    state.selectedId = null;
    showSectionEditorPlaceholder();
  }
  renderCanvas();
  applyThemeToCanvas();
  saveToStorage();
  toast('Section removed');
}

function moveSectionUp(id) {
  const idx = state.sections.findIndex(s => s.id === id);
  if (idx <= 0) return;
  saveSnapshot();
  [state.sections[idx - 1], state.sections[idx]] = [state.sections[idx], state.sections[idx - 1]];
  renderCanvas();
  applyThemeToCanvas();
  saveToStorage();
}

function moveSectionDown(id) {
  const idx = state.sections.findIndex(s => s.id === id);
  if (idx < 0 || idx >= state.sections.length - 1) return;
  saveSnapshot();
  [state.sections[idx], state.sections[idx + 1]] = [state.sections[idx + 1], state.sections[idx]];
  renderCanvas();
  applyThemeToCanvas();
  saveToStorage();
}

function selectSection(id) {
  state.selectedId = id;
  // Update visual selection
  document.querySelectorAll('.section-wrapper').forEach(el => {
    el.classList.toggle('selected', el.dataset.id === id);
  });
  // Switch to section tab
  switchRightTab('section');
  showSectionEditorFor(id);
}

/* ═══════════════════════════════════════════
   SECTION EDITOR (right sidebar)
═══════════════════════════════════════════ */

function showSectionEditorPlaceholder() {
  document.getElementById('section-editor-placeholder').style.display = '';
  document.getElementById('section-editor').style.display = 'none';
}

function showSectionEditorFor(id) {
  const sec = state.sections.find(s => s.id === id);
  if (!sec) { showSectionEditorPlaceholder(); return; }

  document.getElementById('section-editor-placeholder').style.display = 'none';
  const editor = document.getElementById('section-editor');
  editor.style.display = '';

  // Build simple field list
  const fields = getSectionFields(sec);
  editor.innerHTML = `
    <div style="padding:12px 0 6px;">
      <div style="font-size:11px;font-weight:700;color:var(--ui-text-muted);letter-spacing:.5px;text-transform:uppercase;margin-bottom:10px;">
        ${sectionLabels[sec.type]}
      </div>
      ${fields}
      <button class="action-btn primary" id="open-full-edit" style="width:100%;justify-content:center;margin-top:12px;">
        ✏ Full Edit
      </button>
    </div>`;

  document.getElementById('open-full-edit')?.addEventListener('click', () => openEditModal(id));

  // Live update on input
  editor.querySelectorAll('input, textarea').forEach(inp => {
    inp.addEventListener('input', e => {
      const field = e.target.dataset.field;
      if (field) {
        sec.data[field] = e.target.value;
        renderCanvas();
        applyThemeToCanvas();
        saveToStorage();
        // Re-select
        const el = document.querySelector(`[data-id="${id}"]`);
        if (el) el.classList.add('selected');
      }
    });
  });
}

function getSectionFields(sec) {
  const d = sec.data;
  const field = (label, key, multiline = false) => {
    const val = escHtml(String(d[key] || ''));
    if (multiline) {
      return `<div class="section-field"><label>${label}</label><textarea data-field="${key}" rows="3">${val}</textarea></div>`;
    }
    return `<div class="section-field"><label>${label}</label><input type="text" data-field="${key}" value="${val}" /></div>`;
  };

  switch (sec.type) {
    case 'hero':    return field('Name', 'name') + field('Title', 'title') + field('Bio', 'bio', true);
    case 'about':   return field('Name', 'name') + field('Bio', 'bio', true);
    case 'skills':  return field('Section Title', 'sectionTitle') + '<div class="section-field"><label>Edit Skills →</label><button class="action-btn ghost" onclick="document.getElementById(\'open-full-edit\').click()" style="width:100%;justify-content:center;font-size:11px;">Open Skills Editor</button></div>';
    case 'projects':return field('Section Title', 'sectionTitle') + '<div class="section-field"><label>Edit Projects →</label><button class="action-btn ghost" onclick="document.getElementById(\'open-full-edit\').click()" style="width:100%;justify-content:center;font-size:11px;">Open Projects Editor</button></div>';
    case 'contact': return field('Heading', 'heading') + field('Email', 'email') + field('GitHub', 'github');
    case 'footer':  return field('Name', 'name') + field('Credit', 'credit');
    default: return '';
  }
}

/* ═══════════════════════════════════════════
   MODAL — Full Edit
═══════════════════════════════════════════ */

function openEditModal(id) {
  const sec = state.sections.find(s => s.id === id);
  if (!sec) return;

  const modal = document.getElementById('edit-modal');
  const body = document.getElementById('modal-body');
  const title = document.getElementById('modal-title');

  title.textContent = `Edit ${sectionLabels[sec.type]}`;
  body.innerHTML = buildModalFields(sec);

  modal.style.display = 'flex';

  // Save
  document.getElementById('modal-save').onclick = () => {
    saveSnapshot();
    const updated = collectModalData(sec);
    sec.data = updated;
    renderCanvas();
    applyThemeToCanvas();
    showSectionEditorFor(id);
    saveToStorage();
    closeModal();
    toast('Changes saved', 'success');
  };
}

function closeModal() {
  document.getElementById('edit-modal').style.display = 'none';
}

function buildModalFields(sec) {
  const d = sec.data;

  const mField = (label, name, val, type = 'input', hint = '') => {
    const escaped = escHtml(String(val || ''));
    const inp = type === 'textarea'
      ? `<textarea name="${name}" rows="4">${escaped}</textarea>`
      : `<input type="text" name="${name}" value="${escaped}" />`;
    return `<div class="modal-field"><label>${label}</label>${inp}${hint ? `<div class="modal-hint">${hint}</div>` : ''}</div>`;
  };

  switch (sec.type) {
    case 'hero':
      return mField('Eyebrow text', 'eyebrow', d.eyebrow, 'input', 'Small label above your name')
           + mField('Your Name', 'name', d.name)
           + mField('Title / Role', 'title', d.title)
           + mField('Short Bio', 'bio', d.bio, 'textarea')
           + mField('CTA Button Text', 'ctaText', d.ctaText);

    case 'about':
      return mField('Your Name', 'name', d.name)
           + mField('Bio Paragraphs', 'bio', d.bio, 'textarea', 'Use a blank line to separate paragraphs')
           + mField('Avatar Emoji', 'emoji', d.emoji, 'input', 'An emoji to represent you 👨‍💻');

    case 'skills':
      return mField('Section Title', 'sectionTitle', d.sectionTitle)
           + `<div class="modal-field">
                <label>Skills (Name + Level 0-100)</label>
                <div class="list-editor" id="skills-list">
                  ${d.items.map((s,i) => `
                    <div class="list-row">
                      <input type="text" name="skill_name_${i}" value="${escHtml(s.name)}" placeholder="Skill name" />
                      <input type="number" name="skill_level_${i}" value="${s.level}" min="0" max="100" placeholder="%" />
                      <button class="remove-row-btn" onclick="removeListRow(this)">✕</button>
                    </div>`).join('')}
                </div>
                <button class="add-row-btn" onclick="addSkillRow()">+ Add skill</button>
              </div>`;

    case 'projects':
      return mField('Section Title', 'sectionTitle', d.sectionTitle)
           + `<div class="modal-field">
                <label>Projects</label>
                <div class="list-editor" id="projects-list">
                  ${d.items.map((p,i) => `
                    <div class="list-row" style="flex-direction:column;gap:6px;padding:12px;background:var(--ui-surface2);border-radius:8px;border:1px solid var(--ui-border);">
                      <div style="display:flex;gap:6px;align-items:center;">
                        <input type="text" name="proj_tag_${i}" value="${escHtml(p.tag)}" placeholder="Tag" style="width:90px;flex:0;" />
                        <input type="text" name="proj_title_${i}" value="${escHtml(p.title)}" placeholder="Project title" style="flex:1;" />
                        <button class="remove-row-btn" onclick="removeListRow(this)">✕</button>
                      </div>
                      <textarea name="proj_desc_${i}" rows="2" placeholder="Description">${escHtml(p.desc)}</textarea>
                    </div>`).join('')}
                </div>
                <button class="add-row-btn" onclick="addProjectRow()">+ Add project</button>
              </div>`;

    case 'contact':
      return mField('Heading', 'heading', d.heading)
           + mField('Sub-heading', 'sub', d.sub, 'textarea')
           + mField('Email', 'email', d.email)
           + mField('GitHub URL', 'github', d.github)
           + mField('LinkedIn URL', 'linkedin', d.linkedin)
           + mField('Twitter / X handle', 'twitter', d.twitter);

    case 'footer':
      return mField('Name', 'name', d.name)
           + mField('Year', 'year', d.year)
           + mField('Credit text', 'credit', d.credit);

    default: return '<p style="color:var(--ui-text-muted);font-size:13px;">No editable fields.</p>';
  }
}

function collectModalData(sec) {
  const modal = document.getElementById('modal-body');
  const get = name => (modal.querySelector(`[name="${name}"]`)?.value || '').trim();

  switch (sec.type) {
    case 'hero':
      return { eyebrow: get('eyebrow'), name: get('name'), title: get('title'), bio: get('bio'), ctaText: get('ctaText') };

    case 'about':
      return { name: get('name'), bio: get('bio'), emoji: get('emoji') || '👤' };

    case 'skills': {
      const rows = modal.querySelectorAll('#skills-list .list-row');
      const items = Array.from(rows).map((_, i) => ({
        name: get(`skill_name_${i}`),
        level: parseInt(get(`skill_level_${i}`)) || 0
      })).filter(s => s.name);
      return { sectionTitle: get('sectionTitle'), items };
    }

    case 'projects': {
      const rows = modal.querySelectorAll('#projects-list .list-row');
      const items = Array.from(rows).map((_, i) => ({
        tag: get(`proj_tag_${i}`),
        title: get(`proj_title_${i}`),
        desc: get(`proj_desc_${i}`)
      })).filter(p => p.title);
      return { sectionTitle: get('sectionTitle'), items };
    }

    case 'contact':
      return { heading: get('heading'), sub: get('sub'), email: get('email'), github: get('github'), linkedin: get('linkedin'), twitter: get('twitter') };

    case 'footer':
      return { name: get('name'), year: get('year'), credit: get('credit') };

    default: return sec.data;
  }
}

/** Remove a dynamic list row */
window.removeListRow = function(btn) {
  btn.closest('.list-row').remove();
};

/** Add a new skill row */
window.addSkillRow = function() {
  const list = document.getElementById('skills-list');
  const i = list.querySelectorAll('.list-row').length;
  const row = document.createElement('div');
  row.className = 'list-row';
  row.innerHTML = `
    <input type="text" name="skill_name_${i}" placeholder="Skill name" />
    <input type="number" name="skill_level_${i}" value="75" min="0" max="100" placeholder="%" />
    <button class="remove-row-btn" onclick="removeListRow(this)">✕</button>`;
  list.appendChild(row);
};

/** Add a new project row */
window.addProjectRow = function() {
  const list = document.getElementById('projects-list');
  const i = list.querySelectorAll('.list-row').length;
  const row = document.createElement('div');
  row.className = 'list-row';
  row.style.cssText = 'flex-direction:column;gap:6px;padding:12px;background:var(--ui-surface2);border-radius:8px;border:1px solid var(--ui-border);';
  row.innerHTML = `
    <div style="display:flex;gap:6px;align-items:center;">
      <input type="text" name="proj_tag_${i}" placeholder="Tag" style="width:90px;flex:0;" />
      <input type="text" name="proj_title_${i}" placeholder="Project title" style="flex:1;" />
      <button class="remove-row-btn" onclick="removeListRow(this)">✕</button>
    </div>
    <textarea name="proj_desc_${i}" rows="2" placeholder="Description"></textarea>`;
  list.appendChild(row);
};

/* ═══════════════════════════════════════════
   DRAG AND DROP
═══════════════════════════════════════════ */

function initDragAndDrop() {

  /* ── Palette items ── */
  document.querySelectorAll('.component-item').forEach(item => {
    item.addEventListener('dragstart', e => {
      dragSource = 'palette';
      dragType = item.dataset.type;
      e.dataTransfer.effectAllowed = 'copy';
      item.classList.add('dragging');
      e.dataTransfer.setData('text/plain', dragType);
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      dragSource = null;
    });
  });

  /* ── Canvas drop zone ── */
  const canvas = document.getElementById('canvas');

  canvas.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = dragSource === 'palette' ? 'copy' : 'move';
    canvas.classList.add('drag-over');

    // Calculate insertion index from Y position
    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    updateDropIndicator(canvas, y);
  });

  canvas.addEventListener('dragleave', e => {
    if (!canvas.contains(e.relatedTarget)) {
      canvas.classList.remove('drag-over');
      removeDropIndicator();
    }
  });

  canvas.addEventListener('drop', e => {
    e.preventDefault();
    canvas.classList.remove('drag-over');
    const insertIdx = getDropIndex(canvas, e.clientY - canvas.getBoundingClientRect().top);
    removeDropIndicator();

    if (dragSource === 'palette' && dragType) {
      // Adjust index to account for empty-state div
      const finalIdx = Math.max(0, insertIdx - 1);
      addSection(dragType, finalIdx - 1);
    } else if (dragSource === 'canvas' && dragSectionId) {
      reorderSection(dragSectionId, insertIdx);
    }
  });
}

function bindSectionEvents() {
  // Section drag (reorder)
  document.querySelectorAll('.section-wrapper').forEach(wrapper => {
    wrapper.addEventListener('dragstart', e => {
      if (e.target.classList.contains('section-drag-handle') || e.target === wrapper) {
        dragSource = 'canvas';
        dragSectionId = wrapper.dataset.id;
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => wrapper.style.opacity = '0.4', 0);
      }
    });

    wrapper.addEventListener('dragend', () => {
      wrapper.style.opacity = '';
      dragSource = null;
      dragSectionId = null;
    });

    // Click to select
    wrapper.addEventListener('click', e => {
      if (e.target.closest('.sec-tool-btn') || e.target.closest('.section-drag-handle')) return;
      selectSection(wrapper.dataset.id);
    });

    // Toolbar buttons
    wrapper.querySelectorAll('.sec-tool-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = wrapper.dataset.id;
        const action = btn.dataset.action;
        if (action === 'edit') { selectSection(id); openEditModal(id); }
        else if (action === 'up') moveSectionUp(id);
        else if (action === 'down') moveSectionDown(id);
        else if (action === 'delete') {
          if (confirm('Remove this section?')) deleteSection(id);
        }
      });
    });
  });
}

function getDropIndex(canvas, y) {
  const wrappers = Array.from(canvas.querySelectorAll('.section-wrapper'));
  for (let i = 0; i < wrappers.length; i++) {
    const rect = wrappers[i].getBoundingClientRect();
    const midY = rect.top + rect.height / 2 - canvas.getBoundingClientRect().top;
    if (y < midY) return i;
  }
  return wrappers.length;
}

function updateDropIndicator(canvas, y) {
  removeDropIndicator();
  const insertIdx = getDropIndex(canvas, y);
  const indicator = document.createElement('div');
  indicator.className = 'drop-placeholder';
  indicator.id = 'drop-indicator';
  indicator.textContent = '+ Drop here';

  const wrappers = Array.from(canvas.querySelectorAll('.section-wrapper'));
  if (wrappers.length === 0) {
    canvas.appendChild(indicator);
  } else if (insertIdx >= wrappers.length) {
    canvas.appendChild(indicator);
  } else {
    canvas.insertBefore(indicator, wrappers[insertIdx]);
  }
}

function removeDropIndicator() {
  document.getElementById('drop-indicator')?.remove();
}

function reorderSection(id, toIndex) {
  const fromIndex = state.sections.findIndex(s => s.id === id);
  if (fromIndex < 0) return;
  saveSnapshot();
  const [sec] = state.sections.splice(fromIndex, 1);
  const adjusted = toIndex > fromIndex ? toIndex - 1 : toIndex;
  state.sections.splice(Math.max(0, Math.min(adjusted, state.sections.length)), 0, sec);
  renderCanvas();
  applyThemeToCanvas();
  saveToStorage();
}

/* ═══════════════════════════════════════════
   TEMPLATES
   Apply preset theme + sections
═══════════════════════════════════════════ */

function applyTemplate(name) {
  const tpl = templates[name];
  if (!tpl) return;
  if (state.sections.length > 0 && !confirm('This will replace your current layout. Continue?')) return;

  saveSnapshot();
  state.theme = { ...state.theme, ...tpl.theme };
  state.sections = tpl.sections.map(type => ({
    id: uid(),
    type,
    data: deepClone(defaultData[type])
  }));
  state.selectedId = null;

  renderCanvas();
  applyThemeToCanvas();
  syncThemePanel();
  showSectionEditorPlaceholder();
  saveToStorage();
  toast(`"${name}" template applied`, 'success');
}

/* ═══════════════════════════════════════════
   EXPORT TO HTML
   ══════════════════════════════════════════
   HOW IT WORKS:
   1. We collect the current state (sections + theme)
   2. For each section, run the renderer to produce HTML
   3. Inject user's theme as CSS variables in <style>
   4. Wrap everything in a standalone HTML document
   5. Create a Blob URL and trigger download
═══════════════════════════════════════════ */

function exportToHTML() {
  if (state.sections.length === 0) {
    toast('Add sections before exporting', 'error');
    return;
  }

  const t = state.theme;
  const sectionsHTML = state.sections.map(sec => {
    const renderer = sectionRenderers[sec.type];
    return renderer ? renderer(sec.data) : '';
  }).join('\n');

  const fontName = t.font.split(',')[0].replace(/['"]/g, '').trim();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(getHeroName())} — Portfolio</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    /* ── Theme Variables ── */
    :root {
      --p-primary: ${t.primary};
      --p-bg: ${t.bg};
      --p-text: ${t.text};
      --p-font: ${t.font};
      --p-card-radius: 16px;
      --p-card-bg: ${t.darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'};
      --p-card-border: ${t.darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'};
    }

    /* ── Reset & Base ── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body {
      font-family: var(--p-font);
      background: var(--p-bg);
      color: var(--p-text);
      -webkit-font-smoothing: antialiased;
    }
    a { color: inherit; text-decoration: none; }

    /* ── Section animations ── */
    .section-hero, .section-about, .section-skills, .section-projects, .section-contact, .section-footer {
      animation: fade-up 0.6s ease both;
    }
    @keyframes fade-up {
      from { opacity: 0; transform: translateY(24px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* ── HERO ── */
    .section-hero {
      padding: 80px 60px;
      min-height: 420px;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      justify-content: center;
      background: linear-gradient(135deg, var(--p-bg), color-mix(in srgb, var(--p-primary) 8%, var(--p-bg)));
      position: relative;
      overflow: hidden;
    }
    .section-hero::after {
      content: '';
      position: absolute;
      top: -80px; right: -80px;
      width: 320px; height: 320px;
      border-radius: 50%;
      background: radial-gradient(circle, color-mix(in srgb, var(--p-primary) 25%, transparent), transparent 70%);
      pointer-events: none;
    }
    .hero-eyebrow { font-size: 13px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: var(--p-primary); margin-bottom: 16px; }
    .hero-name { font-size: clamp(36px, 5vw, 64px); font-weight: 800; line-height: 1.05; color: var(--p-text); margin-bottom: 12px; }
    .hero-title { font-size: clamp(16px, 2.5vw, 22px); color: color-mix(in srgb, var(--p-text) 60%, transparent); margin-bottom: 28px; }
    .hero-bio { font-size: 15px; line-height: 1.7; color: color-mix(in srgb, var(--p-text) 55%, transparent); max-width: 520px; margin-bottom: 36px; }
    .hero-cta {
      display: inline-block;
      padding: 13px 28px;
      background: var(--p-primary);
      color: #fff;
      border-radius: 8px;
      font-weight: 600;
      font-size: 14px;
      box-shadow: 0 4px 20px color-mix(in srgb, var(--p-primary) 40%, transparent);
      transition: filter 0.2s, transform 0.2s;
    }
    .hero-cta:hover { filter: brightness(1.1); transform: translateY(-2px); }

    /* ── ABOUT ── */
    .section-about {
      padding: 64px 60px;
      display: grid;
      grid-template-columns: 1fr 200px;
      gap: 48px;
      align-items: center;
    }
    .about-content h2 { font-size: 32px; font-weight: 700; margin-bottom: 16px; color: var(--p-text); }
    .about-text { font-size: 15px; line-height: 1.75; color: color-mix(in srgb, var(--p-text) 65%, transparent); }
    .about-avatar {
      width: 160px; height: 160px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--p-primary), color-mix(in srgb, var(--p-primary) 40%, #000));
      display: flex; align-items: center; justify-content: center;
      font-size: 60px;
      justify-self: center;
      box-shadow: 0 0 40px color-mix(in srgb, var(--p-primary) 30%, transparent);
    }

    /* ── SKILLS ── */
    .section-skills { padding: 64px 60px; background: color-mix(in srgb, var(--p-primary) 4%, var(--p-bg)); }
    .section-skills h2 { font-size: 32px; font-weight: 700; margin-bottom: 36px; color: var(--p-text); }
    .skills-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
    .skill-item { padding: 14px 16px; background: var(--p-card-bg); border: 1px solid var(--p-card-border); border-radius: var(--p-card-radius); backdrop-filter: blur(10px); }
    .skill-name { font-size: 13px; font-weight: 600; color: var(--p-text); margin-bottom: 8px; }
    .skill-bar { height: 4px; background: color-mix(in srgb, var(--p-text) 15%, transparent); border-radius: 99px; overflow: hidden; }
    .skill-bar-fill { height: 100%; background: var(--p-primary); border-radius: 99px; }

    /* ── PROJECTS ── */
    .section-projects { padding: 64px 60px; }
    .section-projects h2 { font-size: 32px; font-weight: 700; margin-bottom: 36px; color: var(--p-text); }
    .projects-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px; }
    .project-card { padding: 24px; background: var(--p-card-bg); border: 1px solid var(--p-card-border); border-radius: var(--p-card-radius); backdrop-filter: blur(10px); transition: transform 0.2s, box-shadow 0.2s; }
    .project-card:hover { transform: translateY(-4px); box-shadow: 0 12px 40px color-mix(in srgb, var(--p-primary) 15%, transparent); }
    .project-tag { display: inline-block; font-size: 10px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--p-primary); margin-bottom: 10px; }
    .project-title { font-size: 17px; font-weight: 700; color: var(--p-text); margin-bottom: 8px; }
    .project-desc { font-size: 13px; line-height: 1.65; color: color-mix(in srgb, var(--p-text) 60%, transparent); }
    .project-link { display: inline-flex; align-items: center; gap: 4px; margin-top: 16px; font-size: 12px; font-weight: 600; color: var(--p-primary); }

    /* ── CONTACT ── */
    .section-contact { padding: 64px 60px; background: color-mix(in srgb, var(--p-primary) 5%, var(--p-bg)); text-align: center; }
    .section-contact h2 { font-size: 32px; font-weight: 700; margin-bottom: 12px; color: var(--p-text); }
    .contact-sub { font-size: 15px; color: color-mix(in srgb, var(--p-text) 60%, transparent); margin-bottom: 32px; }
    .contact-links { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }
    .contact-link { padding: 10px 20px; background: var(--p-card-bg); border: 1px solid var(--p-card-border); border-radius: 8px; font-size: 13px; font-weight: 600; color: var(--p-text); transition: background 0.2s, color 0.2s; }
    .contact-link:hover { background: var(--p-primary); border-color: var(--p-primary); color: #fff; }

    /* ── FOOTER ── */
    .section-footer { padding: 28px 60px; border-top: 1px solid var(--p-card-border); display: flex; justify-content: space-between; align-items: center; }
    .footer-text { font-size: 13px; color: color-mix(in srgb, var(--p-text) 40%, transparent); }
    .footer-credit { font-size: 12px; color: color-mix(in srgb, var(--p-text) 30%, transparent); }

    /* ── Shared ── */
    .section-label { display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: var(--p-primary); margin-bottom: 12px; }

    /* ── Card style: ${t.cardStyle} ── */
    ${t.cardStyle === 'solid' ? `
    .skill-item, .project-card, .contact-link {
      background: color-mix(in srgb, var(--p-primary) 10%, var(--p-bg));
      backdrop-filter: none;
    }` : ''}
    ${t.cardStyle === 'outline' ? `
    .skill-item, .project-card, .contact-link {
      background: transparent;
      border-color: color-mix(in srgb, var(--p-primary) 40%, transparent);
      backdrop-filter: none;
    }` : ''}

    /* ── Responsive ── */
    @media (max-width: 768px) {
      .section-hero, .section-about, .section-skills, .section-projects, .section-contact, .section-footer { padding-left: 24px; padding-right: 24px; }
      .section-about { grid-template-columns: 1fr; }
      .about-avatar { display: none; }
      .projects-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
${sectionsHTML}
</body>
</html>`;

  // Create blob and download
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(getHeroName() || 'portfolio').toLowerCase().replace(/\s+/g, '-')}-portfolio.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Portfolio exported!', 'success');
}

function getHeroName() {
  const hero = state.sections.find(s => s.type === 'hero');
  return hero?.data?.name || 'Portfolio';
}

/* ═══════════════════════════════════════════
   FULL PREVIEW
═══════════════════════════════════════════ */

function showFullPreview() {
  if (state.sections.length === 0) {
    toast('Add sections to preview', 'error');
    return;
  }
  // Generate the same HTML as export but show in iframe
  const html = generatePreviewHTML();
  const iframe = document.getElementById('preview-iframe');
  iframe.srcdoc = html;
  document.getElementById('preview-overlay').style.display = 'flex';
}

function generatePreviewHTML() {
  // Reuse export logic but just grab the HTML string
  const t = state.theme;
  const sectionsHTML = state.sections.map(sec => {
    const renderer = sectionRenderers[sec.type];
    return renderer ? renderer(sec.data) : '';
  }).join('\n');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>:root{--p-primary:${t.primary};--p-bg:${t.bg};--p-text:${t.text};--p-font:${t.font};--p-card-radius:16px;--p-card-bg:${t.darkMode?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.04)'};--p-card-border:${t.darkMode?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)'};}
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}body{font-family:var(--p-font);background:var(--p-bg);color:var(--p-text);-webkit-font-smoothing:antialiased;}a{color:inherit;text-decoration:none;}
  </style></head><body>${sectionsHTML}</body></html>`;
}

/* ═══════════════════════════════════════════
   RIGHT SIDEBAR TABS
═══════════════════════════════════════════ */

function switchRightTab(name) {
  document.querySelectorAll('.rstab').forEach(t => t.classList.toggle('active', t.dataset.rtab === name));
  document.querySelectorAll('.rtab-panel').forEach(p => p.classList.toggle('active', p.id === `rtab-${name}`));
}

/* ═══════════════════════════════════════════
   INIT EVENTS
═══════════════════════════════════════════ */

function initEvents() {

  /* ── Left sidebar tabs ── */
  document.querySelectorAll('.stab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.stab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });

  /* ── Right sidebar tabs ── */
  document.querySelectorAll('.rstab').forEach(btn => {
    btn.addEventListener('click', () => switchRightTab(btn.dataset.rtab));
  });

  /* ── Viewport toggles ── */
  document.querySelectorAll('.vp-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.vp-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.viewport = btn.dataset.vp;
      const frame = document.getElementById('canvas-frame');
      frame.className = 'canvas-frame';
      if (state.viewport !== 'desktop') frame.classList.add(state.viewport);
    });
  });

  /* ── Theme controls ── */
  document.getElementById('color-primary').addEventListener('input', e => {
    state.theme.primary = e.target.value;
    document.getElementById('hex-primary').textContent = e.target.value;
    applyThemeToCanvas();
    saveToStorage();
  });

  document.getElementById('color-bg').addEventListener('input', e => {
    state.theme.bg = e.target.value;
    document.getElementById('hex-bg').textContent = e.target.value;
    applyThemeToCanvas();
    saveToStorage();
  });

  document.getElementById('color-text').addEventListener('input', e => {
    state.theme.text = e.target.value;
    document.getElementById('hex-text').textContent = e.target.value;
    applyThemeToCanvas();
    saveToStorage();
  });

  document.getElementById('font-select').addEventListener('change', e => {
    state.theme.font = e.target.value;
    applyThemeToCanvas();
    renderCanvas();
    applyThemeToCanvas();
    saveToStorage();
  });

  document.querySelectorAll('.card-style-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.card-style-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.theme.cardStyle = btn.dataset.card;
      applyThemeToCanvas();
      saveToStorage();
    });
  });

  document.getElementById('dark-mode-toggle').addEventListener('change', e => {
    state.theme.darkMode = e.target.checked;
    if (e.target.checked) {
      // Switch to dark defaults if current bg looks light
      if (state.theme.bg.startsWith('#f') || state.theme.bg.startsWith('#e')) {
        state.theme.bg = '#0f0f13';
        state.theme.text = '#f0f0f0';
        document.getElementById('color-bg').value = '#0f0f13';
        document.getElementById('color-text').value = '#f0f0f0';
        document.getElementById('hex-bg').textContent = '#0f0f13';
        document.getElementById('hex-text').textContent = '#f0f0f0';
      }
    } else {
      if (!state.theme.bg.startsWith('#f')) {
        state.theme.bg = '#f8f8fc';
        state.theme.text = '#1a1a2e';
        document.getElementById('color-bg').value = '#f8f8fc';
        document.getElementById('color-text').value = '#1a1a2e';
        document.getElementById('hex-bg').textContent = '#f8f8fc';
        document.getElementById('hex-text').textContent = '#1a1a2e';
      }
    }
    applyThemeToCanvas();
    saveToStorage();
  });

  /* ── Accent presets ── */
  document.querySelectorAll('.preset-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      document.querySelectorAll('.preset-dot').forEach(d => d.classList.remove('selected'));
      dot.classList.add('selected');
      state.theme.primary = dot.dataset.color;
      document.getElementById('color-primary').value = dot.dataset.color;
      document.getElementById('hex-primary').textContent = dot.dataset.color;
      applyThemeToCanvas();
      saveToStorage();
    });
  });

  /* ── Templates ── */
  document.querySelectorAll('.use-template-btn').forEach(btn => {
    btn.addEventListener('click', () => applyTemplate(btn.dataset.template));
  });

  /* ── Export ── */
  document.getElementById('btn-export').addEventListener('click', exportToHTML);

  /* ── Preview ── */
  document.getElementById('btn-preview').addEventListener('click', showFullPreview);
  document.getElementById('close-preview').addEventListener('click', () => {
    document.getElementById('preview-overlay').style.display = 'none';
  });

  /* ── Modal close ── */
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('edit-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('edit-modal')) closeModal();
  });

  /* ── Undo / Redo ── */
  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-redo').addEventListener('click', redo);
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    if (e.key === 'Escape') closeModal();
  });

  /* ── Canvas click outside ── */
  document.getElementById('canvas').addEventListener('click', e => {
    if (e.target === document.getElementById('canvas') || e.target.id === 'empty-state') {
      state.selectedId = null;
      document.querySelectorAll('.section-wrapper').forEach(el => el.classList.remove('selected'));
      showSectionEditorPlaceholder();
    }
  });
}

/* ═══════════════════════════════════════════
   BOOT
═══════════════════════════════════════════ */

function init() {
  // Try to restore saved state
  const restored = loadFromStorage();

  // Wire all events
  initEvents();
  initDragAndDrop();

  // Render initial state
  renderCanvas();
  applyThemeToCanvas();
  syncThemePanel();

  if (restored && state.sections.length > 0) {
    toast('Progress restored ✓', 'success');
  } else {
    // Show welcome hint after a beat
    setTimeout(() => toast('Drag blocks in or pick a template to start', 'info'), 600);
  }
}

// Wait for DOM
document.addEventListener('DOMContentLoaded', init);
