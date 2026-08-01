// ===== STATE =====
let db = { masterCode: '', resources: [] };
let currentView = 'grid'; // grid | timeline | favorites
let activeCategory = '';
let currentDetail = null;

// ===== INIT =====
async function init() {
  try {
    const res = await fetch('db.json?' + Date.now());
    db = await res.json();
  } catch(e) {
    db = {
      masterCode: 'NODE-MSTR-KEY-001',
      resources: [
        { code: 'NODE-X7K2-9M1A', type: 'link', title: 'Python Documentation', url: 'https://docs.python.org', description: 'Official Python documentation.', notes: '', category: 'Development', tags: ['python','docs'], favorite: true, createdAt: '2025-01-15', modifiedAt: '2025-01-20' },
        { code: 'NODE-T4P9-RK2V', type: 'note', title: 'Architecture Notes', content: 'Static-first approach.\nNo build step.', category: 'Notes', tags: ['architecture','design'], favorite: false, createdAt: '2025-01-18', modifiedAt: '2025-01-18' }
      ]
    };
  }
  checkHash();
}

function checkHash() {
  const hash = window.location.hash.replace('#', '').trim();
  if (hash) {
    document.getElementById('codeInput').value = hash;
    submitCode();
  }
}

// ===== CODE SUBMISSION =====
function submitCode() {
  const code = document.getElementById('codeInput').value.trim().toUpperCase();
  document.getElementById('errorMsg').textContent = '';

  if (!code) {
    document.getElementById('errorMsg').textContent = 'Enter an archive code.';
    return;
  }

  if (code === db.masterCode) {
    showValidation(true);
    setTimeout(() => { hideValidation(); enterArchive(); }, 2200);
    return;
  }

  const resource = db.resources.find(r => r.code === code);
  if (resource) {
    showValidation(false);
    setTimeout(() => { hideValidation(); enterArchive(); openDetail(resource); }, 2200);
    return;
  }

  document.getElementById('errorMsg').textContent = 'No record found for this code.';
}

// ===== VALIDATION =====
function showValidation(isMaster) {
  const overlay = document.getElementById('validationOverlay');
  const text = document.getElementById('valText');
  const sub = document.getElementById('valSub');
  const steps = document.querySelectorAll('.vstep');
  overlay.classList.add('active');
  steps.forEach(s => { s.className = 'vstep'; });

  if (isMaster) {
    text.textContent = 'Authenticating Archivist';
    sub.textContent = 'Master clearance verification...';
  } else {
    text.textContent = 'Unsealing Record';
    sub.textContent = 'Retrieving from the archive...';
  }

  setTimeout(() => { steps[0].className = 'vstep active'; }, 300);
  setTimeout(() => { steps[0].className = 'vstep done'; steps[1].className = 'vstep active'; }, 1000);
  setTimeout(() => { steps[1].className = 'vstep done'; steps[2].className = 'vstep active'; }, 1700);
  setTimeout(() => { steps[2].className = 'vstep done'; }, 2200);
}

function hideValidation() {
  document.getElementById('validationOverlay').classList.remove('active');
}

// ===== ENTER ARCHIVE =====
function enterArchive() {
  document.getElementById('landingPage').style.display = 'none';
  document.getElementById('archiveView').classList.add('active');
  updateHeader();
  renderArchive();
  renderSidebar();
}

// ===== HEADER =====
function updateHeader() {
  document.getElementById('headerCount').textContent = `${db.resources.length} artifact${db.resources.length !== 1 ? 's' : ''}`;
}

// ===== SIDEBAR =====
function renderSidebar() {
  const categories = [...new Set(db.resources.map(r => r.category).filter(Boolean))].sort();
  const allTags = [...new Set(db.resources.flatMap(r => r.tags || []))].sort();

  document.getElementById('categoryList').innerHTML = categories.map(c =>
    `<button class="category-tag ${activeCategory === c ? 'active' : ''}" onclick="filterCategory('${escAttr(c)}')">${esc(c)}</button>`
  ).join('') || '<span style="color:#555;font-size:0.75rem">None</span>';

  document.getElementById('tagList').innerHTML = allTags.map(t =>
    `<span style="display:inline-block;font-size:0.65rem;color:#9ca3af;letter-spacing:1px;padding:2px 8px;margin:2px;border:1px solid rgba(255,255,255,0.06);cursor:pointer;transition:color 0.2s" onclick="searchTag('${escAttr(t)}')">${esc(t)}</span>`
  ).join('') || '<span style="color:#555;font-size:0.75rem">None</span>';

  const links = db.resources.filter(r => r.type === 'link').length;
  const notes = db.resources.filter(r => r.type === 'note').length;
  const favs = db.resources.filter(r => r.favorite).length;

  document.getElementById('statsBlock').innerHTML = `
    <div class="stat-row"><span>Artifacts</span><span>${db.resources.length}</span></div>
    <div class="stat-row"><span>Links</span><span>${links}</span></div>
    <div class="stat-row"><span>Notes</span><span>${notes}</span></div>
    <div class="stat-row"><span>Categories</span><span>${categories.length}</span></div>
    <div class="stat-row"><span>Favorites</span><span>${favs}</span></div>
  `;
}

// ===== ARCHIVE RENDER =====
function renderArchive() {
  const query = document.getElementById('searchInput').value.toLowerCase().trim();
  const grid = document.getElementById('archiveGrid');
  const empty = document.getElementById('archiveEmpty');

  let filtered = [...db.resources];

  // Filter by category
  if (activeCategory) {
    filtered = filtered.filter(r => r.category === activeCategory);
  }

  // Filter by view
  if (currentView === 'favorites') {
    filtered = filtered.filter(r => r.favorite);
  }

  // Search
  if (query) {
    filtered = filtered.filter(r =>
      (r.title || '').toLowerCase().includes(query) ||
      (r.code || '').toLowerCase().includes(query) ||
      (r.description || '').toLowerCase().includes(query) ||
      (r.notes || '').toLowerCase().includes(query) ||
      (r.content || '').toLowerCase().includes(query) ||
      (r.category || '').toLowerCase().includes(query) ||
      (r.tags || []).some(t => t.toLowerCase().includes(query)) ||
      (r.url || '').toLowerCase().includes(query)
    );
  }

  document.getElementById('resultCount').textContent =
    `Showing ${filtered.length} of ${db.resources.length} artifacts`;

  if (filtered.length === 0) {
    grid.innerHTML = '';
    empty.classList.add('show');
    return;
  }
  empty.classList.remove('show');

  if (currentView === 'timeline') {
    renderTimeline(filtered, grid);
  } else {
    renderGrid(filtered, grid);
  }
}

function renderGrid(items, grid) {
  grid.innerHTML = items.map(r => `
    <div class="artifact-card ${r.favorite ? 'favorite' : ''}" onclick="openDetailByCode('${escAttr(r.code)}')">
      <div class="artifact-code">${esc(r.code)}</div>
      <div class="artifact-type ${r.type === 'link' ? 'link-type' : 'note-type'}">${r.type === 'link' ? '⟐ LINK' : '⟐ NOTE'}</div>
      <div class="artifact-title">${esc(r.title)}</div>
      ${r.type === 'link' && r.description ? `<div class="artifact-desc">${esc(r.description)}</div>` : ''}
      ${r.type === 'note' && r.content ? `<div class="artifact-desc">${esc(r.content.substring(0, 100))}${r.content.length > 100 ? '...' : ''}</div>` : ''}
      <div class="artifact-meta">
        <span class="artifact-date">${r.createdAt}</span>
        <button class="artifact-fav ${r.favorite ? 'active' : ''}" onclick="event.stopPropagation();toggleFavorite('${escAttr(r.code)}')">${r.favorite ? '★' : '☆'}</button>
      </div>
    </div>
  `).join('');
}

function renderTimeline(items, grid) {
  const grouped = {};
  items.forEach(r => {
    const year = (r.createdAt || '').substring(0, 4) || 'Unknown';
    if (!grouped[year]) grouped[year] = [];
    grouped[year].push(r);
  });
  const years = Object.keys(grouped).sort().reverse();

  grid.innerHTML = years.map(year => `
    <div class="timeline-year">
      <div class="timeline-year-header">${year}</div>
      <div class="timeline-items">
        ${grouped[year].map(r => `
          <div class="artifact-card ${r.favorite ? 'favorite' : ''}" onclick="openDetailByCode('${escAttr(r.code)}')">
            <div class="artifact-code">${esc(r.code)}</div>
            <div class="artifact-type ${r.type === 'link' ? 'link-type' : 'note-type'}">${r.type === 'link' ? '⟐ LINK' : '⟐ NOTE'}</div>
            <div class="artifact-title">${esc(r.title)}</div>
            <div class="artifact-meta">
              <span class="artifact-date">${r.createdAt}</span>
              <button class="artifact-fav ${r.favorite ? 'active' : ''}" onclick="event.stopPropagation();toggleFavorite('${escAttr(r.code)}')">${r.favorite ? '★' : '☆'}</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

// ===== VIEW CONTROLS =====
function setView(view) {
  currentView = view;
  document.querySelectorAll('.sidebar-link').forEach(el => el.classList.remove('active'));
  const map = { grid: 'viewGrid', timeline: 'viewTimeline', favorites: 'viewFavs' };
  const btn = document.getElementById(map[view]);
  if (btn) btn.classList.add('active');

  const favHeader = document.getElementById('favBtn');
  if (view === 'favorites') {
    favHeader.classList.add('active');
  } else {
    favHeader.classList.remove('active');
  }

  renderArchive();
}

function filterCategory(category) {
  activeCategory = activeCategory === category ? '' : category;
  renderSidebar();
  renderArchive();
}

function searchTag(tag) {
  document.getElementById('searchInput').value = tag;
  renderArchive();
}

function clearSearch() {
  document.getElementById('searchInput').value = '';
  renderArchive();
}

function showFavorites() {
  setView(currentView === 'favorites' ? 'grid' : 'favorites');
}

// ===== FAVORITES =====
function toggleFavorite(code) {
  const r = db.resources.find(r => r.code === code);
  if (r) {
    r.favorite = !r.favorite;
    renderArchive();
    renderSidebar();
    toast(r.favorite ? 'Added to favorites' : 'Removed from favorites');
  }
}

// ===== RANDOM ARTIFACT =====
function randomArtifact() {
  if (db.resources.length === 0) {
    toast('The archive is empty.');
    return;
  }
  const r = db.resources[Math.floor(Math.random() * db.resources.length)];
  openDetail(r);
  toast(`Discovering artifact: ${r.code}`);
}

// ===== DETAIL VIEW =====
function openDetailByCode(code) {
  const r = db.resources.find(r => r.code === code);
  if (r) openDetail(r);
}

function openDetail(resource) {
  currentDetail = resource;
  const overlay = document.getElementById('detailOverlay');
  const card = document.getElementById('detailCard');

  if (resource.type === 'link') {
    card.innerHTML = `
      <button class="detail-close" onclick="closeDetail()">✕</button>
      <div class="detail-code">${esc(resource.code)}</div>
      <div class="detail-type link-type" style="color:#22c55e">⟐ LINK</div>
      <div class="detail-title">${esc(resource.title)}</div>
      <a class="detail-url" href="${escAttr(resource.url)}" target="_blank">${esc(resource.url)}</a>
      ${resource.description ? `<div class="detail-desc">${esc(resource.description)}</div>` : ''}
      ${resource.notes ? `<div class="detail-notes">${esc(resource.notes)}</div>` : ''}
      <a class="detail-btn" href="${escAttr(resource.url)}" target="_blank">Open Resource</a>
      <div class="detail-meta">
        <span>Created: ${resource.createdAt}</span>
        <span>Modified: ${resource.modifiedAt}</span>
        ${resource.category ? `<span>Category: ${esc(resource.category)}</span>` : ''}
      </div>
    `;
  } else {
    card.innerHTML = `
      <button class="detail-close" onclick="closeDetail()">✕</button>
      <div class="detail-code">${esc(resource.code)}</div>
      <div class="detail-type note-type" style="color:#3b82f6">⟐ NOTE</div>
      <div class="detail-title">${esc(resource.title)}</div>
      <div class="detail-content">${esc(resource.content)}</div>
      <div class="detail-meta">
        <span>Created: ${resource.createdAt}</span>
        <span>Modified: ${resource.modifiedAt}</span>
        ${resource.category ? `<span>Category: ${esc(resource.category)}</span>` : ''}
      </div>
    `;
  }

  overlay.classList.add('active');
}

function closeDetail() {
  document.getElementById('detailOverlay').classList.remove('active');
  currentDetail = null;
}

// ===== ADMIN =====
function openAdmin() {
  const overlay = document.getElementById('adminOverlay');
  overlay.classList.add('active');
  renderAdmin();
}

function closeAdmin() {
  document.getElementById('adminOverlay').classList.remove('active');
}

function renderAdmin() {
  const links = db.resources.filter(r => r.type === 'link').length;
  const notes = db.resources.filter(r => r.type === 'note').length;
  const favs = db.resources.filter(r => r.favorite).length;
  const cats = [...new Set(db.resources.map(r => r.category).filter(Boolean))].length;

  document.getElementById('adminStats').innerHTML = `
    <div class="admin-stat"><div class="admin-stat-num">${db.resources.length}</div><div class="admin-stat-label">Artifacts</div></div>
    <div class="admin-stat"><div class="admin-stat-num">${links}</div><div class="admin-stat-label">Links</div></div>
    <div class="admin-stat"><div class="admin-stat-num">${notes}</div><div class="admin-stat-label">Notes</div></div>
    <div class="admin-stat"><div class="admin-stat-num">${cats}</div><div class="admin-stat-label">Categories</div></div>
    <div class="admin-stat"><div class="admin-stat-num">${favs}</div><div class="admin-stat-label">Favorites</div></div>
  `;

  document.getElementById('adminList').innerHTML = db.resources.map(r => `
    <div class="admin-list-item">
      <span class="admin-item-code">${esc(r.code)}</span>
      <span class="admin-item-title">${esc(r.title)}</span>
      <span class="admin-item-type" style="color:${r.type === 'link' ? '#22c55e' : '#3b82f6'};border-color:${r.type === 'link' ? 'rgba(34,197,94,0.3)' : 'rgba(59,130,246,0.3)'}">${r.type.toUpperCase()}</span>
      <div class="admin-item-actions">
        <button class="admin-icon-btn" onclick="copyCode('${escAttr(r.code)}')" title="Copy code">📋</button>
        <button class="admin-icon-btn" onclick="adminEdit('${escAttr(r.code)}')" title="Edit">✏</button>
        <button class="admin-icon-btn danger" onclick="adminDelete('${escAttr(r.code)}')" title="Delete">✕</button>
      </div>
    </div>
  `).join('');
}

// ===== ADMIN: ADD =====
function openAddModal(type) {
  const code = generateCode(type);
  const now = new Date().toISOString().split('T')[0];

  document.getElementById('modalContent').innerHTML = `
    <h3>Add ${type === 'link' ? 'Link' : 'Note'}</h3>
    <div class="form-group">
      <label>Archive Code</label>
      <input id="formCode" value="${code}" readonly style="opacity:0.6">
    </div>
    <div class="form-group">
      <label>Title</label>
      <input id="formTitle" placeholder="Artifact title">
    </div>
    <div class="form-group">
      <label>Category</label>
      <input id="formCategory" placeholder="e.g. Development, Research, Notes">
    </div>
    <div class="form-group">
      <label>Tags (comma separated)</label>
      <input id="formTags" placeholder="e.g. python, docs, reference">
    </div>
    ${type === 'link' ? `
    <div class="form-group"><label>URL</label><input id="formUrl" placeholder="https://..."></div>
    <div class="form-group"><label>Description</label><textarea id="formDesc"></textarea></div>
    <div class="form-group"><label>Notes</label><textarea id="formNotes"></textarea></div>
    ` : `
    <div class="form-group"><label>Content</label><textarea id="formContent" style="min-height:200px"></textarea></div>
    `}
    <div class="modal-actions">
      <button class="modal-btn" onclick="saveNew('${type}')">Save to Archive</button>
      <button class="modal-btn secondary" onclick="closeModal()">Cancel</button>
    </div>
  `;
  document.getElementById('modalOverlay').classList.add('active');
}

function saveNew(type) {
  const code = document.getElementById('formCode').value.trim();
  const title = document.getElementById('formTitle').value.trim();
  if (!title) return toast('Title is required.');

  if (db.resources.find(r => r.code === code)) {
    toast('Code collision. Generating new code...');
    document.getElementById('formCode').value = generateCode(type);
    return;
  }

  const now = new Date().toISOString().split('T')[0];
  const tags = document.getElementById('formTags').value.split(',').map(t => t.trim()).filter(Boolean);
  const base = { code, title, tags, favorite: false, createdAt: now, modifiedAt: now };
  base.category = document.getElementById('formCategory').value.trim() || 'Uncategorized';

  if (type === 'link') {
    const url = document.getElementById('formUrl').value.trim();
    if (!url) return toast('URL is required.');
    base.url = url.startsWith('http') ? url : 'https://' + url;
    base.description = document.getElementById('formDesc').value.trim();
    base.notes = document.getElementById('formNotes').value.trim();
  } else {
    base.content = document.getElementById('formContent').value.trim() || '—';
  }

  base.type = type;
  db.resources.push(base);
  closeModal();
  renderAdmin();
  renderArchive();
  renderSidebar();
  updateHeader();
  toast('Artifact added to the archive.');
}

// ===== ADMIN: EDIT =====
function adminEdit(code) {
  const r = db.resources.find(r => r.code === code);
  if (!r) return;
  const tags = (r.tags || []).join(', ');

  document.getElementById('modalContent').innerHTML = `
    <h3>Edit Artifact</h3>
    <div class="form-group"><label>Code</label><input value="${esc(r.code)}" readonly style="opacity:0.6"></div>
    <div class="form-group"><label>Title</label><input id="formTitle" value="${esc(r.title)}"></div>
    <div class="form-group"><label>Category</label><input id="formCategory" value="${esc(r.category || '')}"></div>
    <div class="form-group"><label>Tags</label><input id="formTags" value="${esc(tags)}"></div>
    ${r.type === 'link' ? `
    <div class="form-group"><label>URL</label><input id="formUrl" value="${esc(r.url || '')}"></div>
    <div class="form-group"><label>Description</label><textarea id="formDesc">${esc(r.description || '')}</textarea></div>
    <div class="form-group"><label>Notes</label><textarea id="formNotes">${esc(r.notes || '')}</textarea></div>
    ` : `
    <div class="form-group"><label>Content</label><textarea id="formContent" style="min-height:200px">${esc(r.content || '')}</textarea></div>
    `}
    <div class="modal-actions">
      <button class="modal-btn" onclick="saveEdit('${escAttr(code)}')">Update</button>
      <button class="modal-btn secondary" onclick="closeModal()">Cancel</button>
    </div>
  `;
  document.getElementById('modalOverlay').classList.add('active');
}

function saveEdit(code) {
  const r = db.resources.find(r => r.code === code);
  if (!r) return;

  const title = document.getElementById('formTitle').value.trim();
  if (!title) return toast('Title is required.');

  r.title = title;
  r.category = document.getElementById('formCategory').value.trim() || 'Uncategorized';
  r.tags = document.getElementById('formTags').value.split(',').map(t => t.trim()).filter(Boolean);
  r.modifiedAt = new Date().toISOString().split('T')[0];

  if (r.type === 'link') {
    const url = document.getElementById('formUrl').value.trim();
    if (!url) return toast('URL is required.');
    r.url = url.startsWith('http') ? url : 'https://' + url;
    r.description = document.getElementById('formDesc').value.trim();
    r.notes = document.getElementById('formNotes').value.trim();
  } else {
    r.content = document.getElementById('formContent').value.trim() || '—';
  }

  closeModal();
  renderAdmin();
  renderArchive();
  renderSidebar();
  toast('Artifact updated.');
}

// ===== ADMIN: DELETE =====
function adminDelete(code) {
  if (!confirm(`Remove artifact ${code} from the archive?`)) return;
  db.resources = db.resources.filter(r => r.code !== code);
  renderAdmin();
  renderArchive();
  renderSidebar();
  updateHeader();
  toast('Artifact removed.');
}

// ===== ADMIN: EXPORT / IMPORT =====
function exportDB() {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'db.json';
  a.click();
  toast('Archive exported.');
}

function importDB(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.masterCode && Array.isArray(data.resources)) {
        db = data;
        renderAdmin();
        renderArchive();
        renderSidebar();
        updateHeader();
        toast('Archive imported successfully.');
      } else {
        toast('Invalid archive file.');
      }
    } catch(err) {
      toast('Error parsing file.');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ===== CODE GENERATION =====
function generateCode(type) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const p1 = Array.from({length: 4}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const p2 = Array.from({length: 4}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const code = `NODE-${p1}-${p2}`;
  if (db.resources.find(r => r.code === code)) return generateCode(type);
  return code;
}

// ===== COPY =====
function copyCode(code) {
  navigator.clipboard.writeText(code).then(() => toast('Code copied: ' + code));
}

// ===== MODAL =====
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
}

// ===== TOAST =====
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

// ===== UTILITY =====
function esc(s) {
  if (typeof s !== 'string') return s || '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function escAttr(s) {
  return (s || '').replace(/['"]/g, '');
}

// ===== KEYBOARD =====
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.getElementById('landingPage').style.display !== 'none') {
    submitCode();
  }
  if (e.key === 'Escape') {
    if (document.getElementById('modalOverlay').classList.contains('active')) closeModal();
    else if (document.getElementById('adminOverlay').classList.contains('active')) closeAdmin();
    else if (document.getElementById('detailOverlay').classList.contains('active')) closeDetail();
  }
});

// ===== START =====
init();
