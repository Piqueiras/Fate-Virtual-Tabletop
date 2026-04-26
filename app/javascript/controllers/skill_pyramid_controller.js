import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["pool", "level"]

  connect() {
    this.element.querySelectorAll(".skill-chip").forEach((chip) => {
      chip.addEventListener("dragstart", this.dragStart.bind(this))
    })
  }

  dragStart(event) {
    event.dataTransfer.setData("text/plain", event.target.dataset.skillName)
    event.dataTransfer.effectAllowed = "move"
  }

  allowDrop(event) {
    event.preventDefault()
    event.currentTarget.classList.add("ring-2", "ring-indigo-400/80")
  }

  leaveDrop(event) {
    event.currentTarget.classList.remove("ring-2", "ring-indigo-400/80")
  }

  drop(event) {
    event.preventDefault()
    event.currentTarget.classList.remove("ring-2", "ring-indigo-400/80")
    const skill = event.dataTransfer.getData("text/plain")
    if (!skill) return

    const chip = this.element.querySelector(`[data-skill-name="${CSS.escape(skill)}"]`)
    if (!chip) return

    const level = event.currentTarget.dataset.level

    if (level) {
      chip.querySelector("input[type='hidden']")?.remove()
      chip.appendChild(this.hiddenInput(skill, level))
      event.currentTarget.appendChild(chip)
    } else {
      chip.querySelector("input[type='hidden']")?.remove()
      this.poolTarget.appendChild(chip)
    }
  }

  hiddenInput(skill, level) {
    const input = document.createElement("input")
    input.type = "hidden"
    input.name = `character[skills][${level}][]`
    input.value = skill
    return input
  }
}
