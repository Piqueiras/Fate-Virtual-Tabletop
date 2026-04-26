import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["container", "template"]

  add(event) {
    event.preventDefault()
    // Clonamos la plantilla oculta y la insertamos en el contenedor
    const content = this.templateTarget.innerHTML.replace(/NEW_RECORD/g, new Date().getTime())
    this.containerTarget.insertAdjacentHTML('beforeend', content)
  }

  remove(event) {
    event.preventDefault()
    event.target.closest(".nested-fields").remove()
  }
}