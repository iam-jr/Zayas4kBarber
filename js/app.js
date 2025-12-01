/**
 * Zayas4k — Calendario de reservas (DEMO local, estilo Booksy violeta)
 * - 12h am/pm y último inicio 7:00 pm (fijo).
 * - Anti-jank: bloquea altura del grid de horas durante el re-render.
 * - SIN persistencia de datos personales ni de UI (no se guarda nombre/email/teléfono ni selecciones).
 * - ICS + Google Calendar con TZ y ubicación.
 */

/* ===================== Configuración ===================== */
const TIMEZONE = "America/Puerto_Rico";
const OPEN_DAYS = [2, 3, 4, 5, 6]; // 0=Dom ... 6=Sáb (Mar–Sáb)
const OPEN_HOUR = 10;              // 10:00 am
const CLOSE_HOUR = 19;             // 7:00 pm (referencia)
const SLOT_MINUTES = 15;
const STORAGE_KEY = "z4k_bookings_v1"; // SOLO reservas DEMO (no datos personales)
const DEMO_SEED = true;

/* ===================== Estado (no se persiste) ===================== */
let viewYear, viewMonth;   // mes visible
let selectedDate = null;   // Date (día)
let selectedTime = null;   // "HH:MM" 24h
let selectedService = null;// {name, duration, price}

/* ===================== Utils ===================== */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const pad = (n) => String(n).padStart(2, "0");
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const isToday = (d) => startOfDay(d).getTime() === startOfDay(new Date()).getTime();
const clamp = (num, min, max) => Math.max(min, Math.min(num, max));
const fmtMonth = (y, m) =>
  new Date(y, m, 1).toLocaleString("es-PR", { month: "long", year: "numeric", timeZone: TIMEZONE });

function safeJSONParse(str, fallback = {}) { try { return JSON.parse(str) || fallback; } catch { return fallback; } }
const loadBookings = () => safeJSONParse(localStorage.getItem(STORAGE_KEY), {});
const saveBookings = (data) => localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

/* 12h para UI (manteniendo 24h interna) */
function to12h(hhmm){
  const [H,M] = hhmm.split(":").map(Number);
  const suffix = H >= 12 ? "pm" : "am";
  const h12 = ((H + 11) % 12) + 1;
  return `${h12}:${String(M).padStart(2,"0")} ${suffix}`;
}

/* Toast minimal */
function toast(msg) {
  const t = $("#toast");
  if (!t) return alert(msg);
  t.textContent = msg;
  t.classList.add("show");
  window.clearTimeout(t._timer);
  t._timer = window.setTimeout(() => t.classList.remove("show"), 1800);
}

/* ===================== Semilla DEMO (no datos personales) ===================== */
(function seedDemo() {
  if (!DEMO_SEED) return;
  if (localStorage.getItem(STORAGE_KEY)) return;

  const data = {};
  const today = new Date();
  for (let i = 0; i < 10; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const key = dateKey(d);
    data[key] = data[key] || [];

    // 0–8 slots ocupados al azar para simular demanda
    const busyCount = Math.floor(Math.random() * 8);
    const daySlots = generateDaySlots(d, 45); // densidad base
    for (let j = 0; j < busyCount && j < daySlots.length; j++) {
      data[key].push(daySlots[j]);
    }
  }
  saveBookings(data);
})();

/* ===================== Calendario ===================== */
function renderCalendar(y, m) {
  viewYear = y; viewMonth = m;
  const cal = $("#calendar");
  if (!cal) return;

  // Anti-jank: bloquear altura mientras re-renderiza
  const prevH = cal.offsetHeight;
  if (prevH > 0) cal.style.minHeight = prevH + "px";

  cal.innerHTML = "";

  // Encabezados
  const dows = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  dows.forEach((dn) => {
    const el = document.createElement("div");
    el.className = "dow";
    el.textContent = dn;
    cal.appendChild(el);
  });

  const first = new Date(y, m, 1);
  const startOffset = (first.getDay() + 6) % 7; // Lunes=0
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  // Relleno
  for (let i = 0; i < startOffset; i++) {
    const slot = document.createElement("div");
    slot.setAttribute("aria-hidden", "true");
    cal.appendChild(slot);
  }

  const bookings = loadBookings();
  const todaySoD = startOfDay(new Date());

  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(y, m, day);
    const open = OPEN_DAYS.includes(d.getDay());
    const past = startOfDay(d) < todaySoD; // hoy no es "pasado"

    const tile = document.createElement("button");
    tile.className = "day";
    tile.type = "button";
    tile.setAttribute("role", "gridcell");
    tile.setAttribute("tabindex", past || !open ? "-1" : "0");
    tile.setAttribute("aria-disabled", (!open || past) ? "true" : "false");
    tile.dataset.date = d.toISOString();

    const num = document.createElement("div");
    num.className = "num";
    num.textContent = day;

    const badge = document.createElement("div");
    badge.className = "badge";

    // disponibilidad
    const totalSlots = generateDaySlots(d, 45).length;
    const used = (bookings[dateKey(d)] || []).length;
    const free = Math.max(totalSlots - used, 0);

    if (!open) {
      setBadge(badge, "Cerrado", "red"); tile.title = "Cerrado";
    } else if (free <= 0) {
      setBadge(badge, "Lleno", "red"); tile.title = "Sin espacios";
    } else if (free < totalSlots * 0.35) {
      setBadge(badge, "Parcial", "orange"); tile.title = `Quedan pocos (${free})`;
    } else {
      setBadge(badge, "Disponible", "white"); tile.title = `Disponible (${free})`;
    }

    if (isToday(d)) tile.dataset.today = "true";

    tile.appendChild(num);
    tile.appendChild(badge);

    if (!past && open) {
      tile.addEventListener("click", () => onSelectDay(tile, cal));
      tile.addEventListener("keydown", (ev) => handleDayKeyDown(ev, tile, cal));
    }

    cal.appendChild(tile);
  }

  const header = $("#current-month");
  if (header) header.textContent = fmtMonth(y, m);

  requestAnimationFrame(()=>{ cal.style.minHeight = ""; });
}

function setBadge(el, text, tone) {
  el.className = "badge " + tone;
  el.textContent = text;
}

function onSelectDay(tile, calRoot) {
  $$(".day.selected", calRoot).forEach((n) => {
    n.classList.remove("selected");
    n.setAttribute("aria-selected", "false");
  });

  tile.classList.add("selected");
  tile.setAttribute("aria-selected", "true");

  selectedDate = new Date(tile.dataset.date);
  selectedTime = null; // reset hora
  stepTo(2);
  renderHours();
  updateSummary();
  enableReserveIfReady();
}

function handleDayKeyDown(ev, tile, calRoot) {
  const code = ev.key;
  const days = $$(".day:not([aria-disabled='true'])", calRoot);
  const idx = days.indexOf(tile);
  if (idx < 0) return;

  const cols = 7;
  let nextIndex = null;

  if (code === "ArrowRight") nextIndex = clamp(idx + 1, 0, days.length - 1);
  else if (code === "ArrowLeft") nextIndex = clamp(idx - 1, 0, days.length - 1);
  else if (code === "ArrowDown") nextIndex = clamp(idx + cols, 0, days.length - 1);
  else if (code === "ArrowUp") nextIndex = clamp(idx - cols, 0, days.length - 1);
  else if (code === "Home") nextIndex = 0;
  else if (code === "End") nextIndex = days.length - 1;
  else if (code === "Enter" || code === " ") { ev.preventDefault(); tile.click(); return; }

  if (nextIndex !== null) {
    ev.preventDefault();
    days[nextIndex].focus({ preventScroll: true });
  }
}

/* ===================== Slots / Horas ===================== */
/* 10:00 am → 7:00 pm (incluyente) en pasos de SLOT_MINUTES */
function generateDaySlots(dateObj, serviceMinutes){
  const slots = [];

  const start = new Date(dateObj);
  start.setHours(10, 0, 0, 0);

  const end = new Date(dateObj);
  end.setHours(19, 0, 0, 0); // último INICIO 7:00 pm

  // Alinear a grilla por si SLOT_MINUTES cambia
  const aligned = new Date(start);
  const rem = aligned.getMinutes() % SLOT_MINUTES;
  if (rem !== 0) aligned.setMinutes(aligned.getMinutes() + (SLOT_MINUTES - rem), 0, 0);

  for (let t = new Date(aligned); t.getTime() <= end.getTime(); ){
    const hh = pad(t.getHours());
    const mm = pad(t.getMinutes());
    slots.push(`${hh}:${mm}`);
    t.setMinutes(t.getMinutes() + SLOT_MINUTES, 0, 0);
  }
  return slots;
}

function renderHours(){
  const grid = $("#hours");
  if (!grid) return;

  // Anti-jank: bloquear altura mientras re-renderiza
  const prevH = grid.offsetHeight;
  if (prevH > 0) grid.style.minHeight = prevH + "px";

  grid.innerHTML = "";

  if (!selectedDate) {
    grid.innerHTML = `<p class="muted">Antes de escoger la hora, elige un dia. Horas según el día abierto (Mar–Sáb 10:00am–7:00pm) y la duración del servicio.</p>`;
    requestAnimationFrame(()=>{ grid.style.minHeight = ""; });
    return;
  }

  // Duración del servicio
  const sel = $("#serviceId");
  const opt = sel?.options[sel.selectedIndex];
  const serviceMinutes = opt && opt.dataset.duration ? parseInt(opt.dataset.duration, 10) : 45;

  const allStarts = generateDaySlots(selectedDate, serviceMinutes);

  // Quitar horas pasadas si es hoy
  const now = new Date();
  const validStarts = allStarts.filter((h) => {
    if (!isToday(selectedDate)) return true;
    const [hh, mm] = h.split(":").map((n) => parseInt(n, 10));
    const cand = new Date(selectedDate);
    cand.setHours(hh, mm, 0, 0);
    return cand.getTime() > now.getTime() + 5 * 60 * 1000;
  });

  // Quitar ya reservadas (DEMO)
  const bookings = loadBookings();
  const busy = new Set(bookings[dateKey(selectedDate)] || []);
  const freeStarts = validStarts.filter((h) => !busy.has(h));

  if (freeStarts.length === 0) {
    grid.innerHTML = `<p class="muted">No hay horas disponibles para este día.</p>`;
    requestAnimationFrame(()=>{ grid.style.minHeight = ""; });
    return;
  }

  const frag = document.createDocumentFragment();
  freeStarts.forEach((h, idx) => {
    const b = document.createElement("button");
    b.className = "hour";
    b.type = "button";
    b.textContent = to12h(h);     // visual 12h
    b.dataset.time24 = h;         // interna 24h
    b.setAttribute("tabindex", "0");
    b.addEventListener("click", () => onSelectHour(b, grid, h));
    b.addEventListener("keydown", (ev) => handleHourKeyDown(ev, b, grid));
    frag.appendChild(b);

    if (idx === 0 && $(".day.selected")) b.dataset.autofocus = "true";
  });
  grid.appendChild(frag);

  requestAnimationFrame(() => {
    const auto = $(".hour[data-autofocus='true']", grid);
    if (auto) { auto.focus({ preventScroll: true }); auto.removeAttribute("data-autofocus"); }
    grid.style.minHeight = "";
  });
}

function onSelectHour(btn, grid, time) {
  $$(".hour.selected", grid).forEach((n) => n.classList.remove("selected"));
  btn.classList.add("selected");
  selectedTime = time; // 24h
  stepTo(3);
  updateSummary();
  enableReserveIfReady();
}

function handleHourKeyDown(ev, btn, gridRoot) {
  const code = ev.key;
  const hours = $$(".hour", gridRoot);
  const idx = hours.indexOf(btn);
  if (idx < 0) return;

  const cols = getComputedStyle(gridRoot).gridTemplateColumns.split(" ").length || 3;
  let nextIndex = null;

  if (code === "ArrowRight") nextIndex = clamp(idx + 1, 0, hours.length - 1);
  else if (code === "ArrowLeft") nextIndex = clamp(idx - 1, 0, hours.length - 1);
  else if (code === "ArrowDown") nextIndex = clamp(idx + cols, 0, hours.length - 1);
  else if (code === "ArrowUp") nextIndex = clamp(idx - cols, 0, hours.length - 1);
  else if (code === "Home") nextIndex = 0;
  else if (code === "End") nextIndex = hours.length - 1;
  else if (code === "Enter" || code === " ") { ev.preventDefault(); btn.click(); return; }

  if (nextIndex !== null) {
    ev.preventDefault();
    hours[nextIndex].focus({ preventScroll: true });
  }
}

/* ===================== Pasos ===================== */
function stepTo(n) {
  $$(".step").forEach((el, i) => el.classList.toggle("active", i === n - 1));
}

/* ===================== Servicio / Datos del cliente ===================== */
$("#serviceId")?.addEventListener("change", (e) => {
  const opt = e.target.options[e.target.selectedIndex];
  if (opt && opt.value) {
    selectedService = {
      name: opt.value,
      duration: parseInt(opt.dataset.duration, 10),
      price: parseFloat(opt.dataset.price),
    };
    if ($("#serviceDuration")) $("#serviceDuration").value = `${selectedService.duration} min`;
    if ($("#servicePrice")) $("#servicePrice").value = `$${selectedService.price.toFixed(2)}`;
    renderHours(); // recalcular grid por duración
  } else {
    selectedService = null;
    if ($("#serviceDuration")) $("#serviceDuration").value = "—";
    if ($("#servicePrice")) $("#servicePrice").value = "—";
  }
  updateSummary();
  enableReserveIfReady();
});

/* IMPORTANTE: No guardar datos del cliente en ningún lado */
$$("#client-form input, #client-form select").forEach((el) => {
  el.addEventListener("input", () => {
    // Solo actualizar UI; NO guardamos en localStorage / sessionStorage
    updateSummary();
    enableReserveIfReady();
  });
});

/* ===================== Resumen ===================== */
function updateSummary() {
  const parts = [];
  if (selectedService)
    parts.push(
      `Servicio: <strong>${escapeHTML(selectedService.name)}</strong> (${selectedService.duration} min, $${selectedService.price.toFixed(2)})`
    );
  if (selectedDate)
    parts.push(
      `Día: <strong>${selectedDate.toLocaleDateString("es-PR", {
        weekday: "long", day: "2-digit", month: "long", year: "numeric",
      })}</strong>`
    );
  if (selectedTime) parts.push(`Hora: <strong>${to12h(selectedTime)}</strong>`);
  const name = $("#clientName")?.value?.trim();
  if (name) parts.push(`Cliente: <strong>${escapeHTML(name)}</strong>`);
  if ($("#summary")) $("#summary").innerHTML = parts.length ? parts.join(" • ") : "Selecciona día, hora y servicio para ver el resumen.";
}

function enableReserveIfReady() {
  const ready =
    selectedDate &&
    selectedTime &&
    selectedService &&
    $("#clientName")?.checkValidity() &&
    $("#clientEmail")?.checkValidity();

  if ($("#reserve-btn")) $("#reserve-btn").disabled = !ready;
  if ($("#add-ics")) $("#add-ics").disabled = !ready;
  $("#add-google")?.classList.toggle("disabled", !ready);
}




/* ===================== ICS y Google Calendar ===================== */
$("#add-ics")?.addEventListener("click", () => {
  const { startUTC, endUTC, title, desc } = buildEventTimes();
  const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Z4K//Barber//ES
BEGIN:VEVENT
UID:${crypto.randomUUID()}
DTSTAMP:${toICS(new Date())}
DTSTART:${toICS(startUTC)}
DTEND:${toICS(endUTC)}
SUMMARY:${title}
DESCRIPTION:${desc}
LOCATION:Ponce, PR
END:VEVENT
END:VCALENDAR`;
  const blob = new Blob([ics], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "zayas4k.ics";
  a.click();
  URL.revokeObjectURL(url);
});

$("#add-google")?.addEventListener("click", (e) => {
  if (e.currentTarget.classList.contains("disabled")) return;
  const { startUTC, endUTC, title, desc } = buildEventTimes();
  const fmt = (d) => d.toISOString().replace(/[-:]|\.\d{3}/g, "");
  const href =
    `https://calendar.google.com/calendar/render` +
    `?action=TEMPLATE` +
    `&text=${encodeURIComponent(title)}` +
    `&details=${encodeURIComponent(desc)}` +
    `&location=${encodeURIComponent("Ponce, PR")}` +
    `&ctz=${encodeURIComponent(TIMEZONE)}` +
    `&dates=${fmt(startUTC)}/${fmt(endUTC)}`;
  e.currentTarget.href = href;
});

function buildEventTimes() {
  const [hh, mm] = (selectedTime || "00:00").split(":").map(Number);
  const start = new Date(selectedDate); start.setHours(hh, mm, 0, 0);
  const end = new Date(start.getTime() + selectedService.duration * 60000);

  const startUTC = new Date(start.getTime() - start.getTimezoneOffset() * 60000);
  const endUTC = new Date(end.getTime() - end.getTimezoneOffset() * 60000);

  const title = `Cita ${selectedService.name} — Zayas4k Barber`;
  const desc = `Servicio: ${selectedService.name} (${selectedService.duration} min) — $${selectedService.price.toFixed(2)}. Ubicación: Carolina, PR.`;
  return { startUTC, endUTC, title: sanitizeICS(title), desc: sanitizeICS(desc) };
}

function toICS(d) {
  // YYYYMMDDTHHMMSSZ
  const y = d.getUTCFullYear();
  const m = pad(d.getUTCMonth() + 1);
  const da = pad(d.getUTCDate());
  const hh = pad(d.getUTCHours());
  const mm = pad(d.getUTCMinutes());
  const ss = pad(d.getUTCSeconds());
  return `${y}${m}${da}T${hh}${mm}${ss}Z`;
}

/* ===================== Nav Meses ===================== */
$("#prev-month")?.addEventListener("click", () => {
  const d = new Date(viewYear, viewMonth - 1, 1);
  renderCalendar(d.getFullYear(), d.getMonth());
  renderHours();
});
$("#next-month")?.addEventListener("click", () => {
  const d = new Date(viewYear, viewMonth + 1, 1);
  renderCalendar(d.getFullYear(), d.getMonth());
  renderHours();
});

/* CTA (ir al paso 1) */
["cta-open", "cta-open-2", "cta-open-mobile"].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("click", () => stepTo(1));
});
/* ===================== EmailJS ===================== */


// Inicializar EmailJS
emailjs.init("jjYhLtnOnvimVOzDu"); // Tu Public Key

// Botón de reserva
document.getElementById("reserve-btn")?.addEventListener("click", () => {
  if (!selectedDate || !selectedTime || !selectedService) return;

  const clientName = document.getElementById("clientName")?.value?.trim();
  const clientEmail = document.getElementById("clientEmail")?.value?.trim();
  const clientPhone = document.getElementById("clientPhone")?.value?.trim();

  if (!clientName || !clientEmail) {
    alert("Por favor, ingresa todos los datos requeridos.");
    return;
  }
const datosCliente = {
  name: clientName,
  email: clientEmail,
  phone: clientPhone,
  service: selectedService.name,
  duration: selectedService.duration,
  price: `$${selectedService.price.toFixed(2)}`,
  date: selectedDate.toLocaleDateString("es-PR"),
  time: to12h(selectedTime)
};

const datosBarbero = {
  clientName: clientName,
  clientEmail: clientEmail,
  clientPhone: clientPhone,
  service: selectedService.name,
  duration: selectedService.duration,
  price: `$${selectedService.price.toFixed(2)}`,
  date: selectedDate.toLocaleDateString("es-PR"),
  time: to12h(selectedTime)
};

Promise.all([
  emailjs.send("service_4v8u0jp", "template_9p3kvki", datosCliente),
  emailjs.send("service_4v8u0jp", "template_thz7as6", datosBarbero)
])

  // Enviar ambos emails (Cliente + Barbero)
  Promise.all([
    emailjs.send("service_4v8u0jp", "template_9p3kvki", datosCliente),
    emailjs.send("service_4v8u0jp", "template_thz7as6", datosBarbero)
  ])
  .then(() => {
    alert("¡Cita confirmada! Redirigiendo...");
    window.location.href = "confirmation.html";
  })
  .catch((err) => {
    console.error("❌ Error al enviar correos:", err);
    alert("Hubo un problema al enviar la cita. Revisa la consola para más detalles.");
  });
});

/* ===================== Inicio ===================== */
(function init() {
  const d = new Date(); // no se restaura selección (no persistimos UI)
  renderCalendar(d.getFullYear(), d.getMonth());
  renderHours();

  // WhatsApp / Teléfono (no se guardan)
  const phone = "+19393976152".replace(/\D/g, "");
  const wa = `https://wa.me/19393976152`;
  ["whats-link", "cta-whatsapp", "cta-whatsapp-fab"].forEach((id) => {
    const a = document.getElementById(id);
    if (a) a.href = wa;
  });

  updateSummary();
  enableReserveIfReady();
})();

/* ===================== Escapes ===================== */
function sanitizeICS(s) { return String(s).replace(/[\n\r,;]/g, " "); }
function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
// --- Reset robusto (función + delegación de eventos) ---
function resetAll() {
  selectedDate = null;
  selectedTime = null;
  $$(".day.selected").forEach(n => n.classList.remove("selected"));
  $$(".hour.selected").forEach(n => n.classList.remove("selected"));
  if ($("#serviceId")) $("#serviceId").selectedIndex = 0;
  if ($("#serviceDuration")) $("#serviceDuration").value = "—";
  if ($("#servicePrice")) $("#servicePrice").value = "—";
  updateSummary();
  enableReserveIfReady();
  renderHours();
  renderCalendar(viewYear, viewMonth);
}

// Autoplay cada 2 segundos
let autoplay = setInterval(() => {
  current = (current + 1) % total;
  showSlide(current);
}, 2000);

// Swipe táctil para móviles
let startX = 0;

const hero = document.querySelector('.hero-art');

hero.addEventListener('touchstart', e => {
  startX = e.touches[0].clientX;
  clearInterval(autoplay); // Pausa autoplay al tocar
});

hero.addEventListener('touchend', e => {
  let endX = e.changedTouches[0].clientX;
  if (endX - startX > 50) { // swipe right
    current = (current - 1 + total) % total;
  } else if (startX - endX > 50) { // swipe left
    current = (current + 1) % total;
  }
  showSlide(current);
  autoplay = setInterval(() => { // reinicia autoplay
    current = (current + 1) % total;
    showSlide(current);
  }, 2000);
});
