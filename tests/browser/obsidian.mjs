globalThis.createEl = tag => document.createElement(tag);
// Only the Obsidian host surface is substituted; media, DOM and modal code are real.
HTMLElement.prototype.createEl = function(tag, options = {}) {
  const el = document.createElement(tag);
  if (options.text) el.textContent = options.text;
  if (options.cls) el.className = options.cls;
  for (const key of ['type', 'placeholder']) if (options[key]) el.setAttribute(key, options[key]);
  for (const [key, value] of Object.entries(options.attr || {})) el.setAttribute(key, value);
  this.append(el);
  return el;
};
HTMLElement.prototype.createDiv = function(options) { return this.createEl('div', options); };
HTMLElement.prototype.createSpan = function(options) { return this.createEl('span', options); };
HTMLElement.prototype.empty = function() { this.replaceChildren(); };
HTMLElement.prototype.addClass = function(...names) { this.classList.add(...names); };
HTMLElement.prototype.removeClass = function(...names) { this.classList.remove(...names); };
HTMLElement.prototype.setText = function(text) { this.textContent = text; };
HTMLElement.prototype.detach = function() { this.remove(); };
export class Component {
  addChild(child) { return child; }
  removeChild() {}
  registerInterval(id) { return id; }
}
export class Modal {
  constructor(app) {
    this.app = app;
    this.contentEl = document.body.createDiv();
    this.modalEl = this.contentEl;
  }
  setTitle(title) {
    this.titleEl?.remove();
    this.titleEl = this.contentEl.createEl('h2', { text: title, cls: 'modal-title' });
    return this;
  }
  close() { this.onClose?.(); }
}
export class AbstractInputSuggest {
  constructor(app, inputEl) { this.app = app; this.inputEl = inputEl; }
  setValue(value) { this.inputEl.value = value; }
  close() {}
}
export class Notice {}
class DropdownComponent {
  constructor(container) { this.selectEl = container.createEl('select'); }
  addOption(value, label) { this.selectEl.add(new Option(label, value)); return this; }
  setValue(value) { this.selectEl.value = value; return this; }
  onChange(callback) { this.selectEl.addEventListener('change', () => void callback(this.selectEl.value)); return this; }
}
class ToggleComponent {
  constructor(container) { this.toggleEl = container.createEl('input', { type: 'checkbox' }); }
  setValue(value) { this.toggleEl.checked = value; return this; }
  onChange(callback) { this.toggleEl.addEventListener('change', () => void callback(this.toggleEl.checked)); return this; }
}
export class TextComponent {
  constructor(container) { this.inputEl = container.createEl('input', { type: 'text' }); }
  setPlaceholder(value) { this.inputEl.placeholder = value; return this; }
  setValue(value) { this.inputEl.value = value; return this; }
  onChange(callback) { this.inputEl.addEventListener('input', () => void callback(this.inputEl.value)); return this; }
}
export class ButtonComponent {
  constructor(container) { this.buttonEl = container.createEl('button'); }
  setButtonText(value) { this.buttonEl.textContent = value; return this; }
  setCta() { this.buttonEl.classList.add('mod-cta'); return this; }
  setDisabled(value) { this.buttonEl.disabled = value; return this; }
  setIcon(value) { this.buttonEl.dataset.icon = value; return this; }
  setTooltip(value) { this.buttonEl.title = value; return this; }
  onClick(callback) { this.buttonEl.addEventListener('click', () => void callback()); return this; }
}
export class Setting {
  constructor(container) {
    this.settingEl = container.createDiv({ cls: 'setting-item' });
    this.infoEl = this.settingEl.createDiv({ cls: 'setting-item-info' });
    this.nameEl = this.infoEl.createDiv({ cls: 'setting-item-name' });
    this.descEl = this.infoEl.createDiv({ cls: 'setting-item-description' });
    this.controlEl = this.settingEl.createDiv({ cls: 'setting-item-control' });
  }
  setName(value) { this.nameEl.textContent = value; return this; }
  setDesc(value) { this.descEl.textContent = typeof value === 'string' ? value : ''; return this; }
  setHeading() { this.settingEl.classList.add('setting-item-heading'); return this; }
  addDropdown(callback) { callback(new DropdownComponent(this.controlEl)); return this; }
  addText(callback) { callback(new TextComponent(this.controlEl)); return this; }
  addToggle(callback) { callback(new ToggleComponent(this.controlEl)); return this; }
  addButton(callback) { callback(new ButtonComponent(this.controlEl)); return this; }
  addExtraButton(callback) { callback(new ButtonComponent(this.controlEl)); return this; }
}
export class TextAreaComponent {}
export class TFolder {}
export class TFile {}
export const getLanguage = () => 'en';
export const normalizePath = path => path;
export const Platform = { isDesktopApp: true, isMobile: false, isMobileApp: false };
export const requestUrl = () => { throw new Error('Network API calls are forbidden in media tests'); };
export class FuzzySuggestModal extends Modal {}
