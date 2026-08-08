const { createClient } = window.supabase;
const config = window.APP_CONFIG || {};
const today = new Date();
const STORAGE_KEY = "relationship-runway-access";

const state = {
  currentYear: today.getFullYear(),
  events: [],
  deadlines: [],
  occurrences: [],
  user: null,
  isConfigured: Boolean(
    config.supabaseUrl &&
      config.supabaseAnonKey &&
      !config.supabaseUrl.includes("YOUR_PROJECT") &&
      !config.supabaseAnonKey.includes("YOUR_SUPABASE")
  )
};

const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "long" });
const weekdayFormatter = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const longDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric"
});

const elements = {
  authGate: document.querySelector("#authGate"),
  authForm: document.querySelector("#authForm"),
  authCode: document.querySelector("#authCode"),
  authStatus: document.querySelector("#authStatus"),
  appShell: document.querySelector("#appShell"),
  currentUserEmail: document.querySelector("#currentUserEmail"),
  logoutButton: document.querySelector("#logoutButton"),
  openEditorButton: document.querySelector("#openEditorButton"),
  yearHeading: document.querySelector("#yearHeading"),
  calendarGrid: document.querySelector("#calendarGrid"),
  deadlineList: document.querySelector("#deadlineList"),
  overdueCount: document.querySelector("#overdueCount"),
  dueSoonCount: document.querySelector("#dueSoonCount"),
  doneCount: document.querySelector("#doneCount"),
  statusBanner: document.querySelector("#statusBanner"),
  editorDialog: document.querySelector("#editorDialog"),
  eventForm: document.querySelector("#eventForm"),
  dialogTitle: document.querySelector("#dialogTitle"),
  eventId: document.querySelector("#eventId"),
  eventTitle: document.querySelector("#eventTitle"),
  eventDate: document.querySelector("#eventDate"),
  eventRecurrence: document.querySelector("#eventRecurrence"),
  eventNotes: document.querySelector("#eventNotes"),
  deadlineFields: document.querySelector("#deadlineFields"),
  deadlineFieldTemplate: document.querySelector("#deadlineFieldTemplate"),
  deleteEventButton: document.querySelector("#deleteEventButton")
};

const supabase = state.isConfigured
  ? createClient(config.supabaseUrl, config.supabaseAnonKey)
  : null;

init().catch((error) => {
  console.error(error);
  showStatus(error.message || "Something went wrong while loading the planner.", true);
});

async function init() {
  bindUI();

  if (!state.isConfigured) {
    showAuthState(false);
    showAuthStatus(
      "Add your Supabase project URL and anon key in config.js before the planner can load data.",
      true
    );
    return;
  }

  const savedAccess = readStoredAccess();
  if (savedAccess) {
    state.user = savedAccess;
    showAuthState(true);
    await refreshData();
  } else {
    showAuthState(false);
  }
}

function bindUI() {
  elements.authForm.addEventListener("submit", handleCodeSubmit);
  elements.logoutButton.addEventListener("click", handleLogout);
  elements.openEditorButton.addEventListener("click", () => openEditor());
  document.querySelector("#closeEditorButton").addEventListener("click", closeEditor);
  document.querySelector("#cancelEditorButton").addEventListener("click", closeEditor);
  document.querySelector("#prevYearButton").addEventListener("click", () => {
    state.currentYear -= 1;
    render();
  });
  document.querySelector("#nextYearButton").addEventListener("click", () => {
    state.currentYear += 1;
    ensureRecurringOccurrences([state.currentYear, state.currentYear + 1])
      .then(render)
      .catch((error) => showStatus(error.message, true));
  });

  elements.eventForm.addEventListener("submit", handleEventSubmit);
  elements.deleteEventButton.addEventListener("click", handleDeleteEvent);
  document.querySelector("#addDeadlineButton").addEventListener("click", () => {
    appendDeadlineField();
  });
  elements.editorDialog.addEventListener("close", resetEditor);
}

async function handleCodeSubmit(event) {
  event.preventDefault();
  const inputCode = elements.authCode.value.trim();

  if (!inputCode) {
    showAuthStatus("Enter the code you want this browser to use.", true);
    return;
  }

  const { data, error } = await supabase
    .from("access_codes")
    .select("id, label, code, archived")
    .eq("archived", false)
    .order("label", { ascending: true });

  if (error) {
    showAuthStatus(error.message, true);
    return;
  }

  const match = (data || []).find((entry) => String(entry.code || "").trim() === inputCode);

  if (!match) {
    showAuthStatus("That code was not found.", true);
    return;
  }

  state.user = match;
  writeStoredAccess(match);
  state.currentYear = today.getFullYear();
  showAuthState(true);
  showAuthStatus("");
  await refreshData();
}

function handleLogout() {
  clearStoredAccess();
  resetPlannerState();
  showAuthState(false);
}

function readStoredAccess() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed?.id || !parsed?.code) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredAccess(access) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(access));
}

function clearStoredAccess() {
  window.localStorage.removeItem(STORAGE_KEY);
}

function showAuthState(isSignedIn) {
  elements.authGate.classList.toggle("hidden", isSignedIn);
  elements.appShell.classList.toggle("hidden", !isSignedIn);
  elements.currentUserEmail.textContent = state.user?.label || "";
}

function showAuthStatus(message, isError = false) {
  if (!message) {
    elements.authStatus.textContent = "";
    elements.authStatus.classList.add("hidden");
    elements.authStatus.classList.remove("auth-status-error");
    return;
  }

  elements.authStatus.textContent = message;
  elements.authStatus.classList.remove("hidden");
  elements.authStatus.classList.toggle("auth-status-error", isError);
}

function resetPlannerState() {
  state.user = null;
  state.events = [];
  state.deadlines = [];
  state.occurrences = [];
  elements.calendarGrid.innerHTML = "";
  elements.deadlineList.innerHTML = "";
  elements.overdueCount.textContent = "0";
  elements.dueSoonCount.textContent = "0";
  elements.doneCount.textContent = "0";
  closeEditor();
}

async function refreshData() {
  if (!state.user) {
    return;
  }

  await fetchData();
  await ensureRecurringOccurrences([state.currentYear, state.currentYear + 1]);
  await fetchData();
  render();
}

async function fetchData() {
  const ownerId = state.user.id;
  const [{ data: events, error: eventsError }, { data: deadlines, error: deadlinesError }, { data: occurrences, error: occurrencesError }] =
    await Promise.all([
      supabase
        .from("events")
        .select("*")
        .eq("owner_access_code_id", ownerId)
        .eq("archived", false)
        .order("event_date", { ascending: true }),
      supabase
        .from("deadlines")
        .select("*")
        .eq("owner_access_code_id", ownerId)
        .eq("archived", false)
        .order("sort_order", { ascending: true }),
      supabase
        .from("deadline_occurrences")
        .select("*")
        .eq("owner_access_code_id", ownerId)
        .order("due_date", { ascending: true })
    ]);

  if (eventsError || deadlinesError || occurrencesError) {
    throw new Error(
      eventsError?.message || deadlinesError?.message || occurrencesError?.message || "Failed to load data."
    );
  }

  state.events = events;
  state.deadlines = deadlines;
  state.occurrences = occurrences;
}

async function ensureRecurringOccurrences(years) {
  if (!state.user || !state.deadlines.length) {
    return;
  }

  const eventMap = new Map(state.events.map((event) => [event.id, event]));
  const existingKeys = new Set(
    state.occurrences.map((occurrence) => `${occurrence.deadline_id}:${occurrence.occurrence_year}`)
  );
  const rowsToInsert = [];

  for (const deadline of state.deadlines) {
    const event = eventMap.get(deadline.event_id);
    if (!event) {
      continue;
    }

    const candidateYears =
      event.recurrence_type === "yearly" ? years : [getYearForOneTimeDeadline(deadline, event)];

    for (const year of candidateYears) {
      if (!year) {
        continue;
      }

      const key = `${deadline.id}:${year}`;
      if (existingKeys.has(key)) {
        continue;
      }

      const dueDate = computeDeadlineDate(deadline, event, year);
      if (!dueDate) {
        continue;
      }

      rowsToInsert.push({
        owner_access_code_id: state.user.id,
        deadline_id: deadline.id,
        occurrence_year: year,
        due_date: dueDate,
        completed: false
      });
      existingKeys.add(key);
    }
  }

  if (!rowsToInsert.length) {
    return;
  }

  const { error } = await supabase.from("deadline_occurrences").insert(rowsToInsert);
  if (error) {
    throw new Error(error.message);
  }
}

function getYearForOneTimeDeadline(deadline, event) {
  if (deadline.due_mode === "specific_date" && deadline.due_date) {
    return new Date(deadline.due_date).getFullYear();
  }
  return new Date(event.event_date).getFullYear();
}

function computeDeadlineDate(deadline, event, year) {
  if (deadline.due_mode === "days_before_event") {
    const eventDate = normalizeEventDate(event, year);
    if (!eventDate) {
      return null;
    }
    eventDate.setDate(eventDate.getDate() - Number(deadline.days_before_event || 0));
    return toISODate(eventDate);
  }

  if (!deadline.due_date) {
    return null;
  }

  if (event.recurrence_type === "yearly") {
    const base = new Date(deadline.due_date);
    return toISODate(new Date(year, base.getMonth(), base.getDate()));
  }

  return deadline.due_date;
}

function render() {
  if (!state.user) {
    return;
  }

  const displayedMonths = getDisplayedMonths();
  elements.yearHeading.textContent = formatDisplayedRange(displayedMonths);
  renderCalendar(displayedMonths);
  renderUpcomingDeadlines();
}

function renderCalendar(displayedMonths) {
  const months = displayedMonths.map(({ year, monthIndex }) => {
    const date = new Date(year, monthIndex, 1);
    return {
      monthIndex,
      year,
      label: monthFormatter.format(date),
      entries: getEntriesForMonth(year, monthIndex)
    };
  });

  elements.calendarGrid.innerHTML = months
    .map(
      (month) => `
        <section class="month-card">
          <div class="month-header">
            <h3>${month.label}</h3>
            <span>${month.year} · ${month.entries.length} items</span>
          </div>
          <div class="month-track">
            ${
              month.entries.length
                ? renderDayClusters(month.entries)
                : '<p class="deadline-list-empty">Nothing scheduled here yet.</p>'
            }
          </div>
        </section>
      `
    )
    .join("");

  bindDynamicActions();
}

function renderDayClusters(entries) {
  const grouped = new Map();

  for (const entry of entries) {
    const day = new Date(entry.date).getDate();
    if (!grouped.has(day)) {
      grouped.set(day, []);
    }
    grouped.get(day).push(entry);
  }

  return Array.from(grouped.entries())
    .map(
      ([day, items]) => `
        <article class="day-cluster">
          <div class="day-number">${day}</div>
          <div class="day-items">
            ${items.map((item) => renderTimelineItem(item)).join("")}
          </div>
        </article>
      `
    )
    .join("");
}

function renderTimelineItem(item) {
  if (item.kind === "event") {
    return `
      <article class="timeline-item event">
        <div class="timeline-meta">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${weekdayFormatter.format(new Date(item.date))}</span>
        </div>
        ${item.notes ? `<p class="timeline-notes">${escapeHtml(item.notes)}</p>` : ""}
        <div class="timeline-actions">
          <span class="pill">Date</span>
          <button class="button button-link" type="button" data-action="edit-event" data-event-id="${item.eventId}">
            Edit
          </button>
        </div>
      </article>
    `;
  }

  return `
    <article class="timeline-item deadline ${item.statusClass}">
      <div class="timeline-meta">
        <strong>${escapeHtml(item.title)}</strong>
        <span>${item.statusLabel}</span>
      </div>
      <p class="deadline-context">${escapeHtml(item.eventTitle)}</p>
      ${item.notes ? `<p class="timeline-notes">${escapeHtml(item.notes)}</p>` : ""}
      <div class="timeline-actions">
        <span class="pill">Due ${formatRelativeDate(item.date)}</span>
        <button
          class="button button-link"
          type="button"
          data-action="toggle-deadline"
          data-occurrence-id="${item.occurrenceId}"
          data-next-value="${item.completed ? "false" : "true"}"
        >
          ${item.completed ? "Mark incomplete" : "Mark done"}
        </button>
      </div>
    </article>
  `;
}

function renderUpcomingDeadlines() {
  const occurrences = getVisibleDeadlineOccurrences()
    .filter((occurrence) => !occurrence.completed)
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
    .slice(0, 18);

  const stats = {
    overdue: 0,
    dueSoon: 0,
    done: 0
  };

  const now = startOfDay(today);
  const yearAhead = addDays(now, 365);

  for (const occurrence of getVisibleDeadlineOccurrences()) {
    const due = startOfDay(new Date(occurrence.due_date));
    if (due > yearAhead) {
      continue;
    }
    const diffDays = diffInDays(now, due);
    if (occurrence.completed) {
      stats.done += 1;
    } else if (diffDays < 0) {
      stats.overdue += 1;
    } else if (diffDays <= 30) {
      stats.dueSoon += 1;
    }
  }

  elements.overdueCount.textContent = String(stats.overdue);
  elements.dueSoonCount.textContent = String(stats.dueSoon);
  elements.doneCount.textContent = String(stats.done);

  if (!occurrences.length) {
    elements.deadlineList.innerHTML =
      '<p class="deadline-list-empty">No active deadlines right now. Add an event or enjoy the fact that you are ahead.</p>';
    return;
  }

  const eventMap = new Map(state.events.map((event) => [event.id, event]));
  const deadlineMap = new Map(state.deadlines.map((deadline) => [deadline.id, deadline]));

  elements.deadlineList.innerHTML = occurrences
    .map((occurrence) => {
      const deadline = deadlineMap.get(occurrence.deadline_id);
      const event = deadline ? eventMap.get(deadline.event_id) : null;
      const status = getDeadlineStatus(occurrence);
      const urgencyColor = getDeadlineUrgencyColor(occurrence);
      return `
        <article class="deadline-row ${status.className}">
          <div class="deadline-row-header">
            <div class="deadline-row-main">
              <div class="deadline-row-title">
                <span class="urgency-indicator" style="background:${urgencyColor}"></span>
                <h3>${escapeHtml(deadline?.title || "Untitled deadline")}</h3>
              </div>
              <p class="deadline-context">${escapeHtml(event?.title || "Unknown event")}</p>
            </div>
            <div class="deadline-row-meta">
              <p class="deadline-row-date">${longDateFormatter.format(new Date(occurrence.due_date))}</p>
              <span class="pill">${status.label}</span>
            </div>
          </div>
          <div class="timeline-actions">
            <button
              class="button button-link"
              type="button"
              data-action="toggle-deadline"
              data-occurrence-id="${occurrence.id}"
              data-next-value="true"
            >
              Mark done
            </button>
          </div>
        </article>
      `;
    })
    .join("");

  bindDynamicActions();
}

function getVisibleDeadlineOccurrences() {
  const eventMap = new Map(state.events.map((event) => [event.id, event]));
  const deadlineMap = new Map(state.deadlines.map((deadline) => [deadline.id, deadline]));
  const now = startOfDay(today);
  const yearAhead = addDays(now, 365);

  return state.occurrences.filter((occurrence) => {
    const deadline = deadlineMap.get(occurrence.deadline_id);
    const event = deadline ? eventMap.get(deadline.event_id) : null;
    if (!deadline || !event) {
      return false;
    }

    const due = startOfDay(new Date(occurrence.due_date));
    if (due < now || due > yearAhead) {
      return false;
    }

    if (event.recurrence_type === "yearly") {
      return (
        occurrence.occurrence_year === state.currentYear ||
        occurrence.occurrence_year === state.currentYear + 1
      );
    }

    return true;
  });
}

function getEntriesForMonth(year, monthIndex) {
  const entries = [];
  const eventMap = new Map(state.events.map((event) => [event.id, event]));
  const deadlineMap = new Map(state.deadlines.map((deadline) => [deadline.id, deadline]));

  for (const event of state.events) {
    const normalized = normalizeEventDate(event, year);
    if (!normalized || normalized.getMonth() !== monthIndex) {
      continue;
    }

    entries.push({
      kind: "event",
      eventId: event.id,
      title: event.title,
      notes: event.notes,
      date: toISODate(normalized)
    });
  }

  for (const occurrence of state.occurrences) {
    const dueDate = new Date(occurrence.due_date);
    if (dueDate.getFullYear() !== year || dueDate.getMonth() !== monthIndex) {
      continue;
    }

    const deadline = deadlineMap.get(occurrence.deadline_id);
    const event = deadline ? eventMap.get(deadline.event_id) : null;
    if (!deadline || !event) {
      continue;
    }

    const status = getDeadlineStatus(occurrence);
    entries.push({
      kind: "deadline",
      occurrenceId: occurrence.id,
      title: deadline.title,
      notes: deadline.notes,
      eventTitle: event.title,
      completed: occurrence.completed,
      statusClass: status.className,
      statusLabel: status.label,
      date: occurrence.due_date
    });
  }

  return entries.sort((a, b) => new Date(a.date) - new Date(b.date));
}

function normalizeEventDate(event, year) {
  if (!event.event_date) {
    return null;
  }

  const baseDate = new Date(event.event_date);
  if (event.recurrence_type === "yearly") {
    return new Date(year, baseDate.getMonth(), baseDate.getDate());
  }

  if (baseDate.getFullYear() !== year) {
    return null;
  }

  return baseDate;
}

function getDeadlineStatus(occurrence) {
  if (occurrence.completed) {
    return { className: "done", label: "Done" };
  }

  const due = startOfDay(new Date(occurrence.due_date));
  const diffDays = diffInDays(startOfDay(today), due);

  if (diffDays < 0) {
    return { className: "overdue", label: `${Math.abs(diffDays)}d late` };
  }

  if (diffDays <= 30) {
    return { className: "soon", label: `${diffDays}d left` };
  }

  return { className: "", label: `${diffDays}d left` };
}

function getDeadlineUrgencyColor(occurrence) {
  if (occurrence.completed) {
    return "#3d8b68";
  }

  const due = startOfDay(new Date(occurrence.due_date));
  const diffDays = diffInDays(startOfDay(today), due);

  if (diffDays <= 0) {
    return "#d94747";
  }

  if (diffDays > 30) {
    return "#4f79d9";
  }

  const ratio = (30 - diffDays) / 30;
  const start = { r: 61, g: 139, b: 104 };
  const end = { r: 217, g: 71, b: 71 };
  const r = Math.round(start.r + (end.r - start.r) * ratio);
  const g = Math.round(start.g + (end.g - start.g) * ratio);
  const b = Math.round(start.b + (end.b - start.b) * ratio);
  return `rgb(${r}, ${g}, ${b})`;
}

function bindDynamicActions() {
  document.querySelectorAll("[data-action='toggle-deadline']").forEach((button) => {
    button.onclick = async () => {
      const occurrenceId = button.dataset.occurrenceId;
      const nextValue = button.dataset.nextValue === "true";
      await toggleDeadline(occurrenceId, nextValue);
    };
  });

  document.querySelectorAll("[data-action='edit-event']").forEach((button) => {
    button.onclick = () => openEditor(button.dataset.eventId);
  });
}

async function toggleDeadline(occurrenceId, completed) {
  const payload = {
    completed,
    completed_at: completed ? new Date().toISOString() : null
  };

  const { error } = await supabase.from("deadline_occurrences").update(payload).eq("id", occurrenceId);
  if (error) {
    showStatus(error.message, true);
    return;
  }

  await refreshData();
}

function openEditor(eventId = null) {
  state.editingEventId = eventId;
  elements.dialogTitle.textContent = eventId ? "Edit event" : "Add event";
  elements.deleteEventButton.classList.toggle("hidden", !eventId);

  if (!eventId) {
    resetEditor();
    elements.editorDialog.showModal();
    return;
  }

  const event = state.events.find((entry) => entry.id === eventId);
  const deadlines = state.deadlines.filter((entry) => entry.event_id === eventId);
  if (!event) {
    return;
  }

  elements.eventId.value = event.id;
  elements.eventTitle.value = event.title;
  elements.eventDate.value = event.event_date;
  elements.eventRecurrence.value = event.recurrence_type;
  elements.eventNotes.value = event.notes || "";
  elements.deadlineFields.innerHTML = "";

  if (deadlines.length) {
    deadlines.forEach((deadline) => appendDeadlineField(deadline));
  }

  elements.editorDialog.showModal();
}

function closeEditor() {
  elements.editorDialog.close();
}

function resetEditor() {
  elements.eventForm.reset();
  elements.eventId.value = "";
  elements.deadlineFields.innerHTML = "";
  state.editingEventId = null;
}

function appendDeadlineField(deadline = null) {
  const fragment = elements.deadlineFieldTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".deadline-card");
  const idInput = fragment.querySelector(".deadline-id");
  const titleInput = fragment.querySelector(".deadline-title");
  const modeInput = fragment.querySelector(".deadline-mode");
  const daysInput = fragment.querySelector(".deadline-days");
  const dateInput = fragment.querySelector(".deadline-date");
  const notesInput = fragment.querySelector(".deadline-notes");
  const daysGroup = fragment.querySelector(".deadline-days-group");
  const dateGroup = fragment.querySelector(".deadline-date-group");
  const removeButton = fragment.querySelector(".deadline-remove");

  if (deadline) {
    idInput.value = deadline.id;
    titleInput.value = deadline.title;
    modeInput.value = deadline.due_mode;
    daysInput.value = deadline.days_before_event ?? 30;
    dateInput.value = deadline.due_date || "";
    notesInput.value = deadline.notes || "";
  }

  const syncMode = () => {
    const isRelative = modeInput.value === "days_before_event";
    daysGroup.classList.toggle("hidden", !isRelative);
    dateGroup.classList.toggle("hidden", isRelative);
    daysInput.required = isRelative;
    dateInput.required = !isRelative;
  };

  modeInput.addEventListener("change", syncMode);
  removeButton.addEventListener("click", () => {
    card.remove();
  });

  syncMode();
  elements.deadlineFields.appendChild(fragment);
}

async function handleEventSubmit(event) {
  event.preventDefault();

  if (!state.user) {
    showStatus("Enter your code again before editing your planner.", true);
    return;
  }

  const previousEvent = elements.eventId.value
    ? state.events.find((entry) => entry.id === elements.eventId.value)
    : null;
  const eventPayload = {
    owner_access_code_id: state.user.id,
    title: elements.eventTitle.value.trim(),
    event_date: elements.eventDate.value,
    recurrence_type: elements.eventRecurrence.value,
    notes: elements.eventNotes.value.trim() || null,
    archived: false
  };

  if (!eventPayload.title || !eventPayload.event_date) {
    showStatus("Event title and date are required.", true);
    return;
  }

  let savedEventId = elements.eventId.value;
  if (savedEventId) {
    const { error } = await supabase.from("events").update(eventPayload).eq("id", savedEventId);
    if (error) {
      showStatus(error.message, true);
      return;
    }
  } else {
    const { data, error } = await supabase.from("events").insert(eventPayload).select("id").single();
    if (error) {
      showStatus(error.message, true);
      return;
    }
    savedEventId = data.id;
  }

  const deadlinePayloads = collectDeadlinePayloads(savedEventId);
  const currentDeadlines = state.deadlines.filter((entry) => entry.event_id === savedEventId);
  const currentDeadlineMap = new Map(currentDeadlines.map((entry) => [entry.id, entry]));
  const incomingIds = new Set(deadlinePayloads.filter((item) => item.id).map((item) => item.id));
  const toArchive = currentDeadlines.filter((item) => !incomingIds.has(item.id)).map((item) => item.id);
  const occurrenceRefreshIds = new Set();

  if (
    previousEvent &&
    (previousEvent.event_date !== eventPayload.event_date ||
      previousEvent.recurrence_type !== eventPayload.recurrence_type)
  ) {
    currentDeadlines.forEach((deadline) => occurrenceRefreshIds.add(deadline.id));
  }

  for (const payload of deadlinePayloads) {
    const { id, ...row } = payload;
    if (id) {
      const current = currentDeadlineMap.get(id);
      if (
        current &&
        (current.due_mode !== row.due_mode ||
          current.due_date !== row.due_date ||
          current.days_before_event !== row.days_before_event)
      ) {
        occurrenceRefreshIds.add(id);
      }
      const { error } = await supabase.from("deadlines").update(row).eq("id", id);
      if (error) {
        showStatus(error.message, true);
        return;
      }
    } else {
      const { error } = await supabase.from("deadlines").insert(row);
      if (error) {
        showStatus(error.message, true);
        return;
      }
    }
  }

  if (occurrenceRefreshIds.size) {
    const { error: deleteOccurrencesError } = await supabase
      .from("deadline_occurrences")
      .delete()
      .in("deadline_id", Array.from(occurrenceRefreshIds));
    if (deleteOccurrencesError) {
      showStatus(deleteOccurrencesError.message, true);
      return;
    }
  }

  if (toArchive.length) {
    const { error: archiveError } = await supabase
      .from("deadlines")
      .update({ archived: true })
      .in("id", toArchive);
    if (archiveError) {
      showStatus(archiveError.message, true);
      return;
    }

    const { error: deleteArchivedOccurrencesError } = await supabase
      .from("deadline_occurrences")
      .delete()
      .in("deadline_id", toArchive);
    if (deleteArchivedOccurrencesError) {
      showStatus(deleteArchivedOccurrencesError.message, true);
      return;
    }
  }

  closeEditor();
  await refreshData();
}

function collectDeadlinePayloads(eventId) {
  return Array.from(elements.deadlineFields.querySelectorAll(".deadline-card"))
    .map((card, index) => {
      const mode = card.querySelector(".deadline-mode").value;
      const dueDate = card.querySelector(".deadline-date").value || null;
      const daysBefore = card.querySelector(".deadline-days").value;
      return {
        id: card.querySelector(".deadline-id").value || null,
        owner_access_code_id: state.user.id,
        event_id: eventId,
        title: card.querySelector(".deadline-title").value.trim(),
        notes: card.querySelector(".deadline-notes").value.trim() || null,
        due_mode: mode,
        due_date: mode === "specific_date" ? dueDate : null,
        days_before_event: mode === "days_before_event" ? Number(daysBefore || 0) : null,
        sort_order: index,
        archived: false
      };
    })
    .filter((payload) => payload.title);
}

async function handleDeleteEvent() {
  const eventId = elements.eventId.value;
  if (!eventId) {
    return;
  }

  const eventDeadlines = state.deadlines
    .filter((deadline) => deadline.event_id === eventId)
    .map((deadline) => deadline.id);

  const { error: eventError } = await supabase.from("events").update({ archived: true }).eq("id", eventId);
  if (eventError) {
    showStatus(eventError.message, true);
    return;
  }

  if (eventDeadlines.length) {
    const { error: deadlinesError } = await supabase
      .from("deadlines")
      .update({ archived: true })
      .in("id", eventDeadlines);
    if (deadlinesError) {
      showStatus(deadlinesError.message, true);
      return;
    }

    const { error: occurrencesError } = await supabase
      .from("deadline_occurrences")
      .delete()
      .in("deadline_id", eventDeadlines);
    if (occurrencesError) {
      showStatus(occurrencesError.message, true);
      return;
    }
  }

  closeEditor();
  await refreshData();
}

function getDisplayedMonths() {
  const startMonth = today.getMonth();
  return Array.from({ length: 12 }, (_, offset) => {
    const absoluteMonth = startMonth + offset;
    return {
      monthIndex: absoluteMonth % 12,
      year: state.currentYear + Math.floor(absoluteMonth / 12)
    };
  });
}

function formatDisplayedRange(displayedMonths) {
  const first = displayedMonths[0];
  const last = displayedMonths[displayedMonths.length - 1];

  if (first.year === last.year) {
    return String(first.year);
  }

  return `${monthFormatter.format(new Date(first.year, first.monthIndex, 1))} ${first.year} - ${monthFormatter.format(new Date(last.year, last.monthIndex, 1))} ${last.year}`;
}

function showStatus(message, isError = false) {
  elements.statusBanner.textContent = message;
  elements.statusBanner.classList.remove("hidden");
  elements.statusBanner.style.background = isError
    ? "rgba(255, 229, 221, 0.95)"
    : "rgba(228, 244, 233, 0.92)";
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function diffInDays(start, end) {
  return Math.round((end - start) / 86400000);
}

function toISODate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function formatRelativeDate(dateString) {
  const target = startOfDay(new Date(dateString));
  const days = diffInDays(startOfDay(today), target);
  if (days === 0) {
    return "today";
  }
  if (days > 0) {
    return `in ${days}d`;
  }
  return `${Math.abs(days)}d ago`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
