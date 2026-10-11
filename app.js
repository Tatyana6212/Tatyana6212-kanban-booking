(() => {
  'use strict';
  const STORAGE_KEY = 'kanban-board.stage1.v1';
  const THEME_KEY = 'kanban-board.theme';
  const palette = [
    { color: '#f87171', name: 'Красный' }, { color: '#e879f9', name: 'Малиновый' },
    { color: '#fb923c', name: 'Оранжевый' }, { color: '#818cf8', name: 'Синий' },
    { color: '#60a5fa', name: 'Голубой' }, { color: '#4ade80', name: 'Зелёный' },
    { color: '#22d3ee', name: 'Лазурный' }, { color: '#fca5a5', name: 'Светло-красный' },
    { color: '#f0abfc', name: 'Светло-малиновый' }, { color: '#fdba74', name: 'Светло-оранжевый' },
    { color: '#a5b4fc', name: 'Светло-синий' }, { color: '#93c5fd', name: 'Светло-голубой' },
    { color: '#86efac', name: 'Светло-зелёный' }, { color: '#67e8f9', name: 'Светло-лазурный' }
  ];
  const id = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const initialColumns = () => ['', 'Принято', 'В деле', 'Закончено'].map((name, index) => ({ id: id(), name, color: palette[index].color, cards: [] }));
  const board = document.querySelector('#board');
  const calendarView = document.querySelector('#calendar-view');
  const calendarGrid = document.querySelector('#calendar-grid');
  const columnInput = document.querySelector('#card-column');
  let currentView = 'board';
  let masterView = 'board';
  const clientView = document.querySelector('#client-view');
  const clientForm = document.querySelector('#client-form');
  const clientService = document.querySelector('#client-service');
  const clientDuration = document.querySelector('#client-duration');
  const clientDate = document.querySelector('#client-date');
  const clientSlots = document.querySelector('#client-slots');
  let clientTime = '';
  const monthStart = date => new Date(date.getFullYear(), date.getMonth(), 1, 12);
  let calendarMonth = monthStart(new Date());
  const localDateKey = date => `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  function scheduled(card) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(card.date || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(card.time || '')) return false;
    const date = new Date(`${card.date}T12:00:00`);
    return !Number.isNaN(date.getTime()) && localDateKey(date) === card.date;
  }
  const dialog = document.querySelector('#card-dialog');
  const form = document.querySelector('#card-form');
  const titleInput = document.querySelector('#card-title');
  const descriptionInput = document.querySelector('#card-description');
  const statusInput = document.querySelector('#card-status');
  const durationInput = document.querySelector('#card-duration');
  const WORK_START = 8 * 60;
  const WORK_END = 18 * 60;
  let timeSelectionCleared = false;
  const durations = [30, 45, 60, 90, 120, 150, 180];
  const durationOf = card => durations.includes(card.duration) ? card.duration : 60;
  const durationLabel = card => durationOf(card) < 60 ? `${durationOf(card)} мин` : `${durationOf(card) / 60} ч`;
  const dayMinute = date => Date.parse(`${date}T00:00:00Z`) / 60000;
  const clockMinute = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  const minuteClock = minutes => `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  function withinWorkHours(time, duration) {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(time) && clockMinute(time) >= WORK_START && clockMinute(time) + duration <= WORK_END;
  }
  function refreshTimeOptions(preferred = bookingFields.time.value) {
    const duration = durationOf({ duration: Number(durationInput.value) });
    const times = [];
    for (let minute = WORK_START; minute + duration <= WORK_END; minute += 15) times.push(minuteClock(minute));
    if (preferred && withinWorkHours(preferred, duration) && !times.includes(preferred)) { times.push(preferred); times.sort(); }
    bookingFields.time.replaceChildren();
    const placeholder = element('option', '', 'Без времени'); placeholder.value = ''; bookingFields.time.append(placeholder);
    for (const time of times) { const option = element('option', '', time); option.value = time; bookingFields.time.append(option); }
    const fits = times.includes(preferred);
    bookingFields.time.value = fits ? preferred : '';
    if (preferred) timeSelectionCleared = !fits;
    document.querySelector('#time-selection-note').textContent = timeSelectionCleared ? `Выбранное начало не подходит для длительности услуги и смены 08:00–18:00. Выберите другое время.` : '';
  }
  function intervalOf(card) {
    if (!scheduled(card)) return null;
    const start = dayMinute(card.date) + clockMinute(card.time);
    return { start, end: start + durationOf(card) };
  }
  const overlaps = (a, b) => a && b && a.start < b.end && b.start < a.end;
  function timingData(card) {
    const interval = intervalOf(card);
    const end = interval ? new Date(interval.end * 60000).toISOString() : '';
    return { duration: durationOf(card), endTime: end.slice(11, 16), endDate: end.slice(0, 10) };
  }
  function timeRange(card) {
    const end = timingData(card);
    return `${card.time}–${end.endTime}${end.endDate !== card.date ? ' (+1 день)' : ''}`;
  }
  function durationBadge(card) { return element('span', 'booking-duration', `⏱️ ${durationLabel(card)}`); }
  const statuses = { new: 'Новая', confirmed: 'Подтверждена', completed: 'Завершено' };
  const cardStatus = card => Object.hasOwn(statuses, card.status) ? card.status : 'new';
  const contactDialog = document.querySelector('#contact-dialog');
  let contactReturnFocus = null;
  function phoneData(value) {
    let digits = value.replace(/\D/g, '');
    if (!/^[+\d\s().-]+$/.test(value)) return { label: value, number: '' };
    if (digits.length === 10) digits = `7${digits}`;
    if (digits.length === 11 && digits[0] === '8') digits = `7${digits.slice(1)}`;
    if (digits.length === 11 && digits[0] === '7') return { label: `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9)}`, number: digits };
    return { label: value, number: value.trim().startsWith('+') && /^[1-9]\d{7,14}$/.test(digits) ? digits : '' };
  }
  const bookingFields = Object.fromEntries(['clientName', 'phone', 'date', 'time', 'service'].map((field, index) =>
    [field, document.querySelector(['#card-client', '#card-phone', '#card-date', '#card-time', '#card-service'][index])]));
  function bookingData(card) {
    return Object.fromEntries(Object.keys(bookingFields).map(field => [field, typeof card[field] === 'string' ? card[field] : '']));
  }
  function displayDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
  }
  const storageLabel = document.querySelector('#storage-label');
  const columnDialog = document.querySelector('#column-dialog');
  const columnForm = document.querySelector('#column-form');
  const cardDeleteButton = document.querySelector('#delete-card');
  const columnDeleteButton = document.querySelector('#delete-column');
  const fileMenu = document.querySelector('#file-menu');
  const fileMenuTrigger = document.querySelector('#file-menu-trigger');
  const fileInput = document.querySelector('#file-input');
  const themeToggle = document.querySelector('#theme-toggle');
  const themeIcon = document.querySelector('#theme-icon');
  const cardColorInput = document.querySelector('#card-color');
  const columnColorInput = document.querySelector('#column-color');
  let columns = initialColumns();
  let targetColumnId = null;
  let editingCard = null;
  const dayDialog = document.querySelector('#day-dialog');
  const daySchedule = document.querySelector('#day-schedule');
  const conflictHint = document.querySelector('#time-conflict');
  let selectedDay = '';
  let dayReturnFocus = null;
  let reopenDayAfterForm = false;
  function dayEntries(date) {
    const day = { start: dayMinute(date), end: dayMinute(date) + 1440 };
    return columns.flatMap(column => column.cards.filter(card => overlaps(intervalOf(card), day)).map(card => ({ column, card })))
      .sort((a, b) => intervalOf(a.card).start - intervalOf(b.card).start || a.card.title.localeCompare(b.card.title, 'ru'));
  }
  function updateTimeConflict() {
    const date = bookingFields.date.value;
    const time = bookingFields.time.value;
    const candidate = { date, time, duration: Number(durationInput.value) };
    const interval = intervalOf(candidate);
    const conflicts = interval ? columns.flatMap(column => column.cards.filter(card => overlaps(interval, intervalOf(card)) && !(editingCard?.columnId === column.id && editingCard?.cardId === card.id)).map(card => ({ column, card }))) : [];
    const outsideShift = Boolean(time && !withinWorkHours(time, durationOf(candidate)));
    document.querySelector('#booking-end').textContent = interval ? `Окончание: ${timingData(candidate).endTime}${timingData(candidate).endDate !== date ? ` (${displayDate(timingData(candidate).endDate)})` : ''}` : '';
    conflictHint.hidden = !outsideShift && conflicts.length === 0;
    conflictHint.textContent = outsideShift ? '⚠️ Услуга должна полностью помещаться в смену 08:00–18:00.' : conflicts.length ? `⚠️ Это время уже занято (${conflicts.map(({ card }) => `${card.clientName || card.title} — ${card.service || 'Услуга не указана'}`).join('; ')})` : '';
    bookingFields.time.setAttribute('aria-invalid', String(outsideShift || conflicts.length > 0));
    return outsideShift || conflicts.length > 0;
  }
  let editingColumnId = null;
  let returnFocus = null;
  let pointerCandidate = null;
  let activeDrag = null;
  let dragFrame = 0;
  const systemTheme = matchMedia('(prefers-color-scheme: dark)');
  let chosenTheme = null;
  try {
    const storedTheme = localStorage.getItem(THEME_KEY);
    if (storedTheme === 'dark' || storedTheme === 'light') chosenTheme = storedTheme;
  } catch { /* Keep the system preference when storage is unavailable. */ }
  function applyTheme(theme) {
    document.documentElement.classList.remove('light');
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add(theme);
    themeToggle.setAttribute('aria-pressed', String(theme === 'dark'));
    themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему');
    themeIcon.textContent = theme === 'dark' ? '☀' : '☾';
  }
  applyTheme(chosenTheme || (systemTheme.matches ? 'dark' : 'light'));
  systemTheme.addEventListener?.('change', event => { if (!chosenTheme) applyTheme(event.matches ? 'dark' : 'light'); });
  themeToggle.addEventListener('click', () => {
    chosenTheme = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
    applyTheme(chosenTheme);
    try { localStorage.setItem(THEME_KEY, chosenTheme); } catch { /* The switch still works for this visit. */ }
  });
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(stored) && stored.length >= 1 && stored.every(column => column && typeof column.id === 'string' && typeof column.name === 'string' && isColor(column.color) && Array.isArray(column.cards) && column.cards.every(card => card && typeof card.title === 'string' && typeof card.description === 'string'))) {
      columns = stored;
      columns.forEach(column => column.cards.forEach(card => {
        if (typeof card.id !== 'string') card.id = id();
        if (!isColor(card.color)) card.color = column.color;
        Object.assign(card, timingData(card));
      }));
    }
  } catch { storageLabel.textContent = 'Сохранение в браузере недоступно'; }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(columns)); return true; }
    catch { storageLabel.textContent = 'Не удалось сохранить: данные доступны до закрытия'; return false; }
  }
  function isColor(color) { return typeof color === 'string' && /^#[\da-f]{6}$/i.test(color); }
  function columnColor(color, whiteMix) {
    const channels = color.slice(1).match(/[\da-f]{2}/gi).map(value => parseInt(value, 16));
    return `rgb(${channels.map(channel => Math.round(channel + (255 - channel) * whiteMix)).join(' ')})`;
  }
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function scheduleChip(kind, text) {
    const chip = element('span', `booking-${kind}`);
    const icon = element('span', 'booking-icon');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = kind === 'date'
      ? '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-14 4h2m4 0h2"/></svg>'
      : '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
    chip.append(icon, element('span', 'booking-chip-text', text));
    chip.setAttribute('aria-label', `${kind === 'date' ? 'Дата' : 'Время'}: ${text}`);
    return chip;
  }
  function statusBadge(card) { return element('span', `booking-status status-${cardStatus(card)}`, statuses[cardStatus(card)]); }
  const trashIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v6m4-6v6"/></svg>';
  function trashButton(kind, item) {
    const button = element('button', 'tile-delete');
    button.type = 'button';
    button.dataset[kind === 'card' ? 'deleteCardId' : 'deleteColumnId'] = item.id;
    button.setAttribute('aria-label', `Удалить ${kind === 'card' ? 'карточку' : 'колонку'} «${item.title || item.name || 'Без названия'}»`);
    button.title = kind === 'card' ? 'Удалить карточку' : 'Удалить колонку';
    button.innerHTML = trashIcon;
    return button;
  }
  function renderPalette(container, input) {
    palette.forEach(color => {
      const button = element('button', 'palette-swatch');
      button.type = 'button';
      button.dataset.color = color.color;
      button.style.setProperty('--swatch', color.color);
      button.setAttribute('aria-label', color.name);
      button.title = color.name;
      button.addEventListener('click', () => { input.value = color.color; updatePalette(container, input); });
      container.append(button);
    });
    input.addEventListener('input', () => updatePalette(container, input));
  }
  function updatePalette(container, input) {
    container.querySelectorAll('.palette-swatch').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.color.toLowerCase() === input.value.toLowerCase())));
  }
  renderPalette(document.querySelector('#card-palette'), cardColorInput);
  renderPalette(document.querySelector('#column-palette'), columnColorInput);
  function addButton(column) {
    const button = element('button', column ? 'add-card' : 'add-card add-column');
    button.type = 'button';
    button.dataset.columnId = column?.id || '';
    const plus = element('span', 'plus', '+');
    plus.setAttribute('aria-hidden', 'true');
    button.append(plus, element('span', '', 'Добавить карточку'));
    if (!column) button.append(element('small', '', 'в новой колонке'));
    button.setAttribute('aria-label', column ? `Добавить карточку: ${column.name || 'колонка без названия'}` : 'Добавить карточку в новой колонке');
    return button;
  }
  function render() {
    board.replaceChildren();
    columns.forEach(column => {
      const section = element('section', 'column');
      section.dataset.columnId = column.id;
      section.setAttribute('aria-label', column.name || 'Колонка без названия');
      section.style.setProperty('--column-color', column.color);
      section.style.setProperty('--column-bg', columnColor(column.color, .91));
      section.style.setProperty('--column-border', columnColor(column.color, .82));
      const header = element('header', 'column-header');
      header.dataset.dragHandle = 'column';
      header.dataset.columnId = column.id;
      header.setAttribute('aria-label', `Перетащить колонку «${column.name || 'Без названия'}»`);
      const heading = element('div', 'column-heading');
      const dot = element('span', 'color-dot');
      dot.setAttribute('aria-hidden', 'true');
      heading.append(dot, element('h2', '', column.name));
      const headerActions = element('div', 'column-header-actions');
      headerActions.append(element('span', 'card-count', String(column.cards.length)));
      const editColumnButton = element('button', 'edit-column-button', '···');
      editColumnButton.type = 'button'; editColumnButton.dataset.editColumnId = column.id;
      editColumnButton.setAttribute('aria-label', `Настроить колонку «${column.name || 'Без названия'}»`);
      headerActions.append(editColumnButton, trashButton('column', column));
      header.append(heading, headerActions);
      const cards = element('div', 'cards');
      column.cards.forEach(card => {
        const tile = element('article', 'card');
        tile.dataset.cardId = card.id;
        tile.style.setProperty('--card-color', card.color || column.color);
        tile.setAttribute('role', 'button');
        tile.setAttribute('tabindex', '0');
        tile.setAttribute('aria-label', `Редактировать карточку «${card.title}»; перетащить для перемещения`);
        const booking = bookingData(card);
        const heading = element('div', 'card-heading');
        heading.append(element('h3', 'card-title', card.title));
        if (!booking.clientName || booking.clientName === card.title) heading.append(statusBadge(card));
        tile.append(heading);
        tile.classList.add('booking-card');
        if (Object.values(booking).some(Boolean)) {
          tile.classList.add('booking-card');
          const details = element('div', 'booking-details');
          if (booking.clientName && booking.clientName !== card.title) {
            const identity = element('div', 'booking-identity');
            identity.append(element('span', 'booking-client', booking.clientName), statusBadge(card));
            details.append(identity);
          }
          if (booking.service) {
            const service = element('div', 'booking-service');
            service.append(element('span', 'booking-label', 'Услуга'), element('span', 'booking-value', booking.service));
            details.append(service);
          }
          if (booking.date || booking.time) {
            const schedule = element('div', 'booking-schedule');
            if (booking.date) schedule.append(scheduleChip('date', displayDate(booking.date)));
            if (booking.time) { schedule.append(scheduleChip('time', scheduled(card) ? timeRange(card) : booking.time), durationBadge(card)); }
            details.append(schedule);
          }
          if (booking.phone) {
            const data = phoneData(booking.phone);
            const phone = element(data.number ? 'button' : 'div', 'booking-phone', data.label);
            if (data.number) {
              phone.type = 'button'; phone.dataset.contactNumber = data.number;
              phone.setAttribute('aria-label', `Связаться с клиентом: ${data.label}`);
              phone.setAttribute('aria-haspopup', 'dialog');
              phone.title = 'WhatsApp, MAX или звонок';
            }
            details.append(phone);
          }
          tile.append(details);
        }
        if (card.description) tile.append(element('p', '', card.description));
        tile.append(trashButton('card', card));
        cards.append(tile);
      });
      cards.append(addButton(column));
      section.append(header, cards);
      board.append(section);
    });
    board.append(addButton(null));
    updateScrollControls();
    renderCalendar();
    if (currentView === 'client') renderClientSlots();
  }
  function renderCalendar() {
    calendarGrid.replaceChildren();
    document.querySelector('#calendar-month').textContent = calendarMonth.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    const start = new Date(calendarMonth);
    start.setDate(1 - (start.getDay() + 6) % 7);
    const today = localDateKey(new Date());
    const entries = columns.flatMap(column => column.cards.filter(scheduled).map(card => ({ column, card })))
      .sort((a, b) => a.card.time.localeCompare(b.card.time) || a.card.title.localeCompare(b.card.title, 'ru'));
    const byDate = new Map();
    for (const entry of entries) {
      const interval = intervalOf(entry.card);
      for (let day = Math.floor(interval.start / 1440) * 1440; day < interval.end; day += 1440) {
        const date = new Date(day * 60000).toISOString().slice(0, 10);
        if (!byDate.has(date)) byDate.set(date, []);
        byDate.get(date).push(entry);
      }
    }
    const nextMonth = new Date(calendarMonth); nextMonth.setMonth(nextMonth.getMonth() + 1);
    const monthInterval = { start: dayMinute(localDateKey(calendarMonth)), end: dayMinute(localDateKey(nextMonth)) };
    const count = entries.filter(entry => overlaps(intervalOf(entry.card), monthInterval)).length;
    document.querySelector('#calendar-summary').textContent = count ? `Записей в этом месяце: ${count}` : 'В этом месяце пока нет записей. Нажмите на нужный день, чтобы добавить первую.';
    for (let index = 0; index < 42; index++) {
      const date = new Date(start); date.setDate(start.getDate() + index);
      const key = localDateKey(date);
      const cell = element('section', 'calendar-day');
      cell.dataset.calendarDate = key;
      if (date.getMonth() !== calendarMonth.getMonth()) cell.classList.add('outside-month');
      if (key === today) cell.classList.add('is-today');
      const dayButton = element('button', 'calendar-day-button', String(date.getDate()));
      dayButton.type = 'button'; dayButton.dataset.calendarDate = key;
      dayButton.setAttribute('aria-label', `Расписание дня: ${date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}`);
      if (key === today) dayButton.setAttribute('aria-current', 'date');
      cell.append(dayButton);
      const dayBookings = byDate.get(key) || [];
      if (dayBookings.length) {
        cell.classList.add('has-bookings');
        const count = element('span', 'calendar-day-count', `Записей: ${dayBookings.length}`);
        cell.append(count);
      }
      for (const { column, card } of dayBookings) {
        const appointment = element('button', `calendar-event event-${cardStatus(card)}`);
        appointment.type = 'button'; appointment.dataset.calendarCardId = card.id; appointment.dataset.columnId = column.id;
        appointment.style.setProperty('--event-color', card.color || column.color);
        appointment.setAttribute('aria-label', `${card.time}, ${card.clientName || card.title}, ${card.service || card.title}, ${statuses[cardStatus(card)]}. Редактировать запись`);
        appointment.append(element('span', 'calendar-event-time', card.date === key ? card.time : `до ${timingData(card).endTime}`), element('span', 'calendar-event-name', card.clientName || card.title));
        appointment.append(element('span', 'calendar-event-range', timeRange(card)), durationBadge(card));
        if (entries.some(entry => entry.card !== card && overlaps(intervalOf(entry.card), intervalOf(card)))) {
          appointment.classList.add('has-conflict');
          appointment.append(element('span', 'calendar-conflict-label', '⚠ Пересечение записей'));
        }
        if (card.service) appointment.append(element('span', 'calendar-event-service', card.service));
        appointment.append(statusBadge(card));
        cell.append(appointment);
      }
      calendarGrid.append(cell);
    }
    if (dayDialog.open) renderDaySchedule();
  }
  function setView(view) {
    currentView = view;
    document.querySelector('#master-header').hidden = view === 'client';
    clientView.hidden = view !== 'client';
    board.hidden = view !== 'board'; calendarView.hidden = view !== 'calendar';
    document.querySelector('#view-board').setAttribute('aria-pressed', String(view === 'board'));
    document.querySelector('#view-calendar').setAttribute('aria-pressed', String(view === 'calendar'));
    document.querySelector('#scroll-left').hidden = view !== 'board';
    document.querySelector('#scroll-right').hidden = view !== 'board';
    if (view !== 'client') masterView = view;
    if (view === 'calendar') renderCalendar(); else if (view === 'client') renderClientSlots(); else updateScrollControls();
  }
  function availableClientTimes() {
    const date = clientDate.value;
    const duration = Number(clientDuration.value);
    const today = new Date();
    if (!durations.includes(duration) || !scheduled({ date, time: '08:00' }) || date < localDateKey(today)) return [];
    const nowMinute = today.getHours() * 60 + today.getMinutes();
    const times = [];
    for (let minute = WORK_START; minute + duration <= WORK_END; minute += 30) {
      if (date === localDateKey(today) && minute <= nowMinute) continue;
      const time = minuteClock(minute);
      const candidate = intervalOf({ date, time, duration });
      if (!columns.some(column => column.cards.some(card => overlaps(candidate, intervalOf(card))))) times.push(time);
    }
    return times;
  }
  function renderClientSlots() {
    clientSlots.replaceChildren();
    const ready = Boolean(clientService.value.trim() && clientDate.value && durations.includes(Number(clientDuration.value)));
    const times = ready ? availableClientTimes() : [];
    if (!times.includes(clientTime)) clientTime = '';
    document.querySelector('#client-contact').hidden = !clientTime;
    document.querySelector('#client-name').disabled = !clientTime;
    document.querySelector('#client-phone').disabled = !clientTime;
    document.querySelector('#client-slots-hint').textContent = !ready ? 'Выберите услугу, её длительность и дату, чтобы увидеть свободное время.' : times.length ? 'Свободное время начала — выберите удобное.' : 'На эту дату свободного времени нет. Выберите другую дату или длительность.';
    for (const time of times) {
      const button = element('button', 'client-slot', time);
      button.type = 'button'; button.dataset.clientTime = time;
      button.setAttribute('aria-pressed', String(time === clientTime));
      button.setAttribute('aria-label', `Выбрать свободное время ${time}`);
      clientSlots.append(button);
    }
    if (clientTime) {
      const booking = { date: clientDate.value, time: clientTime, duration: Number(clientDuration.value) };
      document.querySelector('#client-selection').textContent = `${clientService.value.trim()} · ${displayDate(booking.date)} · ${timeRange(booking)} · ${durationLabel(booking)}`;
    }
  }
  document.querySelector('#view-client').addEventListener('click', () => {
    clientDate.min = localDateKey(new Date());
    if (!clientDate.value || clientDate.value < clientDate.min) clientDate.value = clientDate.min;
    if (!durations.includes(Number(clientDuration.value))) clientDuration.value = '60';
    const suggestions = document.querySelector('#client-services'); suggestions.replaceChildren();
    const services = [...new Set(columns.flatMap(column => column.cards.map(card => card.service).filter(value => typeof value === 'string' && value.trim())).map(value => value.trim()))].sort((a, b) => a.localeCompare(b, 'ru'));
    for (const service of services) { const option = element('option'); option.value = service; suggestions.append(option); }
    setView('client'); document.querySelector('#client-title').focus();
  });
  document.querySelector('#client-back').addEventListener('click', () => { setView(masterView); document.querySelector('#view-client').focus(); });
  for (const input of [clientService, clientDuration, clientDate]) for (const event of ['input', 'change']) input.addEventListener(event, () => {
    clientTime = ''; document.querySelector('#client-error').textContent = ''; document.querySelector('#client-success').hidden = true; renderClientSlots();
  });
  clientSlots.addEventListener('click', event => {
    const button = event.target.closest('[data-client-time]');
    if (!button) return;
    clientTime = button.dataset.clientTime; document.querySelector('#client-error').textContent = ''; document.querySelector('#client-success').hidden = true; renderClientSlots();
    if (clientTime) document.querySelector('#client-name').focus();
  });
  clientForm.addEventListener('submit', event => {
    event.preventDefault();
    const error = document.querySelector('#client-error'); error.textContent = '';
    const service = clientService.value.trim();
    const name = document.querySelector('#client-name').value.trim();
    const phone = document.querySelector('#client-phone').value.trim();
    if (!service || service.length > 200) { error.textContent = 'Укажите услугу.'; clientService.focus(); return; }
    if (!clientTime || !availableClientTimes().includes(clientTime)) {
      error.textContent = 'Это время уже недоступно. Выберите свободное время.'; clientTime = ''; renderClientSlots(); return;
    }
    if (!name || name.length > 200) { error.textContent = 'Введите ваше имя.'; document.querySelector('#client-name').focus(); return; }
    if (!phoneData(phone).number || phone.length > 50) { error.textContent = 'Введите полный номер телефона.'; document.querySelector('#client-phone').focus(); return; }
    let column = columns.find(column => column.name.trim().toLocaleLowerCase('ru') === 'новая запись');
    if (!column) { column = { id: id(), name: 'Новая запись', color: '#60a5fa', cards: [] }; columns.unshift(column); }
    const booking = { date: clientDate.value, time: clientTime, duration: Number(clientDuration.value) };
    column.cards.push({ id: id(), title: name, clientName: name, phone, service, ...booking, ...timingData(booking), status: 'new', description: '', color: column.color });
    const persisted = save();
    const confirmation = `${service} · ${displayDate(booking.date)} · ${timeRange(booking)}`;
    clientTime = ''; document.querySelector('#client-name').value = ''; document.querySelector('#client-phone').value = '';
    render();
    const success = document.querySelector('#client-success');
    success.textContent = persisted ? `Вы записаны! ${confirmation}. Ждём вас.` : `Запись добавлена, но сохранение в браузере недоступно. ${confirmation}. Данные доступны до закрытия страницы.`;
    success.hidden = false; success.focus();
  });
  function focusCalendarDate(date) {
    if (currentView !== 'calendar' || dayDialog.open) return;
    const button = Array.from(calendarGrid.querySelectorAll('.calendar-day-button')).find(node => node.dataset.calendarDate === date);
    (button || document.querySelector('#view-calendar')).focus({ preventScroll: true });
  }
  document.querySelector('#view-board').addEventListener('click', () => setView('board'));
  document.querySelector('#view-calendar').addEventListener('click', () => setView('calendar'));
  for (const [selector, step] of [['#calendar-prev', -1], ['#calendar-next', 1]]) {
    document.querySelector(selector).addEventListener('click', () => { calendarMonth.setMonth(calendarMonth.getMonth() + step); renderCalendar(); });
  }
  document.querySelector('#calendar-today').addEventListener('click', () => { calendarMonth = monthStart(new Date()); renderCalendar(); });
  calendarGrid.addEventListener('click', event => {
    const appointment = event.target.closest('[data-calendar-card-id]');
    if (appointment) { openCardEditor(appointment.dataset.columnId, appointment.dataset.calendarCardId, appointment); return; }
    const day = event.target.closest('[data-calendar-date]');
    if (day) openDay(day.dataset.calendarDate, day);
  });
  function renderDaySchedule() {
    daySchedule.replaceChildren();
    document.querySelector('#day-title').textContent = `Расписание на ${displayDate(selectedDay)}`;
    const entries = dayEntries(selectedDay);
    document.querySelector('#day-summary').textContent = entries.length ? `Записей: ${entries.length} · занятое время выделено цветом` : 'Пока нет записей — выберите удобное время.';
    for (let hour = WORK_START / 60; hour < WORK_END / 60; hour++) {
      const prefix = String(hour).padStart(2, '0');
      const row = element('section', 'day-hour'); row.dataset.hour = prefix;
      row.append(element('h3', 'day-hour-label', `${prefix}:00`));
      const slots = element('div', 'day-hour-slots');
      const times = [`${prefix}:00`, `${prefix}:30`];
      for (const time of times) {
        const start = dayMinute(selectedDay) + clockMinute(time);
        const bookings = entries.filter(entry => overlaps(intervalOf(entry.card), { start, end: start + 30 }));
        if (!bookings.length) {
          const free = element('button', 'day-free-slot', `${time} · свободно 30 мин`);
          free.type = 'button'; free.dataset.slotTime = time;
          free.setAttribute('aria-label', `Создать запись на ${displayDate(selectedDay)} в ${time}, время начала свободно`);
          slots.append(free);
        } else for (const { column, card } of bookings) {
          const occupied = element('button', 'day-booking');
          occupied.type = 'button'; occupied.dataset.dayCardId = card.id; occupied.dataset.columnId = column.id;
          occupied.dataset.slotTimeLabel = time;
          occupied.style.setProperty('--event-color', card.color || column.color);
          occupied.append(element('span', 'day-booking-slot', `${time} · занято`), element('span', 'day-booking-time', timeRange(card)), element('span', 'day-booking-client', card.clientName || card.title), durationBadge(card));
          if (card.service) occupied.append(element('span', 'day-booking-service', card.service));
          occupied.append(statusBadge(card));
          if (entries.some(entry => entry.card !== card && overlaps(intervalOf(entry.card), intervalOf(card)))) occupied.append(element('span', 'calendar-conflict-label', '⚠ Пересечение записей'));
          slots.append(occupied);
        }
      }
      row.append(slots); daySchedule.append(row);
    }
  }
  function openDay(date, focusTarget) {
    selectedDay = date;
    if (focusTarget) dayReturnFocus = focusTarget;
    renderDaySchedule();
    dayDialog.showModal();
    const firstCard = dayEntries(date)[0]?.card;
    const firstHour = firstCard ? (firstCard.date < date ? '00' : firstCard.time.slice(0, 2)) : '08';
    Array.from(daySchedule.querySelectorAll('.day-hour')).find(row => row.dataset.hour === firstHour)?.scrollIntoView?.({ block: 'nearest' });
  }
  function startDayBooking(focusTarget, time = '') {
    dayDialog.close();
    openCardCreator(columns[0]?.id || null, focusTarget, selectedDay);
    if (time && clockMinute(time) + Number(durationInput.value) > WORK_END) durationInput.value = '30';
    refreshTimeOptions(time);
    bookingFields.time.value = time;
    updateTimeConflict();
    reopenDayAfterForm = true;
  }
  daySchedule.addEventListener('click', event => {
    const booking = event.target.closest('[data-day-card-id]');
    if (booking) {
      dayDialog.close();
      openCardEditor(booking.dataset.columnId, booking.dataset.dayCardId, booking);
      reopenDayAfterForm = true;
      return;
    }
    const slot = event.target.closest('[data-slot-time]');
    if (slot) startDayBooking(slot, slot.dataset.slotTime);
  });
  document.querySelector('#day-create').addEventListener('click', event => startDayBooking(event.target));
  document.querySelector('#close-day').addEventListener('click', () => dayDialog.close());
  dayDialog.addEventListener('close', () => {
    if (dayReturnFocus?.isConnected) dayReturnFocus.focus({ preventScroll: true });
    else focusCalendarDate(selectedDay);
  });
  function updateScrollControls() {
    document.querySelector('#scroll-left').disabled = board.scrollLeft <= 1;
    document.querySelector('#scroll-right').disabled = board.scrollLeft + board.clientWidth >= board.scrollWidth - 2;
  }
  function animateShift(parent, move) {
    const children = Array.from(parent.children);
    const oldRects = new Map(children.map(child => [child, child.getBoundingClientRect()]));
    move();
    for (const child of parent.children) {
      const oldRect = oldRects.get(child);
      if (!oldRect || child === activeDrag?.placeholder) continue;
      const rect = child.getBoundingClientRect();
      const dx = oldRect.left - rect.left;
      const dy = oldRect.top - rect.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      child.style.transition = 'none';
      child.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => {
        child.style.transition = '';
        child.style.transform = '';
      });
    }
  }
  function movePlaceholder(parent, before = null) {
    if (!activeDrag || activeDrag.placeholder.parentElement === parent && activeDrag.placeholder.nextElementSibling === before) return;
    animateShift(parent, () => parent.insertBefore(activeDrag.placeholder, before));
  }
  function beginDrag(point) {
    if (!pointerCandidate || activeDrag) return;
    const { source, kind, column, card, pointerId, x, y } = pointerCandidate;
    const rect = source.getBoundingClientRect();
    const placeholder = element('div', kind === 'card' ? 'card drag-placeholder' : 'column drag-placeholder column-placeholder');
    placeholder.setAttribute('aria-hidden', 'true');
    placeholder.style.width = `${rect.width}px`;
    placeholder.style.height = `${rect.height}px`;
    placeholder.style.flexBasis = `${rect.width}px`;
    const ghost = source.cloneNode(true);
    ghost.className = kind === 'card' ? 'card drag-ghost' : 'column drag-ghost column-ghost';
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.left = `${point.clientX - rect.width / 2}px`;
    ghost.style.top = `${point.clientY - Math.min(point.clientY - rect.top, rect.height / 2)}px`;
    ghost.style.setProperty('--drag-rotation', kind === 'card' ? '-2deg' : '-1.25deg');
    document.body.append(ghost);
    source.replaceWith(placeholder);
    activeDrag = { kind, columnId: column.id, cardId: card?.id, source, placeholder, ghost, pointerId, offsetX: rect.width / 2, offsetY: Math.min(point.clientY - rect.top, rect.height / 2) };
    positionGhost(point);
    document.body.classList.add('is-dragging');
    pointerCandidate = null;
    document.querySelector('#announcement').textContent = kind === 'card' ? 'Перемещение карточки. Отпустите, чтобы поместить.' : 'Перемещение колонки. Отпустите, чтобы поместить.';
  }
  function positionGhost(point) {
    if (!activeDrag) return;
    activeDrag.ghost.style.left = `${point.clientX - activeDrag.offsetX}px`;
    activeDrag.ghost.style.top = `${point.clientY - activeDrag.offsetY}px`;
  }
  function nearestSibling(container, coordinate, axis) {
    const center = item => { const rect = item.getBoundingClientRect(); return axis === 'x' ? rect.left + rect.width / 2 : rect.top + rect.height / 2; };
    const siblings = Array.from(container.children).filter(item => item !== activeDrag.placeholder && !(item.classList.contains('add-card')) && !(item.classList.contains('card') && item.dataset.cardId === activeDrag.cardId));
    return siblings.find(item => coordinate < center(item)) || null;
  }
  function updateDropTarget(point) {
    const target = document.elementFromPoint(point.clientX, point.clientY);
    if (!target) return;
    if (activeDrag.kind === 'column') {
      const lastTile = board.querySelector('.add-column');
      const column = target.closest('.column');
      if (column && column.parentElement === board && column.dataset.columnId !== activeDrag.columnId) {
        movePlaceholder(board, nearestSibling(board, point.clientX, 'x'));
      } else if (lastTile?.contains(target)) {
        movePlaceholder(board, lastTile);
      } else if (target === board && point.clientX > board.getBoundingClientRect().left && point.clientX < board.getBoundingClientRect().right) {
        movePlaceholder(board, nearestSibling(board, point.clientX, 'x') || lastTile);
      }
      return;
    }
    const addColumn = target.closest('.add-column');
    if (addColumn) {
      activeDrag.dropOnNewColumn = true;
      addColumn.classList.add('is-drop-target');
      const prior = board.querySelectorAll('.add-column.is-drop-target');
      prior.forEach(tile => { if (tile !== addColumn) tile.classList.remove('is-drop-target'); });
      return;
    }
    if (activeDrag.dropOnNewColumn) {
      board.querySelectorAll('.add-column.is-drop-target').forEach(tile => tile.classList.remove('is-drop-target'));
      activeDrag.dropOnNewColumn = false;
    }
    const column = target.closest('.column');
    if (!column || !columns.some(item => item.id === column.dataset.columnId)) return;
    const list = column.querySelector('.cards');
    if (!list) return;
    list.classList.add('is-card-drop-target');
    board.querySelectorAll('.is-card-drop-target').forEach(node => { if (node !== list) node.classList.remove('is-card-drop-target'); });
    let before = nearestSibling(list, point.clientY, 'y');
    if (target.closest('.add-card') && target.closest('.column') === column) before = column.querySelector('.add-card');
    movePlaceholder(list, before);
    activeDrag.dropColumnId = column.dataset.columnId;
  }
  function onPointerMove(event) {
    if (pointerCandidate?.pointerId === event.pointerId) {
      if (Math.hypot(event.clientX - pointerCandidate.x, event.clientY - pointerCandidate.y) < 7) return;
      beginDrag(event);
    }
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
    event.preventDefault();
    positionGhost(event);
    if (dragFrame) return;
    dragFrame = requestAnimationFrame(() => {
      dragFrame = 0;
      if (!activeDrag) return;
      updateDropTarget(event);
      const rect = board.getBoundingClientRect();
      if (event.clientX < rect.left + 56) board.scrollLeft -= 14;
      else if (event.clientX > rect.right - 56) board.scrollLeft += 14;
    });
  }
  function finishDrag(event, cancelled = false) {
    if (pointerCandidate?.pointerId === event.pointerId) { pointerCandidate = null; return; }
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
    const drag = activeDrag;
    if (!cancelled && drag.kind === 'card' && drag.dropOnNewColumn) {
      const sourceColumn = columns.find(item => item.id === drag.columnId);
      const cardIndex = sourceColumn?.cards.findIndex(item => item.id === drag.cardId) ?? -1;
      if (sourceColumn && cardIndex >= 0) {
        const [card] = sourceColumn.cards.splice(cardIndex, 1);
        const newColumn = { id: id(), name: '', color: palette[columns.length % palette.length].color, cards: [card] };
        columns.push(newColumn);
      }
    } else if (!cancelled && drag.kind === 'card' && drag.placeholder.parentElement?.classList.contains('cards')) {
      const from = columns.find(item => item.id === drag.columnId);
      const to = columns.find(item => item.id === drag.dropColumnId || item.id === drag.placeholder.parentElement.closest('.column')?.dataset.columnId);
      const cardIndex = from?.cards.findIndex(item => item.id === drag.cardId) ?? -1;
      if (from && to && cardIndex >= 0) {
        const [card] = from.cards.splice(cardIndex, 1);
        const ordered = Array.from(drag.placeholder.parentElement.children).filter(node => node.classList.contains('card') || node === drag.placeholder);
        const destinationIndex = ordered.indexOf(drag.placeholder);
        const targetIndex = Math.max(0, Math.min(destinationIndex, to.cards.length));
        to.cards.splice(targetIndex, 0, card);
      }
    } else if (!cancelled && drag.kind === 'column' && drag.placeholder.parentElement === board) {
      const movingIndex = columns.findIndex(item => item.id === drag.columnId);
      if (movingIndex >= 0) {
        const [column] = columns.splice(movingIndex, 1);
        const siblingsBefore = Array.from(board.children).slice(0, Array.from(board.children).indexOf(drag.placeholder)).filter(node => node.classList.contains('column')).length;
        columns.splice(Math.min(siblingsBefore, columns.length), 0, column);
      }
    }
    document.body.classList.remove('is-dragging');
    drag.ghost.remove();
    activeDrag = null;
    save();
    render();
    document.querySelector('#announcement').textContent = cancelled ? 'Перемещение отменено.' : 'Порядок доски обновлён.';
  }
  board.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('button')) return;
    const cardNode = event.target.closest('.card[data-card-id]');
    const headerNode = event.target.closest('.column-header[data-drag-handle="column"]');
    const source = cardNode || headerNode;
    if (!source) return;
    const columnId = (cardNode || headerNode).closest('.column').dataset.columnId;
    const column = columns.find(item => item.id === columnId);
    const card = cardNode ? column?.cards.find(item => item.id === cardNode.dataset.cardId) : null;
    if (!column || cardNode && !card) return;
    pointerCandidate = { source, kind: cardNode ? 'card' : 'column', column, card, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  });
  window.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('pointerup', event => finishDrag(event));
  window.addEventListener('pointercancel', event => finishDrag(event, true));
  function deleteCard(columnId, cardId) {
    const column = columns.find(item => item.id === columnId);
    const card = column?.cards.find(item => item.id === cardId);
    if (!column || !card || !window.confirm(`Удалить карточку «${card.title}»?`)) return;
    column.cards = column.cards.filter(item => item.id !== card.id);
    if (dialog.open) dialog.close();
    editingCard = null; save(); render();
    focusCalendarDate(card.date);
    document.querySelector('#announcement').textContent = 'Карточка удалена.';
  }
  function deleteColumn(columnId) {
    const column = columns.find(item => item.id === columnId);
    if (!column) return;
    if (column.cards.length && !window.confirm(`В колонке «${column.name || 'Без названия'}» есть карточки (${column.cards.length}). Удалить колонку вместе со всеми карточками? Это действие нельзя отменить.`)) return;
    columns = columns.filter(item => item.id !== column.id);
    if (columnDialog.open) columnDialog.close();
    editingColumnId = null; save(); render();
    document.querySelector('#announcement').textContent = 'Колонка удалена.';
  }
  function openCardCreator(columnId, focusTarget, date = '') {
    timeSelectionCleared = false;
    reopenDayAfterForm = false;
    editingCard = null;
    targetColumnId = columnId;
    returnFocus = focusTarget;
    form.reset();
    statusInput.value = 'new';
    durationInput.value = '60';
    refreshTimeOptions('');
    bookingFields.date.value = date;
    document.querySelector('#card-column-field').hidden = !date;
    columnInput.replaceChildren();
    for (const column of columns) {
      const option = element('option', '', column.name || 'Колонка без названия'); option.value = column.id; columnInput.append(option);
    }
    columnInput.value = columnId || '';
    titleInput.setCustomValidity('');
    document.querySelector('#dialog-title').textContent = 'Новая карточка';
    document.querySelector('#save-card').textContent = 'Создать';
    cardDeleteButton.hidden = true;
    document.querySelector('#form-error').textContent = '';
    const column = columns.find(item => item.id === columnId);
    cardColorInput.value = column?.color || palette[columns.length % palette.length].color;
    updatePalette(document.querySelector('#card-palette'), cardColorInput);
    document.querySelector('#dialog-context').textContent = date ? `Запись на ${displayDate(date)}. Выберите время и колонку доски.` : column ? `В колонке «${column.name || 'Без названия'}»` : 'Карточка появится в новой колонке справа.';
    dialog.showModal();
    updateTimeConflict();
    bookingFields.clientName.focus();
  }
  function openCardEditor(columnId, cardId, focusTarget) {
    timeSelectionCleared = false;
    reopenDayAfterForm = false;
    const column = columns.find(item => item.id === columnId);
    const card = column?.cards.find(item => item.id === cardId);
    if (!column || !card) return;
    editingCard = { columnId: column.id, cardId: card.id };
    targetColumnId = column.id;
    returnFocus = focusTarget;
    form.reset();
    document.querySelector('#card-column-field').hidden = true;
    titleInput.setCustomValidity('');
    titleInput.value = card.title;
    descriptionInput.value = card.description;
    statusInput.value = cardStatus(card);
    durationInput.value = String(durationOf(card));
    for (const [field, input] of Object.entries(bookingFields)) input.value = bookingData(card)[field];
    refreshTimeOptions(card.time || '');
    cardColorInput.value = card.color || column.color;
    updatePalette(document.querySelector('#card-palette'), cardColorInput);
    document.querySelector('#dialog-title').textContent = 'Редактировать карточку';
    document.querySelector('#save-card').textContent = 'Сохранить';
    cardDeleteButton.hidden = false;
    document.querySelector('#form-error').textContent = '';
    document.querySelector('#dialog-context').textContent = `В колонке «${column.name || 'Без названия'}»`;
    dialog.showModal();
    updateTimeConflict();
    bookingFields.clientName.focus();
  }
  board.addEventListener('click', event => {
    const contactButton = event.target.closest('[data-contact-number]');
    if (contactButton) {
      contactReturnFocus = contactButton;
      const number = contactButton.dataset.contactNumber;
      document.querySelector('#contact-phone').textContent = contactButton.textContent;
      document.querySelector('#contact-whatsapp').href = `https://wa.me/${number}`;
      document.querySelector('#contact-call').href = `tel:+${number}`;
      contactDialog.showModal();
      return;
    }
    const deleteCardButton = event.target.closest('[data-delete-card-id]');
    if (deleteCardButton) {
      deleteCard(deleteCardButton.closest('.column')?.dataset.columnId, deleteCardButton.dataset.deleteCardId);
      return;
    }
    const deleteColumnButton = event.target.closest('[data-delete-column-id]');
    if (deleteColumnButton) { deleteColumn(deleteColumnButton.dataset.deleteColumnId); return; }
    const button = event.target.closest('button.add-card');
    if (button) {
      openCardCreator(button.dataset.columnId || null, button);
      return;
    }
    const editColumn = event.target.closest('[data-edit-column-id]');
    if (editColumn) { openColumnEditor(editColumn.dataset.editColumnId, editColumn); return; }
    const cardNode = event.target.closest('.card[data-card-id]');
    if (!cardNode) return;
    openCardEditor(cardNode.closest('.column')?.dataset.columnId, cardNode.dataset.cardId, cardNode);
  });
  board.addEventListener('keydown', event => {
    if (event.target.closest('button')) return;
    const card = event.target.closest('.card[data-card-id]');
    if (card && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); card.click(); }
  });
  titleInput.addEventListener('input', () => {
    titleInput.setCustomValidity('');
    document.querySelector('#form-error').textContent = '';
  });
  for (const input of Object.values(bookingFields)) input.addEventListener('input', () => {
    titleInput.setCustomValidity('');
    document.querySelector('#form-error').textContent = '';
    updateTimeConflict();
  });
  bookingFields.time.addEventListener('change', () => { timeSelectionCleared = false; document.querySelector('#time-selection-note').textContent = ''; document.querySelector('#form-error').textContent = ''; updateTimeConflict(); });
  bookingFields.date.addEventListener('change', updateTimeConflict);
  durationInput.addEventListener('change', () => { document.querySelector('#form-error').textContent = ''; refreshTimeOptions(); updateTimeConflict(); });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const booking = Object.fromEntries(Object.entries(bookingFields).map(([field, input]) => [field, input.value.trim()]));
    if (!durations.includes(Number(durationInput.value))) { document.querySelector('#form-error').textContent = 'Выберите длительность услуги из списка.'; return; }
    Object.assign(booking, timingData({ ...booking, duration: Number(durationInput.value) }));
    if (timeSelectionCleared || (booking.time && !withinWorkHours(booking.time, booking.duration))) {
      document.querySelector('#form-error').textContent = 'Выберите время, при котором услуга полностью помещается в смену 08:00–18:00.';
      bookingFields.time.focus(); return;
    }
    const title = titleInput.value.trim() || booking.clientName || booking.service;
    if (updateTimeConflict()) {
      document.querySelector('#form-error').textContent = 'Выберите другое время или длительность: интервал пересекается с другой записью.';
      bookingFields.time.focus();
      return;
    }
    if (!title) {
      titleInput.setCustomValidity('Введите имя клиента, услугу или название карточки.');
      document.querySelector('#form-error').textContent = 'Введите имя клиента, услугу или название карточки.';
      titleInput.reportValidity();
      return;
    }
    if (editingCard) {
      const column = columns.find(item => item.id === editingCard.columnId);
      const card = column?.cards.find(item => item.id === editingCard.cardId);
      if (!card) { document.querySelector('#form-error').textContent = 'Эта карточка больше не найдена.'; return; }
      card.title = title;
      card.status = cardStatus({ status: statusInput.value });
      Object.assign(card, booking);
      card.description = descriptionInput.value.trim();
      card.color = cardColorInput.value;
      save(); dialog.close(); editingCard = null; render();
      focusCalendarDate(booking.date);
      document.querySelector('#announcement').textContent = 'Карточка сохранена.';
      return;
    }
    if (currentView === 'calendar' && !document.querySelector('#card-column-field').hidden) targetColumnId = columnInput.value || null;
    const isNewColumn = targetColumnId === null;
    let column = columns.find(item => item.id === targetColumnId);
    if (isNewColumn) {
      column = { id: id(), name: '', color: palette[columns.length % palette.length].color, cards: [] };
      columns.push(column);
    }
    if (!column) return;
    column.cards.push({ id: id(), title, ...booking, status: cardStatus({ status: statusInput.value }), description: descriptionInput.value.trim(), color: cardColorInput.value });
    save();
    dialog.close();
    render();
    if (currentView === 'calendar') {
      focusCalendarDate(booking.date);
      document.querySelector('#announcement').textContent = booking.time ? 'Запись создана.' : 'Карточка создана на доске. Укажите время, чтобы увидеть её в календаре.';
      return;
    }
    const section = Array.from(board.querySelectorAll('.column')).find(node => node.dataset.columnId === column.id);
    returnFocus = section.querySelector('.add-card');
    returnFocus.focus({ preventScroll: true });
    if (isNewColumn) board.scrollLeft = section.offsetLeft - board.offsetLeft;
    document.querySelector('#announcement').textContent = isNewColumn ? 'Создана новая колонка с карточкой.' : 'Карточка создана.';
  });
  document.querySelector('#cancel-dialog').addEventListener('click', () => dialog.close());
  document.querySelector('#close-contact').addEventListener('click', () => contactDialog.close());
  contactDialog.addEventListener('close', () => { if (contactReturnFocus?.isConnected) contactReturnFocus.focus({ preventScroll: true }); });
  document.querySelector('#close-dialog').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    form.reset(); conflictHint.hidden = true; conflictHint.textContent = '';
    if (reopenDayAfterForm) {
      reopenDayAfterForm = false;
      openDay(selectedDay);
    } else if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  });
  cardDeleteButton.addEventListener('click', () => {
    if (!editingCard) return;
    deleteCard(editingCard.columnId, editingCard.cardId);
  });
  function openColumnEditor(columnId, focusTarget) {
    const column = columns.find(item => item.id === columnId);
    if (!column) return;
    editingColumnId = column.id; returnFocus = focusTarget;
    document.querySelector('#column-name').value = column.name;
    columnColorInput.value = column.color;
    updatePalette(document.querySelector('#column-palette'), columnColorInput);
    document.querySelector('#column-error').textContent = '';
    columnDialog.showModal(); document.querySelector('#column-name').focus();
  }
  columnForm.addEventListener('submit', event => {
    event.preventDefault();
    const column = columns.find(item => item.id === editingColumnId);
    const color = columnColorInput.value;
    if (!column || !isColor(color)) { document.querySelector('#column-error').textContent = 'Выберите корректный цвет.'; return; }
    column.name = document.querySelector('#column-name').value.trim(); column.color = color;
    save(); columnDialog.close(); render();
    document.querySelector('#announcement').textContent = 'Настройки колонки сохранены.';
  });
  document.querySelector('#cancel-column-dialog').addEventListener('click', () => columnDialog.close());
  document.querySelector('#close-column-dialog').addEventListener('click', () => columnDialog.close());
  columnDialog.addEventListener('close', () => { if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); });
  columnDeleteButton.addEventListener('click', () => {
    deleteColumn(editingColumnId);
  });
  fileMenuTrigger.addEventListener('click', () => {
    const open = fileMenu.hidden;
    fileMenu.hidden = !open;
    fileMenuTrigger.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.file-menu-wrap')) {
      fileMenu.hidden = true;
      fileMenuTrigger.setAttribute('aria-expanded', 'false');
    }
  });
  document.querySelector('#file-load').addEventListener('click', () => {
    fileMenu.hidden = true; fileMenuTrigger.setAttribute('aria-expanded', 'false'); fileInput.click();
  });
  document.querySelector('#file-save').addEventListener('click', () => {
    fileMenu.hidden = true; fileMenuTrigger.setAttribute('aria-expanded', 'false');
    const payload = { format: 'kanban-board', version: 1, columns: columns.map(column => ({ name: column.name, color: column.color, cards: column.cards.map(card => ({ title: card.title, ...bookingData(card), ...timingData(card), status: cardStatus(card), description: card.description, color: card.color || column.color })) })) };
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = element('a');
    link.href = url; link.download = `doska-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    document.querySelector('#announcement').textContent = 'Файл доски сохранён.';
  });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('Файл больше 5 МБ.');
      const parsed = JSON.parse((await file.text()).replace(/^\uFEFF/, ''));
      if (!parsed || parsed.format !== 'kanban-board' || parsed.version !== 1 || !Array.isArray(parsed.columns) || parsed.columns.length < 1 || parsed.columns.length > 1000) throw new Error('Это не файл доски подходящего формата.');
      let totalCards = 0;
      const imported = parsed.columns.map(column => {
        if (!column || typeof column.name !== 'string' || column.name.length > 100 || !isColor(column.color) || !Array.isArray(column.cards)) throw new Error('Проверьте названия и цвета колонок в файле.');
        totalCards += column.cards.length;
        if (totalCards > 10000) throw new Error('В файле слишком много карточек.');
        const cards = column.cards.map(card => {
          if (!card || typeof card.title !== 'string' || !card.title.trim() || card.title.length > 200 || typeof card.description !== 'string' || card.description.length > 20000 || (card.color !== undefined && !isColor(card.color))) throw new Error('В файле есть карточка с неверным названием, описанием или цветом.');
          for (const field of Object.keys(bookingFields)) {
            if (card[field] !== undefined && (typeof card[field] !== 'string' || card[field].length > (field === 'phone' ? 50 : 200))) throw new Error('В файле есть неверные данные записи клиента.');
          }
          if (card.status !== undefined && !Object.hasOwn(statuses, card.status)) throw new Error('В файле есть неверный статус записи.');
          if (card.duration !== undefined && !durations.includes(card.duration)) throw new Error('В файле есть неверная длительность услуги.');
          return { id: id(), title: card.title, ...bookingData(card), ...timingData(card), status: cardStatus(card), description: card.description, color: card.color || column.color };
        });
        return { id: id(), name: column.name, color: column.color, cards };
      });
      columns = imported; save(); render();
      document.querySelector('#announcement').textContent = 'Доска загружена из файла.';
    } catch (error) {
      window.alert(`Не удалось загрузить доску. ${error.message || 'Файл повреждён или имеет неверный формат.'}`);
    } finally { fileInput.value = ''; }
  });
  for (const [selector, direction] of [['#scroll-left', -1], ['#scroll-right', 1]]) {
    document.querySelector(selector).addEventListener('click', () => board.scrollBy({ left: direction * (board.querySelector('.column').offsetWidth + (parseFloat(getComputedStyle(board).gap) || 0)), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
  }
  board.addEventListener('scroll', updateScrollControls, { passive: true });
  window.addEventListener('resize', updateScrollControls);
  render();
})();
