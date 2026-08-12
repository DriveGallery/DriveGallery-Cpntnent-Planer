/* =========================================================================
   DriveGallery Content Planner — script.js
   -------------------------------------------------------------------------
   ÜBERBLICK
   1) KONFIGURATION   — hier tragt ihr eure Supabase-Zugangsdaten ein
   2) DATENSCHICHT     — abstrahiert localStorage vs. Supabase, damit der
                          Rest des Codes nicht wissen muss, woher die Daten
                          kommen
   3) RENDERING         — baut die HTML-Liste aus den Daten
   4) EVENT-HANDLING    — Formular, Filter, Status-Klick, Löschen
   ========================================================================= */

/* -------------------------------------------------------------------------
   1) KONFIGURATION
   -------------------------------------------------------------------------
   Wenn ihr Phase 2 (Cloud-Sync über Supabase) nutzen wollt:
   - Tragt hier eure Projekt-URL und den "anon"-Key ein (siehe README.md).
   - Lasst beide Felder leer ("" ), um ausschließlich lokal (localStorage)
     zu arbeiten — das funktioniert sofort ohne Konto.
   ------------------------------------------------------------------------- */
const SUPABASE_URL = "https://ktibqwpsgkdzjolnanrm.supabase.co";       // z. B. "https://xxxxx.supabase.co"
const SUPABASE_ANON_KEY = "sb_publishable_5gxX0pvn8zsi1mLIYhwfXQ_8W4cgcnH";  // z. B. "eyJhbGciOi..."
const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// Supabase-Client wird nur erzeugt, wenn Zugangsdaten hinterlegt sind
let supabaseClient = null;
if (USE_SUPABASE && window.supabase) {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

const LOCAL_STORAGE_KEY = "drivegallery_entries_v1";

/* -------------------------------------------------------------------------
   2) DATENSCHICHT
   -------------------------------------------------------------------------
   Jede Funktion gibt es in zwei Varianten (local / cloud). Der Rest der App
   ruft immer nur die "data.*"-Funktionen auf und muss den Unterschied nicht
   kennen. So könnt ihr später jederzeit zwischen den beiden Modi wechseln,
   ohne den restlichen Code anzufassen.
   ------------------------------------------------------------------------- */
const data = {

  // Alle Einträge laden, neueste zuerst nach Datum sortiert (aufsteigend)
  async getAll() {
    if (USE_SUPABASE && supabaseClient) {
      const { data: rows, error } = await supabaseClient
        .from("entries")
        .select("*")
        .order("date", { ascending: true });
      if (error) {
        console.error("Supabase-Fehler beim Laden:", error);
        return [];
      }
      return rows;
    }
    // --- localStorage-Fallback ---
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    const entries = raw ? JSON.parse(raw) : [];
    return entries.sort((a, b) => a.date.localeCompare(b.date));
  },

  // Neuen Eintrag anlegen
  async add(entry) {
    if (USE_SUPABASE && supabaseClient) {
      const { error } = await supabaseClient.from("entries").insert([entry]);
      if (error) console.error("Supabase-Fehler beim Speichern:", error);
      return;
    }
    // --- localStorage-Fallback ---
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    const entries = raw ? JSON.parse(raw) : [];
    entries.push({
      ...entry,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    });
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(entries));
  },

  // Status eines Eintrags aktualisieren
  async updateStatus(id, newStatus) {
    if (USE_SUPABASE && supabaseClient) {
      const { error } = await supabaseClient
        .from("entries")
        .update({ status: newStatus })
        .eq("id", id);
      if (error) console.error("Supabase-Fehler beim Status-Update:", error);
      return;
    }
    // --- localStorage-Fallback ---
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    const entries = raw ? JSON.parse(raw) : [];
    const updated = entries.map((e) => (e.id === id ? { ...e, status: newStatus } : e));
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
  },

  // Eintrag löschen
  async remove(id) {
    if (USE_SUPABASE && supabaseClient) {
      const { error } = await supabaseClient.from("entries").delete().eq("id", id);
      if (error) console.error("Supabase-Fehler beim Löschen:", error);
      return;
    }
    // --- localStorage-Fallback ---
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    const entries = raw ? JSON.parse(raw) : [];
    const remaining = entries.filter((e) => e.id !== id);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(remaining));
  },
};

/* -------------------------------------------------------------------------
   Hilfsfunktionen
   ------------------------------------------------------------------------- */

const STATUS_CYCLE = ["Geplant", "Material fertig", "Gepostet"];

const MONTH_NAMES = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

function formatDateShort(isoDate) {
  // "2026-09-14" -> "14.09."
  const [y, m, d] = isoDate.split("-");
  return `${d}.${m}.`;
}

function monthKey(isoDate) {
  // "2026-09-14" -> "2026-09"
  return isoDate.slice(0, 7);
}

function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

/* -------------------------------------------------------------------------
   3) RENDERING
   ------------------------------------------------------------------------- */

let currentEntries = [];
let currentFilter = "alle";
let pendingDeleteId = null;

async function loadAndRender() {
  currentEntries = await data.getAll();
  renderStats(currentEntries);
  renderList(currentEntries, currentFilter);
}
// -------------------------------------------------------------------------
// SUPABASE REALTIME — Änderungen von anderen Nutzern sofort anzeigen
// -------------------------------------------------------------------------
function setupRealtime() {
  if (!USE_SUPABASE || !supabaseClient) return;

  supabaseClient
    .channel("drivegallery-entries")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "entries",
      },
      () => {
        loadAndRender();
      }
    )
    .subscribe((status) => {
      console.log("Supabase Realtime:", status);
    });
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
    emptyEl.querySelector(".empty__sub").textContent =
      "Leg deinen ersten Post an — Datum, Fahrzeug und Typ reichen zum Start.";
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

  // Nach Monat gruppieren
  const groups = new Map();
  filtered.forEach((e) => {
    const key = monthKey(e.date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  });

  const sortedKeys = [...groups.keys()].sort();

  listEl.innerHTML = sortedKeys
    .map((key) => {
      const items = groups.get(key).sort((a, b) => a.date.localeCompare(b.date));
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
  const note = e.note ? `<p class="entry__note">${escapeHtml(e.note)}</p>` : "";

  return `
    <article class="entry" data-id="${e.id}">
      <div class="entry__date">${formatDateShort(e.date)}</div>
      <div class="entry__main">
        <div class="entry__title-row">
          <span class="entry__vehicle">${escapeHtml(e.vehicle)}</span>
        </div>
        ${note}
        ${link}
      </div>
      <div class="entry__side">
        <button class="status-label" data-status="${e.status}" data-id="${e.id}" title="Klicken zum Wechseln">
          ${e.status}
        </button>
        <button class="btn--icon" data-delete-id="${e.id}" title="Eintrag löschen">✕</button>
      </div>
    </article>
  `;
}

/* -------------------------------------------------------------------------
   4) EVENT-HANDLING
   ------------------------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", () => {
  // Sync-Status-Anzeige oben rechts
  const syncDot = document.getElementById("syncDot");
  const syncLabel = document.getElementById("syncLabel");
  if (USE_SUPABASE && supabaseClient) {
    syncDot.classList.add("is-cloud");
    syncLabel.textContent = "Cloud-Sync aktiv";
  } else {
    syncLabel.textContent = "Nur lokal auf diesem Gerät gespeichert";
  }

  loadAndRender();

  // --- Formular ein-/ausblenden ---
  const formPanel = document.getElementById("formPanel");
  const openFormBtn = document.getElementById("openFormBtn");
  const cancelFormBtn = document.getElementById("cancelFormBtn");
  const entryForm = document.getElementById("entryForm");

  openFormBtn.addEventListener("click", () => {
    formPanel.hidden = !formPanel.hidden;
    if (!formPanel.hidden) document.getElementById("fieldDate").focus();
  });

  cancelFormBtn.addEventListener("click", () => {
    entryForm.reset();
    formPanel.hidden = true;
  });

  // --- Formular absenden ---
  entryForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const newEntry = {
      date: document.getElementById("fieldDate").value,
      status: document.getElementById("fieldStatus").value,
      vehicle: document.getElementById("fieldVehicle").value.trim(),
      link: document.getElementById("fieldLink").value.trim(),
      note: document.getElementById("fieldNote").value.trim(),
    };

    if (!newEntry.date || !newEntry.vehicle) return; // required-Felder, HTML validiert bereits

    await data.add(newEntry);
    entryForm.reset();
    formPanel.hidden = true;
    await loadAndRender();
  });

  // --- Filter-Tabs ---
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => { t.classList.remove("is-active"); t.setAttribute("aria-selected", "false"); });
      tab.classList.add("is-active");
      tab.setAttribute("aria-selected", "true");
      currentFilter = tab.dataset.filter;
      renderList(currentEntries, currentFilter);
    });
  });

  // --- Klicks innerhalb der Liste: Status wechseln oder löschen anstoßen ---
  const listEl = document.getElementById("entryList");
  listEl.addEventListener("click", async (ev) => {
    const statusBtn = ev.target.closest(".status-label");
    if (statusBtn) {
      const id = statusBtn.dataset.id;
      const current = statusBtn.dataset.status;
      const nextIndex = (STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length;
      const next = STATUS_CYCLE[nextIndex];
      await data.updateStatus(id, next);
      await loadAndRender();
      return;
    }

    const deleteBtn = ev.target.closest("[data-delete-id]");
    if (deleteBtn) {
      pendingDeleteId = deleteBtn.dataset.deleteId;
      document.getElementById("confirmDialog").hidden = false;
    }
  });

  // --- Lösch-Bestätigung ---
  const confirmDialog = document.getElementById("confirmDialog");
  document.getElementById("confirmCancel").addEventListener("click", () => {
    pendingDeleteId = null;
    confirmDialog.hidden = true;
  });

  document.getElementById("confirmDelete").addEventListener("click", async () => {
    if (pendingDeleteId) {
      await data.remove(pendingDeleteId);
      pendingDeleteId = null;
      await loadAndRender();
    }
    confirmDialog.hidden = true;
  });

  // Bestätigungs-Dialog schließen bei Klick auf den dunklen Hintergrund
  confirmDialog.addEventListener("click", (ev) => {
    if (ev.target === confirmDialog) {
      pendingDeleteId = null;
      confirmDialog.hidden = true;
    }
  });
});
