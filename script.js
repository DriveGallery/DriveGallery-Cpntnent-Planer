/* =========================================================================
   DriveGallery Content Planner — script.js
   -------------------------------------------------------------------------
   ÜBERBLICK
   1) KONFIGURATION   — Supabase-Zugangsdaten & LocalStorage Keys
   2) DATENSCHICHT    — Abstraktion für Content-Einträge & Projekte (via Supabase)
   3) RENDERING        — Baut die HTML-Listen und Ansichten
   4) EVENT-HANDLING   — Navigation, Formulare, Filter, Status & Löschen
   ========================================================================= */

/* -------------------------------------------------------------------------
   1) KONFIGURATION
   ------------------------------------------------------------------------- */
const SUPABASE_URL = "https://ktibqwpsgkdzjolnanrm.supabase.co"; 
const SUPABASE_ANON_KEY = "sb_publishable_5gxX0pvn8zsi1mLIYhwfXQ_8W4cgcnH"; 
const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let supabaseClient = null;
if (USE_SUPABASE && window.supabase) {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

const LOCAL_STORAGE_KEY = "drivegallery_entries_v1";
const LOCAL_STORAGE_PROJECTS_KEY = "drivegallery_projects_v1";

/* -------------------------------------------------------------------------
   2) DATENSCHICHT (Content & Projekte über Supabase)
   ------------------------------------------------------------------------- */
const data = {
  // --- Content Einträge ---
  async getAll() {
    if (USE_SUPABASE && supabaseClient) {
      const { data: rows, error } = await supabaseClient
        .from("entries")
        .select("*")
        .order("date", { ascending: true });
      if (error) {
        console.error("Supabase-Fehler beim Laden (Entries):", error);
        return [];
      }
      return rows;
    }
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    const entries = raw ? JSON.parse(raw) : [];
    return entries.sort((a, b) => a.date.localeCompare(b.date));
  },

  async save(entry, id = null) {
    if (USE_SUPABASE && supabaseClient) {
      if (id) {
        const { error } = await supabaseClient.from("entries").update(entry).eq("id", id);
        if (error) console.error("Supabase-Fehler beim Aktualisieren (Entries):", error);
      } else {
        const { error } = await supabaseClient.from("entries").insert([entry]);
        if (error) console.error("Supabase-Fehler beim Speichern (Entries):", error);
      }
      return;
    }
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    const entries = raw ? JSON.parse(raw) : [];
    
    if (id) {
      const index = entries.findIndex(e => e.id === id);
      if (index !== -1) {
        entries[index] = { ...entries[index], ...entry };
      }
    } else {
      entries.push({
        ...entry,
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
      });
    }
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(entries));
  },

  async updateStatus(id, newStatus) {
    if (USE_SUPABASE && supabaseClient) {
      const { error } = await supabaseClient
        .from("entries")
        .update({ status: newStatus })
        .eq("id", id);
      if (error) console.error("Supabase-Fehler beim Status-Update (Entries):", error);
      return;
    }
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    const entries = raw ? JSON.parse(raw) : [];
    const updated = entries.map((e) => (e.id === id ? { ...e, status: newStatus } : e));
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
  },

  async remove(id) {
    if (USE_SUPABASE && supabaseClient) {
      const { error } = await supabaseClient.from("entries").delete().eq("id", id);
      if (error) console.error("Supabase-Fehler beim Löschen (Entries):", error);
      return;
    }
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    const entries = raw ? JSON.parse(raw) : [];
    const remaining = entries.filter((e) => e.id !== id);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(remaining));
  },

  // --- Projekte & Sonstige Ereignisse (über Supabase via entries-Tabelle) ---
  async getProjects() {
    const allEntries = await this.getAll();
    return allEntries.filter(e => e.type === 'project' || e.title);
  },

  async saveProject(project, id = null) {
    const projectData = {
      ...project,
      type: 'project',
      date: '2026-01-01', // Dummy-Datum für die Datenbank-Regel (Not Null)
      vehicle: project.title // Mapping für die vehicle-Spalte falls nötig
    };
    await this.save(projectData, id);
  },

  async updateProjectStatus(id, newStatus) {
    await this.updateStatus(id, newStatus);
  },

  async removeProject(id) {
    await this.remove(id);
  }
};

/* -------------------------------------------------------------------------
   Hilfsfunktionen
   ------------------------------------------------------------------------- */

const STATUS_CYCLE = ["Geplant", "Material fertig", "Gepostet"];
const PROJECT_STATUS_CYCLE = ["In Planung", "Umsetzung", "Erledigt"];

const MONTH_NAMES = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

function formatDateShort(isoDate) {
  if (!isoDate || isoDate === '2026-01-01') return "";
  const [y, m, d] = isoDate.split("-");
  return `${d}.${m}.`;
}

function monthKey(isoDate) {
  return isoDate ? isoDate.slice(0, 7) : "9999-99";
}

function monthLabel(key) {
  if (key === "9999-99") return "Ohne Datum";
  const [y, m] = key.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// --- KALENDER EXPORT ---
function downloadCalendarEvent(entry) {
  const dateStr = entry.date ? entry.date.replace(/-/g, '') : new Date().toISOString().slice(0,10).replace(/-/g, '');
  
  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    `SUMMARY:Content: ${entry.vehicle}`,
    `DESCRIPTION:Status: ${entry.status}\\nNotiz: ${entry.note || 'Keine'}\\nLink: ${entry.link || 'Keiner'}`,
    `DTSTART;VALUE=DATE:${dateStr}`,
    `DTEND;VALUE=DATE:${dateStr}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${entry.vehicle.replace(/\s+/g, '_')}_Post.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/* -------------------------------------------------------------------------
   3) RENDERING (Content & Projekte)
   ------------------------------------------------------------------------- */

let currentEntries = [];
let currentFilter = "alle";
let currentEditId = null;

let currentProjects = [];
let currentProjectFilter = "alle";
let currentEditProjectId = null;

let pendingDeleteId = null;
let pendingDeleteType = "entry";

async function loadAndRender() {
  const allData = await data.getAll();
  
  // Content filtern (alles was kein Projekt ist)
  currentEntries = allData.filter(e => e.type !== 'project' && !e.title);
  renderStats(currentEntries);
  renderList(currentEntries, currentFilter);

  // Projekte filtern
  currentProjects = allData.filter(e => e.type === 'project' || e.title);
  renderProjectList(currentProjects, currentProjectFilter);
}

function setupRealtime() {
  if (!USE_SUPABASE || !supabaseClient) return;

  supabaseClient
    .channel("drivegallery-entries")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "entries" },
      () => { loadAndRender(); }
    )
    .subscribe();
}

setupRealtime();

function renderStats(entries) {
  const counts = { Geplant: 0, "Material fertig": 0, Gepostet: 0 };
  entries.forEach((e) => { if (counts[e.status] !== undefined) counts[e.status]++; });

  document.getElementById("statGeplant").textContent = counts.Geplant;
  document.getElementById("statEntwurf").textContent = counts["Material fertig"];
  document.getElementById("statGepostet").textContent = counts.Gepostet;

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = entries
    .filter((e) => e.date >= today && e.status !== "Gepostet")
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  document.getElementById("statNext").textContent = upcoming ? formatDateShort(upcoming.date) : "—";
}

function renderList(entries, filter) {
  const listEl = document.getElementById("entryList");
  const emptyEl = document.getElementById("emptyState");

  const filtered = filter === "alle" ? entries : entries.filter((e) => e.status === filter);

  if (entries.length === 0) {
    listEl.innerHTML = "";
    emptyEl.hidden = false;
    emptyEl.querySelector(".empty__title").textContent = "Noch nichts geplant.";
    emptyEl.querySelector(".empty__sub").textContent = "Leg deinen ersten Post an — Datum, Fahrzeug und Typ reichen zum Start.";
    return;
  }

  if (filtered.length === 0) {
    listEl.innerHTML = "";
    emptyEl.hidden = false;
    emptyEl.querySelector(".empty__title").textContent = "Nichts in diesem Filter.";
    emptyEl.querySelector(".empty__sub").textContent = "Wechsle den Filter oder lege einen neuen Eintrag an.";
    return;
  }

  emptyEl.hidden = true;

  const groups = new Map();
  filtered.forEach((e) => {
    const key = monthKey(e.date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  });

  const sortedKeys = [...groups.keys()].sort();

  listEl.innerHTML = sortedKeys
    .map((key) => {
      const items = groups.get(key).sort((a, b) => (a.date || "").localeCompare(b.date || ""));
      return `
        <section class="month-group">
          <h2 class="month-group__title">${monthLabel(key)}</h2>
          ${items.map(renderEntry).join("")}
        </section>
      `;
    })
    .join("");
}

function renderEntry(e) {
  const link = e.link
    ? `<a class="entry__link" href="${escapeHtml(e.link)}" target="_blank" rel="noopener noreferrer">Insta Inspiration ↗</a>`
    : "";
  const note = e.note ? `<p class="entry__note"><strong>Notiz:</strong> ${escapeHtml(e.note)}</p>` : "";

  const hasDetails = e.note || e.link;
  const detailsHtml = hasDetails ? `
    <div class="entry__details">
      ${note}
      ${link}
    </div>
  ` : "";

  return `
    <article class="entry" data-id="${e.id}">
      <div class="entry__date">${formatDateShort(e.date)}</div>
      <div class="entry__main" title="Klicken zum Öffnen/Schließen">
        <div class="entry__title-row">
          <span class="entry__vehicle">${escapeHtml(e.vehicle)}</span>
          ${hasDetails ? '<span style="font-size: 11px; color: var(--text-faint); margin-left: 6px;">▼ Details</span>' : ''}
        </div>
        ${detailsHtml}
      </div>
      <div class="entry__side">
        <button class="status-label" data-status="${e.status}" data-id="${e.id}" title="Klicken zum Wechseln">
          ${e.status}
        </button>
        <div style="display: flex; gap: 4px; align-items: center; margin-top: 4px;">
          <button class="btn--icon edit-btn" data-edit-id="${e.id}" title="Bearbeiten">✏️</button>
          <button class="btn--icon cal-btn" data-cal-id="${e.id}" title="Zum Kalender">📅</button>
          <button class="btn--icon" data-delete-id="${e.id}" title="Löschen">✕</button>
        </div>
      </div>
    </article>
  `;
}

// --- Projekte Rendern ---
function renderProjectList(projects, filter) {
  const listEl = document.getElementById("projectList");
  const emptyEl = document.getElementById("projectEmptyState");

  const filtered = filter === "alle" ? projects : projects.filter((p) => p.status === filter);

  if (projects.length === 0) {
    listEl.innerHTML = "";
    emptyEl.hidden = false;
    return;
  }

  if (filtered.length === 0) {
    listEl.innerHTML = "";
    emptyEl.hidden = false;
    emptyEl.querySelector(".empty__title").textContent = "Nichts in diesem Filter.";
    emptyEl.querySelector(".empty__sub").textContent = "Wechsle den Filter oder lege ein neues Projekt an.";
    return;
  }

  emptyEl.hidden = true;

  listEl.innerHTML = filtered.map(renderProjectItem).join("");
}

function renderProjectItem(p) {
  const displayTitle = p.title || p.vehicle;
  const note = p.note ? `<p class="entry__note"><strong>Notiz:</strong> ${escapeHtml(p.note)}</p>` : "";
  const brainstorm = p.brainstorm ? `<p class="entry__note" style="color: var(--accent-strong);">🧠 <strong>Brainstorming:</strong> ${escapeHtml(p.brainstorm)}</p>` : "";

  const hasDetails = p.note || p.brainstorm;
  const detailsHtml = hasDetails ? `
    <div class="entry__details">
      ${note}
      ${brainstorm}
    </div>
  ` : "";

  return `
    <article class="entry" data-project-id="${p.id}" style="grid-template-columns: 1fr auto;">
      <div class="entry__main" title="Klicken zum Öffnen/Schließen">
        <div class="entry__title-row">
          <span class="entry__vehicle">${escapeHtml(displayTitle)}</span>
          ${hasDetails ? '<span style="font-size: 11px; color: var(--text-faint); margin-left: 6px;">▼ Details</span>' : ''}
        </div>
        ${detailsHtml}
      </div>
      <div class="entry__side">
        <button class="status-label project-status-label" data-project-status="${p.status}" data-id="${p.id}" title="Klicken zum Wechseln">
          ${p.status}
        </button>
        <div style="display: flex; gap: 4px; align-items: center; margin-top: 4px;">
          <button class="btn--icon edit-proj-btn" data-edit-project-id="${p.id}" title="Bearbeiten">✏️</button>
          <button class="btn--icon delete-proj-btn" data-delete-project-id="${p.id}" title="Löschen">✕</button>
        </div>
      </div>
    </article>
  `;
}

/* -------------------------------------------------------------------------
   4) EVENT-HANDLING
   ------------------------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", () => {
  const syncDot = document.getElementById("syncDot");
  const syncLabel = document.getElementById("syncLabel");
  if (USE_SUPABASE && supabaseClient) {
    syncDot.classList.add("is-cloud");
    syncLabel.textContent = "Cloud-Sync aktiv";
  } else {
    syncLabel.textContent = "Nur lokal auf diesem Gerät gespeichert";
  }

  loadAndRender();

  // --- ANSICHTEN WECHSELN ---
  const contentView = document.getElementById("contentView");
  const projectsView = document.getElementById("projectsView");
  const navContentBtn = document.getElementById("navContentBtn");
  const navProjectsBtn = document.getElementById("navProjectsBtn");

  navContentBtn.addEventListener("click", () => {
    contentView.hidden = false;
    projectsView.hidden = true;
    navContentBtn.className = "btn btn--accent";
    navProjectsBtn.className = "btn btn--ghost";
  });

  navProjectsBtn.addEventListener("click", () => {
    contentView.hidden = true;
    projectsView.hidden = false;
    navProjectsBtn.className = "btn btn--accent";
    navContentBtn.className = "btn btn--ghost";
  });

  // --- CONTENT FORMULAR ---
  const formPanel = document.getElementById("formPanel");
  const openFormBtn = document.getElementById("openFormBtn");
  const cancelFormBtn = document.getElementById("cancelFormBtn");
  const entryForm = document.getElementById("entryForm");

  openFormBtn.addEventListener("click", () => {
    currentEditId = null;
    entryForm.reset();
    formPanel.hidden = !formPanel.hidden;
    if (!formPanel.hidden) document.getElementById("fieldDate").focus();
  });

  cancelFormBtn.addEventListener("click", () => {
    entryForm.reset();
    formPanel.hidden = true;
    currentEditId = null;
  });

  entryForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const entryData = {
      date: document.getElementById("fieldDate").value,
      status: document.getElementById("fieldStatus").value,
      vehicle: document.getElementById("fieldVehicle").value.trim(),
      link: document.getElementById("fieldLink").value.trim(),
      note: document.getElementById("fieldNote").value.trim(),
      type: "content"
    };

    if (!entryData.date || !entryData.vehicle) return;

    await data.save(entryData, currentEditId);
    entryForm.reset();
    formPanel.hidden = true;
    currentEditId = null;
    await loadAndRender();
  });

  // --- PROJEKT FORMULAR ---
  const projectFormPanel = document.getElementById("projectFormPanel");
  const openProjectFormBtn = document.getElementById("openProjectFormBtn");
  const cancelProjectFormBtn = document.getElementById("cancelProjectFormBtn");
  const projectForm = document.getElementById("projectForm");

  openProjectFormBtn.addEventListener("click", () => {
    currentEditProjectId = null;
    projectForm.reset();
    projectFormPanel.hidden = !projectFormPanel.hidden;
    if (!projectFormPanel.hidden) document.getElementById("fieldProjTitle").focus();
  });

  cancelProjectFormBtn.addEventListener("click", () => {
    projectForm.reset();
    projectFormPanel.hidden = true;
    currentEditProjectId = null;
  });

  projectForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const projectData = {
      title: document.getElementById("fieldProjTitle").value.trim(),
      status: document.getElementById("fieldProjStatus").value,
      note: document.getElementById("fieldProjNote").value.trim(),
      brainstorm: document.getElementById("fieldProjBrainstorm").value.trim(),
    };

    if (!projectData.title) return;

    await data.saveProject(projectData, currentEditProjectId);
    projectForm.reset();
    projectFormPanel.hidden = true;
    currentEditProjectId = null;
    await loadAndRender();
  });

  // --- FILTER TABS (Content) ---
  const tabs = document.querySelectorAll("#filterTabs .tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => { t.classList.remove("is-active"); t.setAttribute("aria-selected", "false"); });
      tab.classList.add("is-active");
      tab.setAttribute("aria-selected", "true");
      currentFilter = tab.dataset.filter;
      renderList(currentEntries, currentFilter);
    });
  });

  // --- FILTER TABS (Projekte) ---
  const projectTabs = document.querySelectorAll("#projectFilterTabs .tab");
  projectTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      projectTabs.forEach((t) => { t.classList.remove("is-active"); t.setAttribute("aria-selected", "false"); });
      tab.classList.add("is-active");
      tab.setAttribute("aria-selected", "true");
      currentProjectFilter = tab.dataset.filter;
      renderProjectList(currentProjects, currentProjectFilter);
    });
  });

  // --- LISTEN KLICKS (Content) ---
  const listEl = document.getElementById("entryList");
  listEl.addEventListener("click", async (ev) => {
    const mainArea = ev.target.closest(".entry__main");
    if (mainArea && !ev.target.closest("a")) {
      const article = mainArea.closest(".entry");
      article.classList.toggle("is-expanded");
      return;
    }

    const statusBtn = ev.target.closest(".status-label");
    if (statusBtn) {
      const id = statusBtn.dataset.id;
      const current = statusBtn.dataset.status;
      const nextIndex = (STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length;
      await data.updateStatus(id, STATUS_CYCLE[nextIndex]);
      await loadAndRender();
      return;
    }

    const editBtn = ev.target.closest("[data-edit-id]");
    if (editBtn) {
      const id = editBtn.dataset.editId;
      const entryToEdit = currentEntries.find(e => e.id == id);
      if (entryToEdit) {
        currentEditId = id;
        document.getElementById("fieldDate").value = entryToEdit.date || "";
        document.getElementById("fieldStatus").value = entryToEdit.status || "Geplant";
        document.getElementById("fieldVehicle").value = entryToEdit.vehicle || "";
        document.getElementById("fieldLink").value = entryToEdit.link || "";
        document.getElementById("fieldNote").value = entryToEdit.note || "";
        formPanel.hidden = false;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }

    const calBtn = ev.target.closest("[data-cal-id]");
    if (calBtn) {
      const entryToExport = currentEntries.find(e => e.id == calBtn.dataset.calId);
      if (entryToExport) downloadCalendarEvent(entryToExport);
      return;
    }

    const deleteBtn = ev.target.closest("[data-delete-id]");
    if (deleteBtn) {
      pendingDeleteId = deleteBtn.dataset.deleteId;
      pendingDeleteType = "entry";
      document.getElementById("confirmDialog").hidden = false;
    }
  });

  // --- LISTEN KLICKS (Projekte) ---
  const projectListEl = document.getElementById("projectList");
  projectListEl.addEventListener("click", async (ev) => {
    const mainArea = ev.target.closest(".entry__main");
    if (mainArea) {
      const article = mainArea.closest(".entry");
      article.classList.toggle("is-expanded");
      return;
    }

    const statusBtn = ev.target.closest(".project-status-label");
    if (statusBtn) {
      const id = statusBtn.dataset.id;
      const current = statusBtn.dataset.projectStatus;
      const nextIndex = (PROJECT_STATUS_CYCLE.indexOf(current) + 1) % PROJECT_STATUS_CYCLE.length;
      await data.updateProjectStatus(id, PROJECT_STATUS_CYCLE[nextIndex]);
      await loadAndRender();
      return;
    }

    const editBtn = ev.target.closest("[data-edit-project-id]");
    if (editBtn) {
      const id = editBtn.dataset.editProjectId;
      const projectToEdit = currentProjects.find(p => p.id == id);
      if (projectToEdit) {
        currentEditProjectId = id;
        document.getElementById("fieldProjTitle").value = projectToEdit.title || projectToEdit.vehicle || "";
        document.getElementById("fieldProjStatus").value = projectToEdit.status || "In Planung";
        document.getElementById("fieldProjNote").value = projectToEdit.note || "";
        document.getElementById("fieldProjBrainstorm").value = projectToEdit.brainstorm || "";
        projectFormPanel.hidden = false;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }

    const deleteBtn = ev.target.closest("[data-delete-project-id]");
    if (deleteBtn) {
      pendingDeleteId = deleteBtn.dataset.deleteProjectId;
      pendingDeleteType = "project";
      document.getElementById("confirmDialog").hidden = false;
    }
  });

  // --- LÖSCH-BESTÄTIGUNG ---
  const confirmDialog = document.getElementById("confirmDialog");
  document.getElementById("confirmCancel").addEventListener("click", () => {
    pendingDeleteId = null;
    confirmDialog.hidden = true;
  });

  document.getElementById("confirmDelete").addEventListener("click", async () => {
    if (pendingDeleteId) {
      if (pendingDeleteType === "entry") {
        await data.remove(pendingDeleteId);
      } else {
        await data.removeProject(pendingDeleteId);
      }
      pendingDeleteId = null;
      await loadAndRender();
    }
    confirmDialog.hidden = true;
  });

  confirmDialog.addEventListener("click", (ev) => {
    if (ev.target === confirmDialog) {
      pendingDeleteId = null;
      confirmDialog.hidden = true;
    }
  });
});
