import { Controller } from "@hotwired/stimulus"
import { createConsumer } from "@rails/actioncable"

export default class extends Controller {
  static targets = ["setupModal", "availablePool", "batchesContainer", "poolPlaceholder", "combatData",
                     "combatArea", "turnOrderContainer", "initiateBtn", "endCombatBtn"]
  static values = { roomId: Number, isDm: Boolean }

  connect() {
    // Cargar datos de combate activo si existen
    if (this.hasCombatDataTarget) {
      try {
        const data = JSON.parse(this.combatDataTarget.textContent.trim())
        this.activeCombat = data
      } catch (e) {
        this.activeCombat = null
      }
    } else {
      this.activeCombat = null
    }

    this.activeCharacters = []

    // Suscripción ActionCable para recibir actualizaciones de combate en tiempo real
    this.cable = createConsumer()
    this.combatSubscription = this.cable.subscriptions.create(
      { channel: "DrawingChannel", room_id: this.roomIdValue },
      { received: (data) => this.handleCableData(data) }
    )

  }

  disconnect() {
    if (this.combatSubscription) this.combatSubscription.unsubscribe()
    if (this.cable) this.cable.disconnect()
  }

  handleCableData(data) {
    if (data.action === "combat_update") {
      this.handleCombatUpdate(data.combat)
    }
  }

  // ========== ACTUALIZACIÓN EN TIEMPO REAL ==========

  handleCombatUpdate(combatData) {
    if (!combatData) return

    const active = combatData.active !== false

    if (!active) {
      // Combate terminado: ocultar barra de turnos, mostrar botón iniciar
      this.activeCombat = null
      this.hideTurnOrderBar()
      this.showInitiateButton()
      this.hideEndCombatButton()
      return
    }

    this.activeCombat = combatData

    if (combatData.batches && combatData.batches.length > 0) {
      // Actualizar o crear la barra de turnos
      this.updateTurnOrderBar(combatData)
      this.hideInitiateButton()
      if (this.isDmValue) this.showEndCombatButton()
    }
  }

  updateTurnOrderBar(combatData) {
    const container = this.findTurnOrderContainer()
    if (!container) return

    const isDm = this.isDmValue
    const currentIndex = combatData.current_batch_index || 0

    let html = '<div class="flex items-center justify-center gap-2 py-3 px-4 bg-slate-900 text-white rounded-2xl shadow-lg overflow-x-auto">'
    html += '<span class="text-xs uppercase tracking-widest text-slate-400 mr-2 shrink-0">Turnos:</span>'

    combatData.batches.forEach((batch, index) => {
      const isActive = index === currentIndex
      const activeClass = isActive ? 'bg-indigo-500 text-white ring-2 ring-indigo-300 scale-110' : 'bg-slate-700 text-slate-300'

      html += '<div class="flex items-center gap-1 shrink-0">'
      html += `<div class="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${activeClass}">`

      const ids = batch.room_character_ids || []
      if (ids.length === 0) {
        html += '<span class="text-slate-500 italic">Vacío</span>'
      } else {
        // Buscar nombres desde el DOM (personajes activos)
        ids.forEach((rcId, i) => {
          const name = this.findCharacterName(rcId) || `ID:${rcId}`
          html += `<span>${this.escapeHtml(name)}</span>`
          if (i < ids.length - 1) {
            html += '<span class="text-slate-500">,</span>'
          }
        })
      }

      html += '</div>'

      // Flecha entre lotes
      if (index < combatData.batches.length - 1) {
        html += '<span class="text-indigo-400 text-lg">→</span>'
      }

      html += '</div>'
    })

    html += '</div>'
    container.innerHTML = html
    container.style.display = ''
  }

  hideTurnOrderBar() {
    const container = this.findTurnOrderContainer()
    if (container) {
      container.innerHTML = ''
      container.style.display = 'none'
    }
  }

  findTurnOrderContainer() {
    if (this.hasTurnOrderContainerTarget) return this.turnOrderContainerTarget
    // Fallback: buscar dentro del combat_area
    const area = this.hasCombatAreaTarget ? this.combatAreaTarget : this.element
    let container = area.querySelector('#turn_order_container')
    if (!container) {
      container = document.createElement('div')
      container.id = 'turn_order_container'
      area.appendChild(container)
    }
    return container
  }

  findCharacterName(roomCharacterId) {
    const activeList = document.querySelector('[data-room-board-target="activeList"]')
    if (!activeList) return null
    const details = activeList.querySelector(`details[data-room-board-room-character-id-value="${roomCharacterId}"]`)
    if (!details) return null
    return details.querySelector('.character-name')?.textContent.trim() || null
  }

  escapeHtml(str) {
    const div = document.createElement('div')
    div.textContent = str
    return div.innerHTML
  }

  // ========== VISIBILIDAD DE BOTONES ==========

  showInitiateButton() {
    if (!this.isDmValue) return
    const area = this.hasCombatAreaTarget ? this.combatAreaTarget : this.element
    let btn = area.querySelector('[data-combat-target="initiateBtn"]')
    if (!btn) {
      btn = document.createElement('div')
      btn.setAttribute('data-combat-target', 'initiateBtn')
      btn.className = 'flex justify-center mb-2'
      btn.innerHTML = '<button type="button" data-action="click->combat#openSetup" class="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-500 shadow-lg transition-all active:scale-95">⚔️ Iniciar combate</button>'
      area.insertBefore(btn, area.firstChild)
    }
    btn.style.display = ''
  }

  hideInitiateButton() {
    const area = this.hasCombatAreaTarget ? this.combatAreaTarget : this.element
    const btn = area.querySelector('[data-combat-target="initiateBtn"]')
    if (btn) btn.style.display = 'none'
  }

  showEndCombatButton() {
    if (!this.isDmValue) return
    const area = this.hasCombatAreaTarget ? this.combatAreaTarget : this.element
    let btn = area.querySelector('[data-combat-target="endCombatBtn"]')
    if (!btn) {
      btn = document.createElement('div')
      btn.setAttribute('data-combat-target', 'endCombatBtn')
      btn.className = 'flex justify-center items-center gap-3 mb-2'
      btn.innerHTML = `<button type="button" data-action="click->combat#nextTurn"
                data-combat-id=""
                class="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500 shadow-lg transition-all active:scale-95">
                ▶ Siguiente turno</button>
              <button type="button" data-action="click->combat#endCombat"
                data-combat-id=""
                class="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-500 shadow-lg transition-all active:scale-95">
                🏁 Terminar combate</button>`
      area.insertBefore(btn, area.firstChild)
    }
    // Actualizar el data-combat-id en ambos botones
    if (this.activeCombat) {
      btn.querySelectorAll('button').forEach(b => { b.dataset.combatId = this.activeCombat.id })
    }
    btn.style.display = ''
  }

  hideEndCombatButton() {
    const area = this.hasCombatAreaTarget ? this.combatAreaTarget : this.element
    const btn = area.querySelector('[data-combat-target="endCombatBtn"]')
    if (btn) btn.style.display = 'none'
  }

  // ========== MODAL SETUP ==========

  openSetup(event) {
    event.preventDefault()
    this.loadAvailableCharacters()

    if (this.activeCombat && this.activeCombat.batches && this.activeCombat.batches.length > 0) {
      this.batches = JSON.parse(JSON.stringify(this.activeCombat.batches))
    } else {
      this.batches = [
        { position: 0, room_character_ids: [] },
        { position: 1, room_character_ids: [] }
      ]
    }

    this.renderBatches()
    this.renderAvailablePool()
    this.setupModalTarget.classList.remove("hidden")
  }

  closeSetup(event) {
    if (event) event.preventDefault()
    this.setupModalTarget.classList.add("hidden")
  }

  loadAvailableCharacters() {
    const activeList = document.querySelector('[data-room-board-target="activeList"]')
    if (!activeList) {
      this.activeCharacters = []
      return
    }

    const details = activeList.querySelectorAll('details[data-room-board-room-character-id-value]')
    this.activeCharacters = Array.from(details).map(detail => ({
      room_character_id: parseInt(detail.dataset.roomBoardRoomCharacterIdValue),
      character_id: parseInt(detail.dataset.characterId),
      name: detail.querySelector('.character-name')?.textContent.trim() || 'Sin nombre'
    }))
  }

  // ========== RENDER DE LOTES ==========

  renderBatches() {
    if (!this.hasBatchesContainerTarget) return

    const container = this.batchesContainerTarget
    container.innerHTML = ""

    this.batches.forEach((batch, index) => {
      const isLast = index === this.batches.length - 1
      const batchDiv = document.createElement("div")
      batchDiv.className = "batch-row flex items-center gap-2"

      const label = document.createElement("span")
      label.className = "text-xs font-bold text-slate-500 uppercase tracking-widest shrink-0 w-16"
      label.textContent = `Lote ${index + 1}`

      const dropZone = document.createElement("div")
      dropZone.className = "flex-1 min-h-[48px] p-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 flex flex-wrap gap-1 items-start transition-colors"
      dropZone.dataset.batchIndex = index
      dropZone.dataset.action = "dragover->combat#allowDrop dragenter->combat#allowDrop dragleave->combat#leaveDrop drop->combat#dropToBatch"

      const batchCharIds = batch.room_character_ids || []
      batchCharIds.forEach(rcId => {
        const char = this.activeCharacters.find(c => c.room_character_id === rcId)
        if (char) {
          dropZone.appendChild(this.buildCharacterChip(char))
        }
      })

      if (batchCharIds.length === 0) {
        const placeholder = document.createElement("p")
        placeholder.className = "text-[10px] text-slate-400 w-full text-center pointer-events-none"
        placeholder.textContent = "Arrastra personajes aquí"
        dropZone.appendChild(placeholder)
      }

      const arrow = document.createElement("span")
      arrow.className = "text-xl text-indigo-400 shrink-0"
      arrow.textContent = "→"

      let removeBtn = null
      if (this.batches.length > 1) {
        removeBtn = document.createElement("button")
        removeBtn.type = "button"
        removeBtn.className = "shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full bg-red-50 text-red-500 hover:bg-red-100 transition text-sm"
        removeBtn.textContent = "×"
        removeBtn.setAttribute("data-action", "click->combat#removeBatch")
        removeBtn.dataset.batchIndex = index
      }

      batchDiv.appendChild(label)
      batchDiv.appendChild(dropZone)
      if (!isLast) {
        batchDiv.appendChild(arrow)
      }
      if (removeBtn) {
        batchDiv.appendChild(removeBtn)
      }

      container.appendChild(batchDiv)
    })
  }

  buildCharacterChip(char) {
    const chip = document.createElement("div")
    chip.className = "inline-flex items-center gap-1 px-2 py-1 rounded-full bg-indigo-100 border border-indigo-300 text-xs font-semibold text-indigo-700 cursor-grab active:cursor-grabbing"
    chip.draggable = true
    chip.dataset.roomCharacterId = char.room_character_id
    chip.dataset.action = "dragstart->combat#startCharDrag dragend->combat#endCharDrag"
    chip.textContent = char.name
    return chip
  }

  // ========== RENDER DEL POOL ==========

  renderAvailablePool() {
    if (!this.hasAvailablePoolTarget) return

    const pool = this.availablePoolTarget
    const assignedIds = new Set()
    this.batches.forEach(b => (b.room_character_ids || []).forEach(id => assignedIds.add(id)))

    pool.querySelectorAll('[data-room-character-id]').forEach(el => el.remove())

    const unassigned = this.activeCharacters.filter(c => !assignedIds.has(c.room_character_id))
    unassigned.forEach(char => {
      pool.appendChild(this.buildCharacterChip(char))
    })

    if (this.hasPoolPlaceholderTarget) {
      this.poolPlaceholderTarget.style.display = unassigned.length === 0 ? 'none' : ''
    }
  }

  // ========== DRAG & DROP ==========

  startCharDrag(event) {
    const chip = event.currentTarget
    const rcId = chip.dataset.roomCharacterId
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", rcId)
    chip.classList.add("opacity-50")
  }

  endCharDrag(event) {
    event.currentTarget.classList.remove("opacity-50")
  }

  allowDrop(event) {
    event.preventDefault()
    event.currentTarget.classList.add("bg-indigo-50", "border-indigo-400")
  }

  leaveDrop(event) {
    event.currentTarget.classList.remove("bg-indigo-50", "border-indigo-400")
  }

  allowPoolDrop(event) {
    event.preventDefault()
    if (this.hasPoolPlaceholderTarget) {
      this.poolPlaceholderTarget.textContent = "Soltar aquí para sacar del lote"
    }
  }

  leavePoolDrop(event) {
    if (this.hasPoolPlaceholderTarget) {
      this.poolPlaceholderTarget.textContent = "Arrastra personajes desde aquí a los lotes"
    }
  }

  dropToBatch(event) {
    event.preventDefault()
    const dropZone = event.currentTarget
    dropZone.classList.remove("bg-indigo-50", "border-indigo-400")

    const rcId = parseInt(event.dataTransfer.getData("text/plain"))
    if (!rcId) return

    const targetIndex = parseInt(dropZone.dataset.batchIndex)
    if (isNaN(targetIndex)) return

    this.batches.forEach(b => {
      b.room_character_ids = (b.room_character_ids || []).filter(id => id !== rcId)
    })

    if (!this.batches[targetIndex].room_character_ids.includes(rcId)) {
      this.batches[targetIndex].room_character_ids.push(rcId)
    }

    this.renderBatches()
    this.renderAvailablePool()
  }

  dropToPool(event) {
    event.preventDefault()
    const pool = event.currentTarget
    pool.classList.remove("bg-indigo-50", "border-indigo-400")

    if (this.hasPoolPlaceholderTarget) {
      this.poolPlaceholderTarget.textContent = "Arrastra personajes desde aquí a los lotes"
    }

    const rcId = parseInt(event.dataTransfer.getData("text/plain"))
    if (!rcId) return

    this.batches.forEach(b => {
      b.room_character_ids = (b.room_character_ids || []).filter(id => id !== rcId)
    })

    this.renderBatches()
    this.renderAvailablePool()
  }

  // ========== GESTIÓN DE LOTES ==========

  addBatch(event) {
    event.preventDefault()
    this.batches.push({
      position: this.batches.length,
      room_character_ids: []
    })
    this.renderBatches()
    this.renderAvailablePool()
  }

  removeBatch(event) {
    event.preventDefault()
    const index = parseInt(event.currentTarget.dataset.batchIndex)
    if (isNaN(index) || this.batches.length <= 1) return

    this.batches.splice(index, 1)
    this.batches.forEach((b, i) => b.position = i)

    this.renderBatches()
    this.renderAvailablePool()
  }

  // ========== GUARDAR E INICIAR COMBATE ==========

  async saveAndStart(event) {
    event.preventDefault()

    const hasChars = this.batches.some(b => (b.room_character_ids || []).length > 0)
    if (!hasChars) {
      alert("Debes asignar al menos un personaje a un lote para iniciar el combate.")
      return
    }

    const tokenMeta = document.querySelector("meta[name='csrf-token']")

    const payload = {
      combat: {
        combat_batches: this.batches.map((b, i) => ({
          position: i,
          room_character_ids: b.room_character_ids || []
        }))
      }
    }

    try {
      let response
      if (this.activeCombat && this.activeCombat.id) {
        response = await fetch(`/rooms/${this.roomIdValue}/combats/${this.activeCombat.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-CSRF-Token": tokenMeta?.content
          },
          body: JSON.stringify(payload)
        })
      } else {
        response = await fetch(`/rooms/${this.roomIdValue}/combats`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-CSRF-Token": tokenMeta?.content
          },
          body: JSON.stringify(payload)
        })
      }

      if (response.ok) {
        const data = await response.json()
        this.activeCombat = data
        this.setupModalTarget.classList.add("hidden")
        // El broadcast de ActionCable actualizará la UI de todos (incluido este cliente)
        this.updateTurnOrderBar(data)
        this.hideInitiateButton()
        if (this.isDmValue) this.showEndCombatButton()
      } else {
        const err = await response.json()
        alert("Error: " + (err.errors?.join(", ") || "No se pudo iniciar el combate"))
      }
    } catch (error) {
      console.error("Error iniciando combate", error)
      alert("Error de conexión al iniciar el combate")
    }
  }

  // ========== SIGUIENTE TURNO ==========

  async nextTurn(event) {
    event.preventDefault()
    const combatId = event.currentTarget.dataset.combatId
    if (!combatId) return

    const tokenMeta = document.querySelector("meta[name='csrf-token']")
    const url = `/rooms/${this.roomIdValue}/combats/${combatId}/next_turn`

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "X-CSRF-Token": tokenMeta?.content
        }
      })

      if (response.ok) {
        const data = await response.json()
        this.activeCombat = data.combat
        // El broadcast de ActionCable actualizará la UI de todos (incluido este cliente)
        this.updateTurnOrderBar(data.combat)
      }
    } catch (error) {
      console.error("Error avanzando turno", error)
    }
  }

  // ========== TERMINAR COMBATE ==========

  async endCombat(event) {
    event.preventDefault()
    const combatId = event.currentTarget.dataset.combatId
    if (!combatId) return

    if (!confirm("¿Estás seguro de que quieres terminar el combate?")) return

    const tokenMeta = document.querySelector("meta[name='csrf-token']")
    const url = `/rooms/${this.roomIdValue}/combats/${combatId}`

    try {
      const response = await fetch(url, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "X-CSRF-Token": tokenMeta?.content
        }
      })

      if (response.ok) {
        this.activeCombat = null
        // El broadcast de ActionCable actualizará la UI de todos
        this.hideTurnOrderBar()
        this.showInitiateButton()
        this.hideEndCombatButton()
      }
    } catch (error) {
      console.error("Error terminando combate", error)
    }
  }
}