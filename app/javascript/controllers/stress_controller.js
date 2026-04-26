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
  static targets = ["physicalInput", "mentalInput"]
  static values = { autoSubmit: Boolean }

  connect() {
    this.form = this.element.querySelector("form")
  }

  toggle(event) {
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
      this.form.requestSubmit()
    }
  }

  updateCount(type, value) {
    const countElement = this.element.querySelector(`[data-stress-count="${type}"]`)
    if (countElement) countElement.textContent = value
  }

  updateInput(type, value) {
    const target = type === "physical" ? this.physicalInputTarget : this.mentalInputTarget
    if (target) target.value = value
  }
}
