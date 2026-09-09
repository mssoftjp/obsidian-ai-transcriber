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
HTMLElement.prototype.setText = function(text) { this.textContent = text; };
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
}
export class AbstractInputSuggest {}
export class Notice {}
export class Setting {}
export class ButtonComponent {}
export class TextAreaComponent {}
export class TFolder {}
export class TFile {}
export const getLanguage = () => 'en';
export const normalizePath = path => path;
export const Platform = { isDesktopApp: true };
export const requestUrl = () => { throw new Error('Network API calls are forbidden in media tests'); };
export class FuzzySuggestModal extends Modal {}
