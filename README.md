# DriveGallery — Content Planner

Eine schlanke Ein-Seiten-Webapp zum Planen eurer Instagram-Posts (Reels, Fotos, Storys) — für Jannik und Cornelius.

Dateien:
- `index.html` — Struktur der Seite
- `style.css` — Design (dunkel, flach, Space Grotesk / Inter / JetBrains Mono)
- `script.js` — Logik: Speichern, Laden, Status wechseln, Löschen, Filter

---

## 1. Lokal öffnen (sofort nutzbar, kein Setup nötig)

Einfach `index.html` doppelklicken bzw. im Browser öffnen. Die App speichert eure Einträge dann **nur lokal in diesem einen Browser auf diesem einen Gerät** (via `localStorage`). Das heißt: Was du auf deinem iPhone/Mac einträgst, sieht Cornelius auf seinem Gerät nicht — dafür braucht ihr Phase 2 (Cloud-Sync, siehe unten).

## 2. Kostenlos hosten

Da es nur statische Dateien sind, reicht jeder kostenlose Static-Host:

- **GitHub Pages:** Repo anlegen, die drei Dateien hochladen, unter *Settings → Pages* aktivieren.
- **Netlify / Vercel:** Ordner per Drag & Drop hochladen (bei Netlify z. B. unter „Deploys“ → „Drag and drop your site output folder“) — fertig, ihr bekommt eine URL.

Diese URL könnt ihr euch beide privat teilen (z. B. per WhatsApp/iMessage). Ein Login gibt es bewusst nicht — wer den Link hat, kann die Seite nutzen.

---

## 3. Cloud-Sync mit Supabase einrichten (optional, aber empfohlen)

Damit du und Cornelius **dieselben Einträge in Echtzeit** seht, nutzt die App optional [Supabase](https://supabase.com) (kostenloser Tier reicht locker für diesen Zweck).

### Schritt 1 — Projekt anlegen
1. Auf [supabase.com](https://supabase.com) kostenlos registrieren.
2. „New Project" klicken, Name vergeben (z. B. `drivegallery-planner`), Region auswählen (z. B. Frankfurt), Datenbank-Passwort setzen (merken, braucht ihr für dieses Setup aber nicht direkt).
3. Warten, bis das Projekt fertig eingerichtet ist (ca. 1–2 Minuten).

### Schritt 2 — Tabelle `entries` anlegen
1. Im Supabase-Dashboard links auf **„SQL Editor"** klicken.
2. Folgendes SQL einfügen und ausführen (**„Run"**):

```sql
create table entries (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  status text not null default 'Geplant',
  vehicle text not null,
  link text,
  note text,
  created_at timestamptz not null default now()
);

-- Da es keine Benutzerverwaltung gibt, öffnen wir die Tabelle für Lesen/Schreiben
-- über den "anon"-Key. Das ist für einen privaten Zwei-Personen-Planer okay,
-- aber wichtig zu wissen: Jeder mit dem Anon-Key (und der URL) kann Einträge
-- lesen/schreiben. Die App-URL also nicht öffentlich teilen.
alter table entries enable row level security;

create policy "Alle dürfen lesen"
  on entries for select
  using (true);

create policy "Alle dürfen einfügen"
  on entries for insert
  with check (true);

create policy "Alle dürfen aktualisieren"
  on entries for update
  using (true);

create policy "Alle dürfen löschen"
  on entries for delete
  using (true);
```

3. Prüfen: unter **„Table Editor"** solltet ihr jetzt die Tabelle `entries` mit den Spalten `id, date, status, vehicle, link, note, created_at` sehen.

### Schritt 3 — Zugangsdaten holen
1. Im Dashboard links auf **„Project Settings" → „API"**.
2. Dort findet ihr:
   - **Project URL** (sieht aus wie `https://xxxxxxxxxxxx.supabase.co`)
   - **anon / public key** (ein langer Text, beginnt meist mit `eyJ...`)

### Schritt 4 — In der App eintragen
Öffnet `script.js` und tragt ganz oben eure Werte ein:

```js
const SUPABASE_URL = "";
const SUPABASE_ANON_KEY = "";
```

Speichern, Seite neu laden (bzw. neu hochladen, falls schon gehostet) — fertig. Oben rechts in der App seht ihr jetzt „Cloud-Sync aktiv" statt „Nur lokal gespeichert".

Ab jetzt landen alle neuen Einträge in Supabase, und ihr beide seht dieselben Daten (die App lädt bei jeder Aktion frisch aus der Datenbank — kein manuelles Reload nötig für die eigenen Aktionen; für Änderungen des anderen reicht ein Neuladen der Seite).

> **Hinweis:** Falls ihr die Supabase-Felder leer lasst, funktioniert die App weiterhin ganz normal — dann eben nur lokal (`localStorage`), wie in Phase 1 beschrieben.

---

## 4. Anpassen

- **Farben/Look:** ganz oben in `style.css`, im Block `:root { ... }` — dort sind alle Farben, Schriftarten und Radien als benannte Variablen mit Kommentaren hinterlegt.
- **Texte** (z. B. Leerer-Zustand-Hinweis, Button-Beschriftungen): direkt in `index.html` bzw. in `script.js` bei `renderList()`.
- **Status-Reihenfolge beim Klicken** (Geplant → Entwurf → Gepostet): `STATUS_CYCLE` in `script.js`.

---

## Nicht enthalten (bewusst, laut Briefing)

- Kein Login / keine Benutzerverwaltung — nur private URL.
- Kein automatisches Posten auf Instagram, nur Planung.
- Keine Bild-Uploads, nur Text-Links.
