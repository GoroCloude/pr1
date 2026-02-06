interface SubmissionData {
  id?: number;
  userId: string;
  name: string;
  address: string;
  license: string;
}

interface User {
  username: string;
  passwordHash: string;
}

const DB_NAME = "pr1db";
const DB_VERSION = 2;
const ENTRIES_STORE = "entries";
const USERS_STORE = "users";

let currentUser: string | null = null;
let editingId: number | null = null;

// --- DB ---

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ENTRIES_STORE)) {
        db.createObjectStore(ENTRIES_STORE, { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(USERS_STORE)) {
        db.createObjectStore(USERS_STORE, { keyPath: "username" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// --- User management ---

async function registerUser(username: string, password: string): Promise<boolean> {
  const db = await openDB();
  const existing = await getUser(db, username);
  if (existing) return false;

  const passwordHash = await hashPassword(password);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(USERS_STORE, "readwrite");
    tx.objectStore(USERS_STORE).add({ username, passwordHash } as User);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

function getUser(db: IDBDatabase, username: string): Promise<User | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(USERS_STORE, "readonly");
    const request = tx.objectStore(USERS_STORE).get(username);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loginUser(username: string, password: string): Promise<boolean> {
  const db = await openDB();
  const user = await getUser(db, username);
  if (!user) return false;
  const hash = await hashPassword(password);
  return user.passwordHash === hash;
}

// --- Entry CRUD ---

function addEntry(db: IDBDatabase, data: SubmissionData): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ENTRIES_STORE, "readwrite");
    tx.objectStore(ENTRIES_STORE).add(data);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function updateEntry(db: IDBDatabase, data: SubmissionData): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ENTRIES_STORE, "readwrite");
    tx.objectStore(ENTRIES_STORE).put(data);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function deleteEntry(db: IDBDatabase, id: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ENTRIES_STORE, "readwrite");
    tx.objectStore(ENTRIES_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function getAllEntries(db: IDBDatabase): Promise<SubmissionData[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ENTRIES_STORE, "readonly");
    const request = tx.objectStore(ENTRIES_STORE).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// --- UI ---

function showAuthSection(): void {
  document.getElementById("authSection")!.style.display = "block";
  document.getElementById("appSection")!.style.display = "none";
}

function showAppSection(): void {
  document.getElementById("authSection")!.style.display = "none";
  document.getElementById("appSection")!.style.display = "block";
  document.getElementById("currentUser")!.textContent = currentUser!;
}

function setAuthMessage(msg: string, isError: boolean): void {
  const el = document.getElementById("authMessage")!;
  el.textContent = msg;
  el.className = isError ? "message error" : "message success";
}

function clearAuthMessage(): void {
  const el = document.getElementById("authMessage")!;
  el.textContent = "";
  el.className = "message";
}

function renderGrid(entries: SubmissionData[]): void {
  const output = document.getElementById("output")!;
  const userEntries = entries.filter(e => e.userId === currentUser);

  if (userEntries.length === 0) {
    output.innerHTML = "<p>Keine Einträge vorhanden.</p>";
    return;
  }

  let html = `<h3>Gespeicherte Einträge (${userEntries.length})</h3>`;
  html += `<table>
    <thead>
      <tr>
        <th>#</th>
        <th>Name</th>
        <th>Adresse</th>
        <th>Lizenz</th>
        <th>Aktionen</th>
      </tr>
    </thead>
    <tbody>`;

  for (const entry of userEntries) {
    html += `<tr>
      <td>${entry.id}</td>
      <td>${entry.name}</td>
      <td>${entry.address}</td>
      <td>${entry.license}</td>
      <td class="actions">
        <button class="btn-edit" data-id="${entry.id}">Bearbeiten</button>
        <button class="btn-delete" data-id="${entry.id}">Löschen</button>
      </td>
    </tr>`;
  }

  html += `</tbody></table>`;
  output.innerHTML = html;

  output.querySelectorAll(".btn-edit").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = Number((btn as HTMLElement).dataset.id);
      const entry = userEntries.find(e => e.id === id);
      if (entry) startEdit(entry);
    });
  });

  output.querySelectorAll(".btn-delete").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = Number((btn as HTMLElement).dataset.id);
      handleDelete(id);
    });
  });
}

function startEdit(entry: SubmissionData): void {
  editingId = entry.id!;
  (document.getElementById("name") as HTMLInputElement).value = entry.name;
  (document.getElementById("address") as HTMLInputElement).value = entry.address;
  (document.getElementById("license") as HTMLInputElement).value = entry.license;

  const submitBtn = document.getElementById("submitBtn") as HTMLButtonElement;
  submitBtn.textContent = "Aktualisieren";

  document.getElementById("cancelBtn")!.style.display = "inline-block";
}

function cancelEdit(): void {
  editingId = null;
  (document.getElementById("name") as HTMLInputElement).value = "";
  (document.getElementById("address") as HTMLInputElement).value = "";
  (document.getElementById("license") as HTMLInputElement).value = "";

  const submitBtn = document.getElementById("submitBtn") as HTMLButtonElement;
  submitBtn.textContent = "Absenden";

  document.getElementById("cancelBtn")!.style.display = "none";
}

async function handleDelete(id: number): Promise<void> {
  if (!confirm("Eintrag wirklich löschen?")) return;

  const db = await openDB();
  await deleteEntry(db, id);

  if (editingId === id) cancelEdit();

  const entries = await getAllEntries(db);
  renderGrid(entries);
}

// --- Event handlers ---

async function handleSubmit(event: Event): Promise<void> {
  event.preventDefault();

  const nameInput = document.getElementById("name") as HTMLInputElement;
  const addressInput = document.getElementById("address") as HTMLInputElement;
  const licenseInput = document.getElementById("license") as HTMLInputElement;

  const data: SubmissionData = {
    userId: currentUser!,
    name: nameInput.value,
    address: addressInput.value,
    license: licenseInput.value,
  };

  const db = await openDB();

  if (editingId !== null) {
    data.id = editingId;
    await updateEntry(db, data);
    cancelEdit();
  } else {
    await addEntry(db, data);
  }

  nameInput.value = "";
  addressInput.value = "";
  licenseInput.value = "";

  const entries = await getAllEntries(db);
  renderGrid(entries);
}

async function handleRegister(event: Event): Promise<void> {
  event.preventDefault();
  clearAuthMessage();

  const username = (document.getElementById("authUsername") as HTMLInputElement).value.trim();
  const password = (document.getElementById("authPassword") as HTMLInputElement).value;

  if (username.length < 3) {
    setAuthMessage("Benutzername muss mindestens 3 Zeichen lang sein.", true);
    return;
  }
  if (password.length < 4) {
    setAuthMessage("Passwort muss mindestens 4 Zeichen lang sein.", true);
    return;
  }

  const success = await registerUser(username, password);
  if (success) {
    setAuthMessage("Registrierung erfolgreich! Sie können sich jetzt anmelden.", false);
  } else {
    setAuthMessage("Benutzername bereits vergeben.", true);
  }
}

async function handleLogin(event: Event): Promise<void> {
  event.preventDefault();
  clearAuthMessage();

  const username = (document.getElementById("authUsername") as HTMLInputElement).value.trim();
  const password = (document.getElementById("authPassword") as HTMLInputElement).value;

  const success = await loginUser(username, password);
  if (success) {
    currentUser = username;
    sessionStorage.setItem("currentUser", username);
    showAppSection();

    const db = await openDB();
    const entries = await getAllEntries(db);
    renderGrid(entries);
  } else {
    setAuthMessage("Ungültiger Benutzername oder Passwort.", true);
  }
}

function handleLogout(): void {
  currentUser = null;
  editingId = null;
  sessionStorage.removeItem("currentUser");
  showAuthSection();
  (document.getElementById("authUsername") as HTMLInputElement).value = "";
  (document.getElementById("authPassword") as HTMLInputElement).value = "";
  clearAuthMessage();
}

// --- Init ---

async function init(): Promise<void> {
  document.getElementById("loginBtn")!.addEventListener("click", handleLogin);
  document.getElementById("registerBtn")!.addEventListener("click", handleRegister);
  document.getElementById("logoutBtn")!.addEventListener("click", handleLogout);
  document.getElementById("dataForm")!.addEventListener("submit", handleSubmit);
  document.getElementById("cancelBtn")!.addEventListener("click", cancelEdit);

  const saved = sessionStorage.getItem("currentUser");
  if (saved) {
    currentUser = saved;
    showAppSection();
    const db = await openDB();
    const entries = await getAllEntries(db);
    renderGrid(entries);
  } else {
    showAuthSection();
  }
}

init();
