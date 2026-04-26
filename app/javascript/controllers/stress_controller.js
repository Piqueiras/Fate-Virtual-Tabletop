import { Controller } from "@hotwired/stimulus"

const STRESS_STYLES = {
  physical: {
    filled: ["bg-red-600", "text-white", "border-red-600"],
    empty: ["bg-white", "text-slate-700", "border-slate-300", "hover:border-red-400"]
  },
  mental: {
    filled: ["bg-blue-600", "text-white", "border-blue-600"],
    empty: ["bg-white", "text-slate-700", "border-slate-300", "hover:border-blue-400"]
  }
}

export default class extends Controller {
  static targets = ["fateCount"]
  static values = { autoSubmit: Boolean }

  connect() {
    this.form = this.element.querySelector("form")
  }

  async toggle(event) {
    event.preventDefault()

    const button = event.currentTarget
    const type = button.dataset.stressType
    const slot = button.dataset.stressSlot
    if (!slot) return

    const isFilled = button.classList.contains(STRESS_STYLES[type].filled[0])
    button.classList.toggle(STRESS_STYLES[type].filled[0], !isFilled)
    button.classList.toggle(STRESS_STYLES[type].filled[1], !isFilled)
    button.classList.toggle(STRESS_STYLES[type].filled[2], !isFilled)
    button.classList.toggle(STRESS_STYLES[type].empty[0], isFilled)
    button.classList.toggle(STRESS_STYLES[type].empty[1], isFilled)
    button.classList.toggle(STRESS_STYLES[type].empty[2], isFilled)
    button.classList.toggle(STRESS_STYLES[type].empty[3], isFilled)

    const input = this.element.querySelector(`input[data-stress-type="${type}"][data-stress-slot="${slot}"]`)
    if (input) {
      input.value = isFilled ? "0" : "1"
    }

    if (this.autoSubmitValue && this.form) {
      await this.submitForm(new FormData(this.form))
    }
  }

  async changeFate(event) {
    event.preventDefault()
    const button = event.currentTarget
    const delta = Number(button.dataset.fateDelta || 0)
    const current = Number(this.fateCountTarget.textContent.trim() || 0)
    const next = Math.max(0, current + delta)
    if (next === current) return

    const data = { character: { fate_points: next } }
    const response = await this.submitForm(data)
    if (response && response.fate_points !== undefined) {
      this.fateCountTarget.textContent = response.fate_points
    }
  }

  async submitForm(payload) {
    const action = this.form.action
    const method = this.form.querySelector('input[name="_method"]')?.value || this.form.method
    const headers = {
      Accept: "application/json",
      "X-CSRF-Token": this.csrfToken()
    }

    let body
    if (payload instanceof FormData) {
      body = payload
    } else {
      headers["Content-Type"] = "application/json"
      body = JSON.stringify(payload)
    }

    const response = await fetch(action, {
      method: method.toUpperCase(),
      body,
      headers,
      credentials: "same-origin"
    })

    if (!response.ok) {
      console.error("Error updating character", response)
      return null
    }

    return response.json().catch(() => null)
  }

  csrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.getAttribute("content")
  }
}
