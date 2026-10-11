const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Минимальная модель DOM проверяет сценарии приложения без браузера.
class Element {
  constructor(tag = 'div') {
    this.tag = tag; this.children = []; this.dataset = {}; this.listeners = {};
    this.style = { values: {}, setProperty(name, value) { this.values[name] = value; } }; this.value = ''; this.textContent = '';
    this.className = ''; this.scrollLeft = 0; this.clientWidth = 1000;
    this.offsetWidth = 280; this.isConnected = true; this.open = false;
  }
  get classList() {
    return { contains: name => this.className.split(/\s+/).includes(name), add: name => { if (!this.className.split(/\s+/).includes(name)) this.className = `${this.className} ${name}`.trim(); }, remove: name => { this.className = this.className.split(/\s+/).filter(part => part !== name).join(' '); } };
  }
  get scrollWidth() { return this.children.length * 296; }
  append(...nodes) { for (const node of nodes) { if (node.parentElement) node.parentElement.children = node.parentElement.children.filter(child => child !== node); node.parentElement = this; node.isConnected = true; this.children.push(node); } }
  replaceChildren() { this.children.forEach(node => { node.isConnected = false; node.parentElement = null; }); this.children = []; }
  insertBefore(node, before) { if (!before) return this.append(node); if (node.parentElement) node.parentElement.children = node.parentElement.children.filter(child => child !== node); const index = this.children.indexOf(before); node.parentElement = this; node.isConnected = true; this.children.splice(index, 0, node); }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  emit(name, extra = {}) { let result; for (const callback of this.listeners[name] || []) result = callback({ preventDefault() {}, target: this, ...extra }); return result; }
  querySelectorAll(selector) { return this.children.flatMap(node => [...(node.matches(selector) ? [node] : []), ...node.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0]; }
  matches(selector) { const cls = selector.match(/\.([\w-]+)/)?.[1]; const attr = selector.match(/\[data-([\w-]+)/)?.[1]?.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); return (!cls || this.classList.contains(cls)) && (!selector.startsWith('button') || this.tag === 'button') && (!attr || this.dataset[attr] !== undefined); }
  closest(selector) { for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node; return null; }
  focus() { this.focused = true; }
  select() { this.selected = true; }
  click() { this.clicked = true; }
  remove() { this.isConnected = false; if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); }
  setCustomValidity(message) { this.validityMessage = message; }
  reportValidity() {}
  showModal() { this.open = true; }
  close() { this.open = false; this.emit('close'); }
  scrollBy({ left }) { this.scrollLeft += left; this.emit('scroll'); }
}
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
function boot(storage = new Map(), denyStorage = false, now = null) {
  const selectors = ['board', 'card-dialog', 'card-form', 'card-title', 'card-description', 'card-color', 'card-palette', 'column-palette', 'theme-toggle', 'theme-icon', 'storage-label', 'scroll-left', 'scroll-right', 'form-error', 'dialog-context', 'announcement', 'cancel-dialog', 'close-dialog', 'column-dialog', 'column-form', 'delete-card', 'delete-column', 'file-menu', 'file-menu-trigger', 'file-input', 'column-name', 'column-color', 'column-error', 'file-load', 'file-save', 'save-card', 'close-column-dialog', 'cancel-column-dialog', 'dialog-title'];
  selectors.push('card-client', 'card-phone', 'card-date', 'card-time', 'card-service');
  selectors.push('card-status', 'contact-dialog', 'close-contact', 'contact-phone', 'contact-whatsapp', 'contact-call');
  selectors.push('calendar-view', 'calendar-grid', 'calendar-month', 'calendar-summary', 'calendar-prev', 'calendar-next', 'calendar-today', 'view-board', 'view-calendar', 'card-column-field', 'card-column');
  selectors.push('time-conflict', 'day-dialog', 'day-schedule', 'day-title', 'day-summary', 'day-create', 'close-day');
  selectors.push('card-duration', 'booking-end');
  selectors.push('time-selection-note');
  selectors.push('master-header', 'view-client', 'client-view', 'client-title', 'client-back', 'client-form', 'client-service', 'client-duration', 'client-date', 'client-slots', 'client-slots-hint', 'client-contact', 'client-selection', 'client-name', 'client-phone', 'client-services', 'client-error', 'client-success', 'client-submit');
  const nodes = Object.fromEntries(selectors.map(name => [name, new Element()]));
  const root = new Element('html');
  nodes['card-form'].reset = () => { for (const name of ['card-title', 'card-description', 'card-client', 'card-phone', 'card-date', 'card-time', 'card-service']) nodes[name].value = ''; };
  let sequence = 0;
  let download = null;
  let confirmChoice = true;
  let confirmationMessage = '';
  class TestBlob { constructor(parts, options) { this.textValue = parts.join(''); this.type = options.type; download = this; } async text() { return this.textValue; } }
  vm.runInNewContext(source, {
    document: { querySelector: selector => nodes[selector.slice(1)], createElement: tag => new Element(tag), addEventListener() {}, body: new Element('body'), documentElement: root },
    window: { addEventListener() {}, confirm(message) { confirmationMessage = message; return confirmChoice; }, alert(message) { nodes.alertText = message; } }, crypto: { randomUUID: () => `id-${++sequence}` },
    Blob: TestBlob, URL: { createObjectURL() { return 'blob:test'; }, revokeObjectURL() {} }, setTimeout(callback) { callback(); },
    localStorage: { getItem: key => { if (denyStorage) throw new Error('denied'); return storage.get(key) || null; }, setItem: (key, value) => { if (denyStorage) throw new Error('denied'); storage.set(key, value); } },
    matchMedia: () => ({ matches: true }),
    Date: now ? class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } } : Date
  });
  return { nodes, root, board: nodes.board, storage, getDownload: () => download, setConfirm: value => { confirmChoice = value; }, getConfirmation: () => confirmationMessage };
}
const app = boot();
assert.equal(app.root.classList.contains('dark'), true);
app.nodes['theme-toggle'].emit('click');
assert.equal(app.root.classList.contains('light'), true);
assert.equal(app.storage.get('kanban-board.theme'), 'light');
assert.equal(app.nodes['theme-toggle']['aria-pressed'], 'false');
const columns = () => app.board.querySelectorAll('.column');
const add = index => columns()[index].querySelector('.add-card');
const open = button => app.board.emit('click', { target: button });
const create = (title, description = '') => { app.nodes['card-title'].value = title; app.nodes['card-description'].value = description; app.nodes['card-form'].emit('submit'); };
assert.equal(columns().length, 4);
assert.deepEqual(columns().map(node => node.querySelectorAll('.column-heading')[0].children[1].textContent), ['', 'Принято', 'В деле', 'Закончено']);
assert.equal(app.board.children.at(-1).className, 'add-card add-column');
open(add(1)); create('  Подготовить макет  ', 'Первая строка\nВторая строка');
assert.equal(columns()[1].querySelectorAll('.card').length, 1);
assert.equal(columns()[0].querySelectorAll('.card').length, 0);
assert.equal(columns()[1].querySelector('.card-title').textContent, 'Подготовить макет');
assert.equal(columns()[1].querySelector('.card').children[1].textContent, 'Первая строка\nВторая строка');
assert.equal(columns()[1].querySelector('.card').style.values['--card-color'], '#e879f9');
assert.equal(columns()[1].querySelector('.cards').children.at(-1).className, 'add-card');
open(add(2)); app.nodes['cancel-dialog'].emit('click');
assert.equal(columns()[2].querySelectorAll('.card').length, 0);
open(app.board.children.at(-1)); app.nodes['cancel-dialog'].emit('click');
assert.equal(columns().length, 4);
open(app.board.children.at(-1)); create('   ');
assert.equal(columns().length, 4); assert.equal(app.nodes['card-dialog'].open, true);
app.nodes['card-title'].emit('input'); create('<img src=x onerror=alert(1)>');
assert.equal(columns().length, 5);
assert.equal(columns()[4].querySelector('.card-title').textContent, '<img src=x onerror=alert(1)>');
assert.equal(app.board.children.at(-1).className, 'add-card add-column');
assert.equal(app.nodes['card-dialog'].open, false);
for (let index = 0; index < 20; index++) { open(app.board.children.at(-1)); create(`Карточка ${index}`); }
assert.equal(columns().length, 25);
assert.equal(app.board.querySelectorAll('.add-card').length, 26);
const reloaded = boot(app.storage);
assert.equal(reloaded.board.querySelectorAll('.column').length, 25);
assert.equal(reloaded.board.querySelectorAll('.card').length, 22);
assert.equal(reloaded.root.classList.contains('light'), true);
const denied = boot(new Map(), true);
denied.board.emit('click', { target: denied.board.children.at(-1) });
denied.nodes['card-title'].value = 'Без хранилища'; denied.nodes['card-form'].emit('submit');
assert.equal(denied.board.querySelectorAll('.column').length, 5);
assert.match(denied.nodes['storage-label'].textContent, /Не удалось сохранить/);
function testCalendar() {
  const calendar = boot(new Map(), false, '2028-02-10T12:00:00');
  const grid = calendar.nodes['calendar-grid'];
  const day = date => grid.querySelectorAll('.calendar-day').find(node => node.dataset.calendarDate === date);
  const events = () => grid.querySelectorAll('.calendar-event');
  assert.equal(grid.children.length, 42);
  assert.equal(grid.children[0].dataset.calendarDate, '2028-01-31');
  assert.ok(day('2028-02-29'));
  calendar.nodes['view-calendar'].emit('click');
  assert.equal(calendar.board.hidden, true);
  assert.equal(calendar.nodes['calendar-view'].hidden, false);
  assert.equal(calendar.nodes['view-calendar']['aria-pressed'], 'true');
  assert.equal(calendar.nodes['scroll-left'].hidden, true);
  const secondColumn = calendar.board.querySelectorAll('.column')[1].dataset.columnId;
  const create = (date, time, name) => {
    grid.emit('click', { target: day(date) });
    assert.equal(calendar.nodes['day-dialog'].open, true);
    calendar.nodes['day-create'].emit('click');
    assert.equal(calendar.nodes['card-date'].value, date);
    assert.equal(calendar.nodes['card-dialog'].open, true);
    calendar.nodes['card-column'].value = secondColumn;
    calendar.nodes['card-client'].value = name;
    calendar.nodes['card-time'].value = time;
    calendar.nodes['card-form'].emit('submit');
    assert.equal(calendar.nodes['day-dialog'].open, true);
    calendar.nodes['close-day'].emit('click');
  };
  create('2028-02-29', '16:00', 'Поздняя запись');
  create('2028-02-29', '09:30', 'Ранняя запись');
  create('2028-02-29', '', 'Без времени');
  assert.equal(events().length, 2);
  assert.deepEqual(day('2028-02-29').querySelectorAll('.calendar-event-time').map(node => node.textContent), ['09:30', '16:00']);
  assert.equal(calendar.board.querySelectorAll('.column')[1].querySelectorAll('.card').length, 3);
  grid.emit('click', { target: events()[0].querySelector('.calendar-event-name') });
  assert.equal(calendar.nodes['card-client'].value, 'Ранняя запись');
  calendar.nodes['card-date'].value = '2028-02-28';
  calendar.nodes['card-time'].value = '11:00';
  calendar.nodes['card-form'].emit('submit');
  assert.equal(day('2028-02-28').querySelectorAll('.calendar-event').length, 1);
  assert.equal(day('2028-02-29').querySelectorAll('.calendar-event').length, 1);
  assert.equal(calendar.board.querySelectorAll('.card').length, 3);
  calendar.nodes['calendar-next'].emit('click');
  assert.equal(grid.children[0].dataset.calendarDate, '2028-02-28');
  assert.match(calendar.nodes['calendar-summary'].textContent, /пока нет записей/);
  calendar.nodes['calendar-prev'].emit('click');
  grid.emit('click', { target: day('2028-02-28').querySelector('.calendar-event') });
  calendar.nodes['delete-card'].emit('click');
  assert.equal(events().length, 1);
  assert.equal(calendar.board.querySelectorAll('.card').length, 2);
  grid.emit('click', { target: day('2028-02-15').querySelector('.calendar-day-button') });
  calendar.nodes['day-create'].emit('click');
  calendar.nodes['cancel-dialog'].emit('click');
  calendar.nodes['close-day'].emit('click');
  assert.equal(calendar.board.querySelectorAll('.card').length, 2);
  calendar.nodes['view-board'].emit('click');
  assert.equal(calendar.board.hidden, false);
  assert.equal(calendar.nodes['calendar-view'].hidden, true);
  assert.equal(calendar.nodes['scroll-left'].hidden, false);
  const reloaded = boot(calendar.storage, false, '2028-02-10T12:00:00');
  assert.equal(reloaded.nodes['calendar-grid'].querySelectorAll('.calendar-event').length, 1);
  for (let index = 0; index < 10; index++) calendar.nodes['calendar-next'].emit('click');
  assert.match(calendar.nodes['calendar-month'].textContent, /декабрь.*2028/);
  calendar.nodes['calendar-next'].emit('click');
  assert.match(calendar.nodes['calendar-month'].textContent, /январь.*2029/);
  calendar.nodes['calendar-today'].emit('click');
  assert.match(calendar.nodes['calendar-month'].textContent, /февраль.*2028/);
}
function testTimeConflictsAndDay() {
  const app = boot(new Map(), false, '2028-02-10T12:00:00');
  const cards = () => app.board.querySelectorAll('.card');
  const columns = () => app.board.querySelectorAll('.column');
  const openCreate = column => app.board.emit('click', { target: columns()[column].querySelector('.add-card') });
  openCreate(0);
  app.nodes['card-client'].value = 'Анна'; app.nodes['card-service'].value = 'Стрижка';
  app.nodes['card-date'].value = '2028-02-10'; app.nodes['card-time'].value = '09:15';
  app.nodes['card-form'].emit('submit');
  openCreate(1);
  app.nodes['card-client'].value = 'Мария'; app.nodes['card-date'].value = '2028-02-10'; app.nodes['card-time'].value = '09:15';
  app.nodes['card-time'].emit('input');
  assert.equal(app.nodes['time-conflict'].hidden, false);
  assert.match(app.nodes['time-conflict'].textContent, /Это время уже занято \(Анна — Стрижка\)/);
  app.nodes['card-form'].emit('submit');
  assert.equal(cards().length, 1);
  assert.equal(app.nodes['card-dialog'].open, true);
  assert.equal(app.nodes['card-client'].value, 'Мария');
  app.nodes['card-time'].value = '10:30'; app.nodes['card-time'].emit('change');
  assert.equal(app.nodes['time-conflict'].hidden, true);
  app.nodes['card-form'].emit('submit');
  assert.equal(cards().length, 2);
  app.board.emit('click', { target: cards()[0] });
  assert.equal(app.nodes['time-conflict'].hidden, true); // The current card never conflicts with itself.
  app.nodes['card-time'].value = '10:30'; app.nodes['card-time'].emit('input');
  assert.match(app.nodes['time-conflict'].textContent, /Мария/);
  app.nodes['card-form'].emit('submit');
  assert.equal(app.nodes['card-dialog'].open, true);
  app.nodes['card-date'].value = '2028-02-11'; app.nodes['card-date'].emit('change');
  assert.equal(app.nodes['time-conflict'].hidden, true);
  app.nodes['card-date'].value = '2028-02-10'; app.nodes['card-time'].value = '09:15';
  app.nodes['card-form'].emit('submit');
  assert.equal(cards().length, 2);
  app.nodes['view-calendar'].emit('click');
  const day = app.nodes['calendar-grid'].querySelectorAll('.calendar-day').find(node => node.dataset.calendarDate === '2028-02-10');
  assert.equal(day.classList.contains('has-bookings'), true);
  app.nodes['calendar-grid'].emit('click', { target: day });
  const schedule = app.nodes['day-schedule'];
  assert.equal(schedule.querySelectorAll('.day-hour').length, 10);
  assert.equal(new Set(schedule.querySelectorAll('.day-booking').map(node => node.dataset.dayCardId)).size, 2);
  assert.equal(schedule.querySelectorAll('.day-free-slot').some(node => node.dataset.slotTime === '09:30'), false);
  assert.equal(schedule.querySelectorAll('.day-booking-time').some(node => node.textContent === '09:15–10:15'), true);
  const free = schedule.querySelectorAll('.day-free-slot').find(node => node.dataset.slotTime === '08:00');
  schedule.emit('click', { target: free });
  assert.equal(app.nodes['day-dialog'].open, false);
  assert.equal(app.nodes['card-date'].value, '2028-02-10');
  assert.equal(app.nodes['card-time'].value, '08:00');
  app.nodes['card-client'].value = 'Ольга'; app.nodes['card-form'].emit('submit');
  assert.equal(app.nodes['day-dialog'].open, true);
  assert.equal(new Set(schedule.querySelectorAll('.day-booking').map(node => node.dataset.dayCardId)).size, 3);
  const newBooking = schedule.querySelectorAll('.day-booking').find(node => node.querySelector('.day-booking-client').textContent === 'Ольга');
  schedule.emit('click', { target: newBooking.querySelector('.day-booking-client') });
  assert.equal(app.nodes['card-client'].value, 'Ольга');
  app.nodes['delete-card'].emit('click');
  assert.equal(new Set(schedule.querySelectorAll('.day-booking').map(node => node.dataset.dayCardId)).size, 2);
  assert.equal(schedule.querySelectorAll('.day-free-slot').some(node => node.dataset.slotTime === '08:00'), true);
  app.nodes['close-day'].emit('click');
  // Existing duplicate data remains visible and is marked as conflicting.
  const stored = JSON.parse(app.storage.get('kanban-board.stage1.v1'));
  stored[2].cards.push({ ...stored[0].cards[0], id: 'imported-duplicate', clientName: 'Другая запись' });
  const legacy = boot(new Map([['kanban-board.stage1.v1', JSON.stringify(stored)]]), false, '2028-02-10T12:00:00');
  assert.equal(legacy.nodes['calendar-grid'].querySelectorAll('.has-conflict').length, 2);
}
async function testDurationIntervals() {
  const app = boot(new Map(), false, '2028-02-10T12:00:00');
  const cards = () => app.board.querySelectorAll('.card');
  const open = (date, time, duration = '60') => {
    app.board.emit('click', { target: app.board.querySelector('.add-card') });
    assert.equal(app.nodes['card-duration'].value, '60');
    app.nodes['card-client'].value = 'Клиент'; app.nodes['card-service'].value = 'Услуга';
    app.nodes['card-date'].value = date; app.nodes['card-time'].value = time; app.nodes['card-duration'].value = duration;
    app.nodes['card-duration'].emit('change');
  };
  const create = (date, time, duration) => { open(date, time, duration); app.nodes['card-form'].emit('submit'); assert.equal(app.nodes['card-dialog'].open, false); };
  const blocked = (date, time, duration) => {
    const count = cards().length; open(date, time, duration);
    assert.equal(app.nodes['time-conflict'].hidden, false);
    app.nodes['card-form'].emit('submit'); assert.equal(cards().length, count);
    assert.equal(app.nodes['card-dialog'].open, true); app.nodes['cancel-dialog'].emit('click');
  };
  create('2028-02-10', '11:00', '90');
  assert.equal(cards()[0].querySelector('.booking-duration').textContent, '⏱️ 1.5 ч');
  assert.equal(cards()[0].querySelector('.booking-chip-text').textContent, '10.02.2028');
  const saved = () => JSON.parse(app.storage.get('kanban-board.stage1.v1'))[0].cards;
  assert.equal(saved()[0].duration, 90);
  assert.equal(saved()[0].endTime, '12:30');
  assert.equal(saved()[0].endDate, '2028-02-10');
  for (const time of ['11:00', '11:30', '12:00']) blocked('2028-02-10', time, '30');
  blocked('2028-02-10', '10:30', '60'); // Starts before but overlaps the appointment.
  blocked('2028-02-10', '10:00', '180'); // Fully contains the appointment.
  app.nodes['view-calendar'].emit('click');
  const grid = app.nodes['calendar-grid'];
  const day = date => grid.querySelectorAll('.calendar-day').find(node => node.dataset.calendarDate === date);
  grid.emit('click', { target: day('2028-02-10') });
  assert.deepEqual(app.nodes['day-schedule'].querySelectorAll('.day-booking').map(node => node.dataset.slotTimeLabel), ['11:00', '11:30', '12:00']);
  assert.ok(app.nodes['day-schedule'].querySelectorAll('.day-free-slot').some(node => node.dataset.slotTime === '12:30'));
  app.nodes['close-day'].emit('click'); app.nodes['view-board'].emit('click');
  create('2028-02-10', '12:30', '60'); // Adjacent services are allowed.
  app.board.emit('click', { target: cards()[0] });
  assert.equal(app.nodes['time-conflict'].hidden, true);
  assert.equal(app.nodes['card-duration'].value, '90');
  app.nodes['card-duration'].value = '120'; app.nodes['card-duration'].emit('change');
  assert.equal(app.nodes['time-conflict'].hidden, false);
  app.nodes['card-form'].emit('submit'); assert.equal(saved()[0].duration, 90);
  app.nodes['card-duration'].value = '30'; app.nodes['card-duration'].emit('change');
  assert.equal(app.nodes['time-conflict'].hidden, true);
  app.nodes['card-form'].emit('submit'); assert.equal(saved()[0].endTime, '11:30');
  create('2028-02-10', '14:00', '45');
  blocked('2028-02-10', '14:30', '30');
  create('2028-02-10', '14:45', '30');
  app.nodes['file-save'].emit('click');
  const text = await app.getDownload().text();
  const imported = boot(new Map(), false, '2028-02-10T12:00:00');
  imported.nodes['file-input'].files = [{ size: text.length, text: async () => text }];
  await imported.nodes['file-input'].emit('change');
  imported.board.emit('click', { target: imported.board.querySelectorAll('.card')[2] });
  assert.equal(imported.nodes['card-duration'].value, '45');
  assert.match(imported.nodes['booking-end'].textContent, /14:45/);
  const legacy = JSON.parse(text);
  legacy.columns[0].cards.forEach(card => { delete card.duration; delete card.endTime; delete card.endDate; });
  imported.nodes['cancel-dialog'].emit('click');
  imported.nodes['file-input'].files = [{ size: 1000, text: async () => JSON.stringify(legacy) }];
  await imported.nodes['file-input'].emit('change');
  imported.board.emit('click', { target: imported.board.querySelector('.card') });
  assert.equal(imported.nodes['card-duration'].value, '60');
  assert.match(imported.nodes['booking-end'].textContent, /12:00/);
  imported.nodes['cancel-dialog'].emit('click');
  const invalid = JSON.parse(text); invalid.columns[0].cards[0].duration = 17;
  const previousCount = imported.board.querySelectorAll('.card').length;
  imported.nodes['file-input'].files = [{ size: 1000, text: async () => JSON.stringify(invalid) }];
  await imported.nodes['file-input'].emit('change');
  assert.equal(imported.board.querySelectorAll('.card').length, previousCount);
  assert.match(imported.nodes.alertText, /длительность/);
  // Old bookings outside the new shift remain stored and visible in the calendar.
  const oldData = JSON.parse(app.storage.get('kanban-board.stage1.v1'));
  oldData[0].cards.push({ ...oldData[0].cards[0], id: 'old-night', date: '2028-02-29', time: '23:30', duration: 90 });
  const oldApp = boot(new Map([['kanban-board.stage1.v1', JSON.stringify(oldData)]]), false, '2028-02-10T12:00:00');
  oldApp.nodes['calendar-next'].emit('click');
  assert.match(oldApp.nodes['calendar-summary'].textContent, /Записей в этом месяце: 1/);
  assert.ok(oldApp.nodes['calendar-grid'].querySelectorAll('.calendar-day').find(node => node.dataset.calendarDate === '2028-03-01').querySelector('.calendar-event'));
}
function testWorkingHours() {
  const app = boot(new Map(), false, '2028-02-10T12:00:00');
  const open = () => app.board.emit('click', { target: app.board.querySelector('.add-card') });
  open();
  for (const [duration, last] of [[30, '17:30'], [45, '17:15'], [60, '17:00'], [90, '16:30'], [120, '16:00'], [150, '15:30'], [180, '15:00']]) {
    app.nodes['card-duration'].value = String(duration); app.nodes['card-duration'].emit('change');
    const options = app.nodes['card-time'].children.map(node => node.value).filter(Boolean);
    assert.equal(options[0], '08:00'); assert.equal(options.at(-1), last);
    assert.ok(options.every(time => time >= '08:00' && time < '18:00'));
  }
  app.nodes['card-duration'].value = '60'; app.nodes['card-duration'].emit('change');
  app.nodes['card-client'].value = 'Вечерняя запись'; app.nodes['card-date'].value = '2028-02-10'; app.nodes['card-time'].value = '17:00';
  app.nodes['card-time'].emit('change'); app.nodes['card-form'].emit('submit');
  assert.equal(app.nodes['card-dialog'].open, false);
  const stored = () => JSON.parse(app.storage.get('kanban-board.stage1.v1'))[0].cards;
  assert.equal(stored()[0].endTime, '18:00');
  for (const time of ['07:30', '17:15', '18:00', '23:30']) {
    open(); app.nodes['card-client'].value = 'Недопустимая запись'; app.nodes['card-date'].value = '2028-02-11'; app.nodes['card-time'].value = time;
    app.nodes['card-form'].emit('submit');
    assert.equal(app.nodes['card-dialog'].open, true); assert.equal(stored().length, 1);
    assert.match(app.nodes['form-error'].textContent, /08:00–18:00/); app.nodes['cancel-dialog'].emit('click');
  }
  app.board.emit('click', { target: app.board.querySelector('.card') });
  app.nodes['card-duration'].value = '90'; app.nodes['card-duration'].emit('change');
  assert.equal(app.nodes['card-time'].value, '');
  assert.match(app.nodes['time-selection-note'].textContent, /Выберите другое время/);
  app.nodes['card-form'].emit('submit'); assert.equal(stored()[0].duration, 60);
  app.nodes['card-time'].value = '16:30'; app.nodes['card-time'].emit('change'); app.nodes['card-form'].emit('submit');
  assert.equal(stored()[0].duration, 90); assert.equal(stored()[0].endTime, '18:00');
  const empty = boot(new Map(), false, '2028-02-10T12:00:00');
  empty.nodes['view-calendar'].emit('click');
  const day = empty.nodes['calendar-grid'].querySelectorAll('.calendar-day').find(node => node.dataset.calendarDate === '2028-02-10');
  empty.nodes['calendar-grid'].emit('click', { target: day });
  assert.deepEqual(empty.nodes['day-schedule'].querySelectorAll('.day-hour').map(node => node.dataset.hour), ['08', '09', '10', '11', '12', '13', '14', '15', '16', '17']);
  assert.equal(empty.nodes['day-schedule'].querySelectorAll('.day-free-slot').length, 20);
  const lateSlot = empty.nodes['day-schedule'].querySelectorAll('.day-free-slot').find(node => node.dataset.slotTime === '17:30');
  empty.nodes['day-schedule'].emit('click', { target: lateSlot });
  assert.equal(empty.nodes['card-time'].value, '17:30'); assert.equal(empty.nodes['card-duration'].value, '30');
  empty.nodes['card-client'].value = 'Последние полчаса'; empty.nodes['card-form'].emit('submit');
  assert.equal(JSON.parse(empty.storage.get('kanban-board.stage1.v1'))[0].cards[0].endTime, '18:00');
}
function testClientBooking() {
  const app = boot(new Map(), false, '2028-02-10T12:00:00');
  app.board.emit('click', { target: app.board.querySelector('.add-card') });
  app.nodes['card-client'].value = 'Чужое имя'; app.nodes['card-phone'].value = '+79991234567'; app.nodes['card-service'].value = 'Стрижка';
  app.nodes['card-date'].value = '2028-02-11'; app.nodes['card-time'].value = '11:00'; app.nodes['card-duration'].value = '90'; app.nodes['card-form'].emit('submit');
  app.nodes['view-calendar'].emit('click'); app.nodes['view-client'].emit('click');
  assert.equal(app.nodes['master-header'].hidden, true); assert.equal(app.board.hidden, true); assert.equal(app.nodes['calendar-view'].hidden, true);
  assert.equal(app.nodes['client-view'].hidden, false);
  assert.equal(app.nodes['client-services'].children[0].value, 'Стрижка');
  assert.equal(app.nodes['client-contact'].hidden, true);
  app.nodes['client-service'].value = 'Укладка'; app.nodes['client-duration'].value = '90'; app.nodes['client-date'].value = '2028-02-11'; app.nodes['client-date'].emit('change');
  const slots = () => app.nodes['client-slots'].querySelectorAll('.client-slot');
  const times = () => slots().map(node => node.dataset.clientTime);
  assert.ok(times().includes('09:30')); assert.ok(times().includes('12:30'));
  for (const unavailable of ['10:00', '10:30', '11:00', '11:30', '12:00', '17:00', '18:00']) assert.equal(times().includes(unavailable), false);
  const allClientText = ['client-slots-hint', 'client-selection', 'client-error', 'client-success'].map(key => app.nodes[key].textContent).join(' ');
  assert.equal(allClientText.includes('Чужое имя'), false); assert.equal(allClientText.includes('79991234567'), false);
  const choose = time => app.nodes['client-slots'].emit('click', { target: slots().find(node => node.dataset.clientTime === time) });
  choose('09:30'); assert.equal(app.nodes['client-contact'].hidden, false);
  app.nodes['client-form'].emit('submit'); assert.match(app.nodes['client-error'].textContent, /имя/);
  app.nodes['client-name'].value = 'Ольга'; app.nodes['client-phone'].value = '123'; app.nodes['client-form'].emit('submit');
  assert.match(app.nodes['client-error'].textContent, /полный номер/);
  app.nodes['client-phone'].value = '89997654321'; app.nodes['client-form'].emit('submit');
  assert.equal(app.nodes['client-success'].hidden, false); assert.match(app.nodes['client-success'].textContent, /Вы записаны/);
  assert.equal(times().includes('09:30'), false);
  const state = () => JSON.parse(app.storage.get('kanban-board.stage1.v1'));
  const newColumn = () => state().find(column => column.name === 'Новая запись');
  assert.equal(newColumn().cards.length, 1);
  assert.equal(newColumn().cards[0].clientName, 'Ольга'); assert.equal(newColumn().cards[0].service, 'Укладка');
  assert.equal(newColumn().cards[0].time, '09:30'); assert.equal(newColumn().cards[0].duration, 90);
  assert.equal(newColumn().cards[0].endTime, '11:00'); assert.equal(newColumn().cards[0].status, 'new');
  app.nodes['client-form'].emit('submit'); assert.equal(newColumn().cards.length, 1);
  choose('08:00'); app.nodes['client-name'].value = 'Елена'; app.nodes['client-phone'].value = '+79998887766'; app.nodes['client-form'].emit('submit');
  assert.equal(state().filter(column => column.name === 'Новая запись').length, 1); assert.equal(newColumn().cards.length, 2);
  app.nodes['client-back'].emit('click'); assert.equal(app.nodes['calendar-view'].hidden, false); assert.equal(app.nodes['client-view'].hidden, true);
  const reloaded = boot(app.storage, false, '2028-02-10T12:00:00');
  assert.equal(reloaded.board.querySelectorAll('.card').length, 3);
  assert.equal(reloaded.nodes['calendar-grid'].querySelectorAll('.calendar-event').length, 3);
  app.nodes['view-client'].emit('click'); app.nodes['client-duration'].value = '30'; app.nodes['client-date'].value = '2028-02-09'; app.nodes['client-date'].emit('change');
  assert.equal(times().length, 0);
  app.nodes['client-date'].value = '2028-02-10'; app.nodes['client-date'].emit('change');
  assert.ok(times().every(time => time > '12:00' && time < '18:00'));
  app.nodes['client-date'].value = '2028-02-11'; app.nodes['client-date'].emit('change'); choose('14:00');
  // A booking added after choosing a slot must make that slot unavailable.
  app.board.emit('click', { target: app.board.querySelector('.add-card') });
  app.nodes['card-client'].value = 'Запись мастера'; app.nodes['card-date'].value = '2028-02-11'; app.nodes['card-time'].value = '14:00'; app.nodes['card-duration'].value = '30'; app.nodes['card-form'].emit('submit');
  app.nodes['client-name'].value = 'Поздний клиент'; app.nodes['client-phone'].value = '+79990001122'; app.nodes['client-form'].emit('submit');
  assert.match(app.nodes['client-error'].textContent, /недоступно/); assert.equal(newColumn().cards.length, 3); // two clients + master booking
  assert.equal(times().includes('14:00'), false);
}
async function testTextFileRoundTrip() {
  testClientBooking();
  testWorkingHours();
  await testDurationIntervals();
  testTimeConflictsAndDay();
  testCalendar();
  const bookingApp = boot();
  bookingApp.board.emit('click', { target: bookingApp.board.querySelector('.add-card') });
  const fields = { 'card-client': 'Анна Иванова', 'card-phone': '+7 (999) 123-45-67', 'card-date': '2026-10-15', 'card-time': '14:30', 'card-service': 'Стрижка и укладка' };
  for (const [field, value] of Object.entries(fields)) bookingApp.nodes[field].value = value;
  bookingApp.nodes['card-form'].emit('submit');
  let bookingTile = bookingApp.board.querySelector('.card');
  assert.equal(bookingTile.querySelector('.card-title').textContent, 'Анна Иванова');
  assert.equal(bookingTile.querySelector('.booking-date').querySelector('.booking-chip-text').textContent, '15.10.2026');
  assert.equal(bookingTile.querySelector('.booking-time').querySelector('.booking-chip-text').textContent, '14:30–15:30');
  assert.equal(bookingTile.querySelector('.booking-status').textContent, 'Новая');
  bookingApp.board.emit('click', { target: bookingTile.querySelector('.booking-phone') });
  assert.equal(bookingApp.nodes['contact-dialog'].open, true);
  assert.equal(bookingApp.nodes['card-dialog'].open, false);
  assert.equal(bookingApp.nodes['contact-whatsapp'].href, 'https://wa.me/79991234567');
  assert.equal(bookingApp.nodes['contact-call'].href, 'tel:+79991234567');
  bookingApp.nodes['close-contact'].emit('click');
  assert.equal(bookingApp.nodes['contact-dialog'].open, false);
  for (const [raw, formatted, number] of [
    ['8 (999) 123-45-67', '+7 (999) 123-45-67', '79991234567'],
    ['9991234567', '+7 (999) 123-45-67', '79991234567'],
    ['+44 7700 900123', '+44 7700 900123', '447700900123'],
    ['123', '123', undefined],
    ['<img src=x>', '<img src=x>', undefined]
  ]) {
    const phoneApp = boot();
    phoneApp.board.emit('click', { target: phoneApp.board.querySelector('.add-card') });
    phoneApp.nodes['card-client'].value = 'Клиент';
    phoneApp.nodes['card-phone'].value = raw;
    phoneApp.nodes['card-form'].emit('submit');
    const phone = phoneApp.board.querySelector('.booking-phone');
    assert.equal(phone.textContent, formatted);
    assert.equal(phone.dataset.contactNumber, number);
    assert.equal(phone.tag, number ? 'button' : 'div');
  }
  assert.equal(bookingTile.querySelector('.booking-phone').textContent, fields['card-phone']);
  assert.equal(bookingTile.querySelector('.booking-value').textContent, fields['card-service']);
  const bookingReloaded = boot(bookingApp.storage);
  bookingReloaded.board.emit('click', { target: bookingReloaded.board.querySelector('.card') });
  for (const [field, value] of Object.entries(fields)) assert.equal(bookingReloaded.nodes[field].value, value);
  bookingReloaded.nodes['card-time'].value = '16:00';
  bookingReloaded.nodes['card-status'].value = 'confirmed';
  bookingReloaded.nodes['card-form'].emit('submit');
  assert.equal(bookingReloaded.board.querySelector('.booking-status').textContent, 'Подтверждена');
  bookingReloaded.nodes['file-save'].emit('click');
  const bookingText = await bookingReloaded.getDownload().text();
  const bookingImported = boot();
  bookingImported.nodes['file-input'].files = [{ size: bookingText.length, text: async () => bookingText }];
  await bookingImported.nodes['file-input'].emit('change');
  bookingImported.board.emit('click', { target: bookingImported.board.querySelector('.card') });
  assert.equal(bookingImported.nodes['card-status'].value, 'confirmed');
  for (const [field, value] of Object.entries(fields)) assert.equal(bookingImported.nodes[field].value, field === 'card-time' ? '16:00' : value);
  bookingImported.nodes['cancel-dialog'].emit('click');
  bookingImported.board.emit('click', { target: bookingImported.board.querySelector('.add-card') });
  for (const field of Object.keys(fields)) assert.equal(bookingImported.nodes[field].value, '');
  assert.equal(bookingImported.nodes['card-status'].value, 'new');
  bookingImported.nodes['card-client'].value = 'Другой клиент';
  bookingImported.nodes['card-title'].value = 'Визит';
  bookingImported.nodes['card-status'].value = 'completed';
  bookingImported.nodes['card-form'].emit('submit');
  const finishedTile = bookingImported.board.querySelectorAll('.card')[1];
  assert.equal(finishedTile.querySelector('.booking-identity').querySelector('.booking-client').textContent, 'Другой клиент');
  assert.equal(finishedTile.querySelector('.booking-identity').querySelector('.booking-status').textContent, 'Завершено');
  app.nodes['file-save'].emit('click');
  const fileText = await app.getDownload().text();
  assert.match(fileText, /"format": "kanban-board"/);
  const payload = JSON.parse(fileText);
  assert.equal(payload.columns.length, 25);
  assert.equal(payload.columns[1].cards[0].title, 'Подготовить макет');
  assert.equal(payload.columns[1].cards[0].description, 'Первая строка\nВторая строка');
  assert.equal(payload.columns[1].cards[0].color, '#e879f9');
  const restored = boot();
  restored.nodes['file-input'].files = [{ name: 'доска.txt', size: fileText.length, text: async () => fileText }];
  await restored.nodes['file-input'].emit('change');
  assert.equal(restored.board.querySelectorAll('.column').length, 25);
  assert.equal(restored.board.querySelectorAll('.card').length, 22);
  assert.equal(restored.board.querySelectorAll('.column')[1].querySelector('.card-title').textContent, 'Подготовить макет');
  assert.equal(restored.board.querySelectorAll('.column')[1].querySelector('.card').style.values['--card-color'], '#e879f9');
  const oldColumnCount = restored.board.querySelectorAll('.column').length;
  restored.nodes['file-input'].files = [{ name: 'битый.txt', size: 3, text: async () => '{no' }];
  await restored.nodes['file-input'].emit('change');
  assert.equal(restored.board.querySelectorAll('.column').length, oldColumnCount);
  assert.match(restored.nodes.alertText, /Не удалось загрузить доску/);
  const firstColumn = restored.board.querySelectorAll('.column')[1];
  const firstCard = firstColumn.querySelector('.card');
  restored.board.emit('click', { target: firstCard });
  assert.equal(restored.nodes['card-dialog'].open, true);
  restored.nodes['card-title'].value = 'Обновлённая карточка';
  restored.nodes['card-description'].value = 'Новое описание';
  restored.nodes['card-palette'].querySelectorAll('.palette-swatch')[6].emit('click');
  restored.nodes['card-form'].emit('submit');
  assert.equal(restored.board.querySelectorAll('.column')[1].querySelector('.card-title').textContent, 'Обновлённая карточка');
  assert.equal(restored.board.querySelectorAll('.column')[1].querySelector('.card').style.values['--card-color'], '#22d3ee');
  const editButton = restored.board.querySelectorAll('.edit-column-button')[1];
  restored.board.emit('click', { target: editButton });
  restored.nodes['column-name'].value = 'Проверка'; restored.nodes['column-color'].value = '#123456';
  restored.nodes['column-form'].emit('submit');
  assert.equal(restored.board.querySelectorAll('.column')[1].querySelector('.column-heading').children[1].textContent, 'Проверка');
  assert.equal(restored.board.querySelectorAll('.column')[1].style.values?.['--column-color'], '#123456');
  restored.board.emit('click', { target: restored.board.querySelectorAll('.edit-column-button')[1] });
  restored.setConfirm(false); restored.nodes['delete-column'].emit('click');
  assert.equal(restored.board.querySelectorAll('.column').length, 25);
  assert.match(restored.getConfirmation(), /карточки \(1\)/);
  restored.setConfirm(true); restored.nodes['delete-column'].emit('click');
  assert.equal(restored.board.querySelectorAll('.column').length, 24);
  const oldPayload = JSON.parse(fileText);
  delete oldPayload.columns[1].cards[0].color;
  const legacy = boot();
  legacy.nodes['file-input'].files = [{ name: 'старый.txt', size: 500, text: async () => JSON.stringify(oldPayload) }];
  await legacy.nodes['file-input'].emit('change');
  assert.equal(legacy.board.querySelectorAll('.column')[1].querySelector('.card').style.values['--card-color'], oldPayload.columns[1].color);
  const tileTrash = legacy.board.querySelectorAll('.column')[1].querySelector('.card').querySelector('.tile-delete');
  legacy.setConfirm(false); legacy.board.emit('click', { target: tileTrash });
  assert.equal(legacy.board.querySelectorAll('.column')[1].querySelectorAll('.card').length, 1);
  legacy.setConfirm(true); legacy.board.emit('click', { target: tileTrash });
  assert.equal(legacy.board.querySelectorAll('.column')[1].querySelectorAll('.card').length, 0);
  console.log('OK: client booking and privacy, free-slot filtering, repeated availability check, new-column integration, persistence, shift boundaries, durations, intervals, calendar, phone actions and TXT import/export.');
}
testTextFileRoundTrip().catch(error => { console.error(error); process.exitCode = 1; });
