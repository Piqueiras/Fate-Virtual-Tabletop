import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["board", "token", "activeList", "gameLogList"]
  static values = {
    roomId: Number
  }

  connect() {
    this.dragging = null
    this.offsetX = 0
    this.offsetY = 0
    this.moveBound = null
    this.endBound = null
    this.draggingRoster = null
    this.rosterGhost = null
    this.activeRosterCard = null
  }

  startDrag(event) {
    if (event.target.closest('button')) return

    const token = event.currentTarget.closest('[data-room-board-target="token"]')
    if (!token) return

    event.preventDefault()
    this.dragging = token
    const rect = token.getBoundingClientRect()
    this.offsetX = event.clientX - rect.left
    this.offsetY = event.clientY - rect.top
    token.classList.add("ring-2", "ring-indigo-500", "shadow-2xl")

    this.moveBound = this.move.bind(this)
    this.endBound = this.endDrag.bind(this)
    window.addEventListener("pointermove", this.moveBound)
    window.addEventListener("pointerup", this.endBound)
    window.addEventListener("pointercancel", this.endBound)
  }

  move(event) {
    if (!this.dragging) return
    event.preventDefault()

    const boardRect = this.boardTarget.getBoundingClientRect()
    let left = event.clientX - boardRect.left - this.offsetX
    let top = event.clientY - boardRect.top - this.offsetY

    left = Math.max(0, Math.min(left, boardRect.width - this.dragging.offsetWidth))
    top = Math.max(0, Math.min(top, boardRect.height - this.dragging.offsetHeight))

    this.dragging.style.left = `${left}px`
    this.dragging.style.top = `${top}px`
    this.dragging.dataset.roomBoardLastX = left
    this.dragging.dataset.roomBoardLastY = top
  }

  endDrag(event) {
    if (!this.dragging) return
    event.preventDefault()

    const token = this.dragging
    token.classList.remove("ring-2", "ring-indigo-500", "shadow-2xl")

    const left = Number(token.dataset.roomBoardLastX || token.style.left.replace("px", ""))
    const top = Number(token.dataset.roomBoardLastY || token.style.top.replace("px", ""))
    this.savePosition(token, left, top)

    this.dragging = null
    window.removeEventListener("pointermove", this.moveBound)
    window.removeEventListener("pointerup", this.endBound)
    window.removeEventListener("pointercancel", this.endBound)
    this.moveBound = null
    this.endBound = null
  }

  startRosterDrag(event) {
    const card = event.currentTarget
    const characterId = card.dataset.roomBoardCharacterIdValue
    if (!characterId) return

    const ghost = new Image()
    ghost.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="
    event.dataTransfer.setDragImage(ghost, 0, 0)
    event.dataTransfer.effectAllowed = "copy"
    event.dataTransfer.setData("text/plain", characterId)

    this.draggingRoster = characterId
    card.classList.add("opacity-60")
  }

  endRosterDrag(event) {
    const cards = document.querySelectorAll("[data-room-board-character-id-value]")
    cards.forEach((card) => card.classList.remove("opacity-60"))
    this.draggingRoster = null
  }

  allowDrop(event) {
    event.preventDefault()
    event.currentTarget.classList.add("ring-2", "ring-indigo-500")
  }

  leaveDrop(event) {
    event.currentTarget.classList.remove("ring-2", "ring-indigo-500")
  }

  drop(event) {
    event.preventDefault()
    event.currentTarget.classList.remove("ring-2", "ring-indigo-500")

    const characterId = event.dataTransfer.getData("text/plain")
    if (!characterId) return

    const boardRect = this.boardTarget.getBoundingClientRect()
    const left = Math.max(0, Math.min(event.clientX - boardRect.left - 60, boardRect.width - 120))
    const top = Math.max(0, Math.min(event.clientY - boardRect.top - 60, boardRect.height - 120))

    this.createRoomCharacter(characterId, Math.round(left), Math.round(top))
  }

  dropActive(event) {
    event.preventDefault()
    event.currentTarget.classList.remove("ring-2", "ring-indigo-500")

    const characterId = event.dataTransfer.getData("text/plain")
    if (!characterId) return

    const boardRect = this.boardTarget.getBoundingClientRect()
    const left = Math.max(0, Math.min(boardRect.width / 2 - 60, boardRect.width - 120))
    const top = Math.max(0, Math.min(boardRect.height / 2 - 60, boardRect.height - 120))

    this.createRoomCharacter(characterId, Math.round(left), Math.round(top))
  }

  createRoomCharacter(characterId, x, y) {
    const url = `/rooms/${this.roomIdValue}/room_characters`
    const tokenMeta = document.querySelector("meta[name='csrf-token']")
    const authToken = tokenMeta?.content

    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-CSRF-Token": authToken,
      },
      body: JSON.stringify({ room_character: { character_id: parseInt(characterId, 10), pos_x: x, pos_y: y, is_active: true } }),
    })
      .then((response) => {
        if (!response.ok) throw response
        return response.json()
      })
      .then(() => {
        window.location.reload()
      })
      .catch((error) => {
        console.error("Error creando token en la sala", error)
      })
  }

  removeRoomCharacter(event) {
    event.preventDefault()
    event.stopPropagation()

    const element = event.currentTarget.closest('[data-room-board-room-character-id-value]')
    const roomCharacterId = element?.dataset.roomBoardRoomCharacterIdValue
    if (!roomCharacterId) return

    const url = `/rooms/${this.roomIdValue}/room_characters/${roomCharacterId}`
    const tokenMeta = document.querySelector("meta[name='csrf-token']")
    const authToken = tokenMeta?.content

    fetch(url, {
      method: "DELETE",
      headers: {
        "Accept": "application/json",
        "X-CSRF-Token": authToken,
      },
      credentials: "same-origin",
    })
      .then((response) => {
        if (!response.ok) throw response
        const matchingElements = document.querySelectorAll(`[data-room-board-room-character-id-value="${roomCharacterId}"]`)
        matchingElements.forEach((element) => element.remove())
      })
      .catch((error) => {
        console.error("Error eliminando el personaje activo", error)
      })
  }

  changeFatePoints(event) {
    event.preventDefault()

    const card = event.currentTarget.closest('[data-room-board-room-character-id-value]')
    const characterId = card?.dataset.characterId
    const delta = Number(event.currentTarget.dataset.fateDelta || 0)
    const pointsLabel = card.querySelector('[data-room-board-target="fatePoints"]')
    const currentPoints = Number(pointsLabel?.textContent || 0)
    const nextPoints = Math.max(0, currentPoints + delta)

    this.updateCharacterAttributes(characterId, { fate_points: nextPoints }, `Puntos de destino de ${this.characterName(card)} ${delta > 0 ? 'aumentaron' : 'disminuyeron'} a ${nextPoints}.`)
      .then(() => {
        if (pointsLabel) pointsLabel.textContent = nextPoints
      })
      .catch((error) => {
        console.error('Error actualizando puntos de destino', error)
      })
  }

  toggleStressSlot(event) {
    event.preventDefault()

    const button = event.currentTarget
    const card = button.closest('[data-room-board-room-character-id-value]')
    const characterId = card?.dataset.characterId
    const type = button.dataset.stressType
    const index = Number(button.dataset.stressIndex)
    if (!characterId || !type) return

    const buttons = Array.from(card.querySelectorAll(`button[data-stress-type="${type}"]`))
    const slots = buttons.map((btn) => (btn.dataset.filled === 'true' ? 1 : 0))
    slots[index] = slots[index] ? 0 : 1
    const paramKey = type === 'physical' ? 'physical_stress_slots' : 'mental_stress_slots'
    const label = type === 'physical' ? 'Estrés físico' : 'Estrés mental'
    const action = slots[index] ? 'marcado' : 'liberado'

    this.updateCharacterAttributes(characterId, { [paramKey]: slots }, `${label} de ${this.characterName(card)} ${action}.`)
      .then(() => {
        this.updateStressButtons(buttons, slots)
      })
      .catch((error) => {
        console.error('Error actualizando estrés', error)
      })
  }

  updateStressButtons(buttons, slots) {
    buttons.forEach((button) => {
      const index = Number(button.dataset.stressIndex)
      const filled = Boolean(slots[index])
      const type = button.dataset.stressType

      button.dataset.filled = filled
      button.setAttribute('aria-pressed', filled)
      button.textContent = ''

      if (type === 'physical') {
        button.classList.toggle('border-red-600', filled)
        button.classList.toggle('bg-red-600', filled)
        button.classList.toggle('text-white', filled)
        button.classList.toggle('border-red-600/70', !filled)
        button.classList.toggle('bg-white', !filled)
        button.classList.toggle('text-red-600', !filled)
      } else if (type === 'mental') {
        button.classList.toggle('border-blue-600', filled)
        button.classList.toggle('bg-blue-600', filled)
        button.classList.toggle('text-white', filled)
        button.classList.toggle('border-blue-600/70', !filled)
        button.classList.toggle('bg-white', !filled)
        button.classList.toggle('text-blue-600', !filled)
      }
    })
  }

  characterName(card) {
    return card?.querySelector('.character-name')?.textContent.trim() || 'Personaje'
  }

  updateCharacterAttributes(characterId, attributes, message) {
    if (!characterId) return Promise.reject(new Error('No character id'))

    const url = `/characters/${characterId}`
    const tokenMeta = document.querySelector('meta[name="csrf-token"]')
    const authToken = tokenMeta?.content

    return fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-CSRF-Token': authToken,
      },
      credentials: 'same-origin',
      body: JSON.stringify({ character: attributes }),
    })
      .then((response) => {
        if (!response.ok) throw response
        return response.json()
      })
      .then((data) => {
        this.postGameLog(message)
        return data
      })
  }

  postGameLog(message) {
    const url = `/rooms/${this.roomIdValue}/game_logs`
    const tokenMeta = document.querySelector('meta[name="csrf-token"]')
    const authToken = tokenMeta?.content

    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-CSRF-Token': authToken,
      },
      credentials: 'same-origin',
      body: JSON.stringify({ game_log: { message } }),
    })
      .then((response) => {
        if (!response.ok) throw response
        return response.json()
      })
      .then((data) => {
        this.prependGameLog(data)
        return data
      })
  }

  prependGameLog(log) {
    if (!this.hasGameLogListTarget) return

    const item = document.createElement('div')
    item.className = 'rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700'

    const message = document.createElement('p')
    message.textContent = log.message

    const time = document.createElement('p')
    time.className = 'mt-2 text-xs text-slate-500'
    time.textContent = log.created_at ? new Date(log.created_at).toLocaleString() : 'Ahora'

    item.append(message, time)
    this.gameLogListTarget.prepend(item)
  }

  savePosition(token, x, y) {
    const roomCharacterId = token.dataset.roomBoardRoomCharacterIdValue
    if (!roomCharacterId) return

    const url = `/rooms/${this.roomIdValue}/room_characters/${roomCharacterId}`
    const tokenMeta = document.querySelector("meta[name='csrf-token']")
    const authToken = tokenMeta?.content

    fetch(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-CSRF-Token": authToken,
      },
      body: JSON.stringify({ room_character: { pos_x: Math.round(x), pos_y: Math.round(y) } }),
    }).then((response) => {
      if (!response.ok) {
        console.error("No se pudo guardar la posición del token", response)
      }
    }).catch((error) => {
      console.error("Error guardando posición del token", error)
    })
  }
}
