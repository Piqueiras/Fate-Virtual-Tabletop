import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["board", "token", "activeList", "gameLogList", "background", "spacer", "canvas", "drawBtn", "tokenLayer"]
  static values = { roomId: Number }

  connect() {
    this.dragging = null
    this.offsetX = 0
    this.offsetY = 0
    this.moveBound = null
    this.endBound = null
    this.draggingRoster = null
    this.isDrawingMode = false
    this.isPainting = false
    this.ctx = null

    // 1. Candado de seguridad para evitar cálculos prematuros
    this.boardReady = false

    this.tokenSizes = [45, 75, 120, 180]
    const maxIndex = this.tokenSizes.length - 1
    const savedZoom = localStorage.getItem(`vtt_zoom_${this.roomIdValue}`)
    this.currentZoomIndex = savedZoom !== null ? parseInt(savedZoom, 10) : maxIndex

    this.resizeObserver = new ResizeObserver(() => {
      // Al redimensionar la ventana, clampeamos visualmente pero NO guardamos en BD
      if (this.boardReady) this.clampTokenPositions(false)
    })
    this.resizeObserver.observe(this.boardTarget)

    // 2. Iniciamos la espera
    this.waitForBoardToLoad()
  }

  disconnect() {
    if (this.resizeObserver) this.resizeObserver.disconnect()
  }

  // ==========================================
  // CARGA SEGURA Y ZOOM
  // ==========================================

  waitForBoardToLoad() {
    if (!this.hasSpacerTarget) {
      this.unlockBoard()
      return
    }

    const spacer = this.spacerTarget
    // Si no hay imagen, o la imagen ya cargó instantáneamente de la caché
    if (!spacer.getAttribute('src') || spacer.complete) {
      this.unlockBoard()
    } else {
      // Si la imagen está tardando en descargar, nos suscribimos al evento "load"
      spacer.addEventListener('load', () => this.unlockBoard(), { once: true })
      spacer.addEventListener('error', () => this.unlockBoard(), { once: true }) // Fallback por si falla el internet
    }
  }

  unlockBoard() {
    // Damos 1 frame de respiro al navegador para pintar, y quitamos el candado
    requestAnimationFrame(() => {
      this.boardReady = true
      this.applyZoom()
    })
  }

  zoomIn(event) {
    if (event) event.preventDefault()
    if (this.currentZoomIndex < this.tokenSizes.length - 1) {
      this.currentZoomIndex++
      this.applyZoom()
    }
  }

  zoomOut(event) {
    if (event) event.preventDefault()
    if (this.currentZoomIndex > 0) {
      this.currentZoomIndex--
      this.applyZoom()
    }
  }

  applyZoom() {
    const newSize = this.tokenSizes[this.currentZoomIndex]
    localStorage.setItem(`vtt_zoom_${this.roomIdValue}`, this.currentZoomIndex)

    this.tokenTargets.forEach(token => {
      token.style.width = `${newSize}px`
      token.style.height = `${newSize}px`
    })

    // Al hacer zoom explícito con los botones, SÍ guardamos si algún token choca con el borde
    if (this.boardReady) {
      this.clampTokenPositions(true)
    }
  }

  // ==========================================
  // DIBUJO EN CANVAS (PAINT)
  // ==========================================

  setupCanvas() {
    if (!this.hasCanvasTarget) return
    const canvas = this.canvasTarget
    
    // El canvas necesita que sus atributos internos width/height coincidan 
    // con sus píxeles reales en pantalla para no verse borroso ni descolocado
    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight
    
    // Configuración del "Pincel"
    this.ctx = canvas.getContext('2d')
    this.ctx.lineWidth = 5           // Grosor de la línea
    this.ctx.lineCap = 'round'       // Puntas redondeadas
    this.ctx.strokeStyle = '#ef4444' // Color rojo de Tailwind (puedes cambiarlo)
  }

  toggleDrawMode(event) {
    if (event) event.preventDefault()
    this.isDrawingMode = !this.isDrawingMode

    const btn = this.drawBtnTarget
    const canvas = this.canvasTarget

    // Inicializamos las proporciones del canvas la primera vez
    if (this.isDrawingMode && !this.ctx) {
      this.setupCanvas()
    }

    if (this.isDrawingMode) {
      // Activar Modo Dibujo: Iluminamos el botón, activamos canvas y bloqueamos tokens
      btn.classList.add('bg-indigo-100', 'border-indigo-300', 'text-indigo-700')
      btn.classList.remove('bg-white/90', 'text-slate-700')
      canvas.classList.remove('pointer-events-none')
      
      // Hacemos que los tokens ignoren el ratón para poder pintar sobre ellos o cerca de ellos
      if (this.hasTokenLayerTarget) this.tokenLayerTarget.classList.add('pointer-events-none')
    } else {
      // Desactivar Modo Dibujo
      btn.classList.remove('bg-indigo-100', 'border-indigo-300', 'text-indigo-700')
      btn.classList.add('bg-white/90', 'text-slate-700')
      canvas.classList.add('pointer-events-none')
      
      if (this.hasTokenLayerTarget) this.tokenLayerTarget.classList.remove('pointer-events-none')
    }
  }

  startDrawing(event) {
    if (!this.isDrawingMode) return
    event.preventDefault()
    
    this.isPainting = true
    this.draw(event) // Para pintar un simple punto si solo hacen clic
  }

  draw(event) {
    if (!this.isPainting || !this.isDrawingMode) return
    event.preventDefault()

    const canvas = this.canvasTarget
    const rect = canvas.getBoundingClientRect()
    
    // Calculamos dónde está el puntero relativo al canvas
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    this.ctx.lineTo(x, y)
    this.ctx.stroke()
    
    // Empezamos un nuevo path para que la línea fluya
    this.ctx.beginPath()
    this.ctx.moveTo(x, y)
  }

  stopDrawing(event) {
    if (!this.isPainting) return
    event.preventDefault()
    
    this.isPainting = false
    this.ctx.beginPath() // Reseteamos el trazo
  }

  // ==========================================
  // SUBIDA DE FONDO
  // ==========================================

  submitBackgroundImage(event) {
    event.preventDefault()
    const file = event.currentTarget.files?.[0]
    if (!file) return

    const objectUrl = URL.createObjectURL(file)
    this.previewBackgroundImage(objectUrl)
    this.sendBackgroundImage(file)
  }

  previewBackgroundImage(url) {
    if (this.hasSpacerTarget) {
      this.spacerTarget.src = url
      this.spacerTarget.classList.remove('hidden')
      this.spacerTarget.classList.add('block')
    }
    
    if (this.hasBackgroundTarget) {
      this.backgroundTarget.classList.remove('bg-gradient-to-br', 'from-slate-200', 'via-slate-100', 'to-white')
      this.backgroundTarget.classList.add('bg-cover', 'bg-center')
      this.backgroundTarget.style.backgroundImage = `url('${url}')`
    }
  }

  sendBackgroundImage(file) {
    const url = `/rooms/${this.roomIdValue}`
    const tokenMeta = document.querySelector("meta[name='csrf-token']")
    const formData = new FormData()
    
    formData.append('room[background_image]', file)

    fetch(url, {
      method: 'PATCH',
      headers: { 'X-CSRF-Token': tokenMeta?.content, 'Accept': 'application/json' },
      credentials: 'same-origin',
      body: formData,
    })
      .then((response) => response.ok ? response.json() : Promise.reject(response))
      .then((data) => {
        if (data.background_url) this.previewBackgroundImage(data.background_url)
      })
      .catch((error) => console.error('Error subiendo imagen de fondo', error))
  }

  // ==========================================
  // MOVER TOKENS POR EL TABLERO (POINTER)
  // ==========================================

  startDrag(event) {
    if (event.target.closest('button')) return

    const token = event.currentTarget.closest('[data-room-board-target="token"]')
    if (!token) return

    event.preventDefault()
    this.dragging = token
    const rect = token.getBoundingClientRect()
    this.offsetX = event.clientX - rect.left
    this.offsetY = event.clientY - rect.top
    token.classList.add("ring-2", "ring-indigo-500", "shadow-2xl", "z-50")

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
    token.classList.remove("ring-2", "ring-indigo-500", "shadow-2xl", "z-50")

    const left = Number(token.dataset.roomBoardLastX || token.style.left.replace("px", ""))
    const top = Number(token.dataset.roomBoardLastY || token.style.top.replace("px", ""))
    
    // Al soltar el click, forzamos guardar en BD
    this.savePosition(token, left, top)

    this.dragging = null
    window.removeEventListener("pointermove", this.moveBound)
    window.removeEventListener("pointerup", this.endBound)
    window.removeEventListener("pointercancel", this.endBound)
    this.moveBound = null
    this.endBound = null
  }

  // Ahora recibe un parámetro para decidir si bombardea la BD o no
  clampTokenPositions(saveToDb = true) {
    if (!this.hasBoardTarget || !this.boardReady) return

    const boardRect = this.boardTarget.getBoundingClientRect()
    const tokens = this.hasTokenTarget ? this.tokenTargets : Array.from(this.boardTarget.querySelectorAll('[data-room-board-target="token"]'))

    tokens.forEach((token) => {
      const tokenWidth = token.offsetWidth
      const tokenHeight = token.offsetHeight
      let left = parseFloat(token.style.left) || 0
      let top = parseFloat(token.style.top) || 0
      let changed = false

      if (left + tokenWidth > boardRect.width) { left = Math.max(0, boardRect.width - tokenWidth); changed = true }
      if (top + tokenHeight > boardRect.height) { top = Math.max(0, boardRect.height - tokenHeight); changed = true }
      if (left < 0) { left = 0; changed = true }
      if (top < 0) { top = 0; changed = true }

      if (changed) {
        token.style.left = `${left}px`
        token.style.top = `${top}px`
        
        // Solo guardamos permanentemente si no viene de redimensionar la ventana
        if (saveToDb) {
          this.savePosition(token, left, top)
        }
      }
    })
  }

  savePosition(token, x, y) {
    const roomCharacterId = token.dataset.roomBoardRoomCharacterIdValue
    if (!roomCharacterId) return

    const url = `/rooms/${this.roomIdValue}/room_characters/${roomCharacterId}`
    const tokenMeta = document.querySelector("meta[name='csrf-token']")

    fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Accept": "application/json", "X-CSRF-Token": tokenMeta?.content },
      body: JSON.stringify({ room_character: { pos_x: Math.round(x), pos_y: Math.round(y) } }),
    }).catch((error) => console.error("Error guardando posición", error))
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

    card.classList.add("opacity-60")
  }

  endRosterDrag(event) {
    document.querySelectorAll("[data-room-board-character-id-value]").forEach(card => card.classList.remove("opacity-60"))
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

    const file = Array.from(event.dataTransfer.files || []).find((item) => item.type.startsWith("image/"))
    if (file) {
      const objectUrl = URL.createObjectURL(file)
      this.previewBackgroundImage(objectUrl)
      this.sendBackgroundImage(file)
      return
    }

    const characterId = event.dataTransfer.getData("text/plain")
    if (!characterId) return

    const size = this.tokenSizes[this.currentZoomIndex]
    const half = size / 2

    const boardRect = this.boardTarget.getBoundingClientRect()
    const left = Math.max(0, Math.min(event.clientX - boardRect.left - half, boardRect.width - size))
    const top = Math.max(0, Math.min(event.clientY - boardRect.top - half, boardRect.height - size))

    this.createRoomCharacter(characterId, Math.round(left), Math.round(top))
  }

  dropActive(event) {
    event.preventDefault()
    event.currentTarget.classList.remove("ring-2", "ring-indigo-500")

    const characterId = event.dataTransfer.getData("text/plain")
    if (!characterId) return

    const size = this.tokenSizes[this.currentZoomIndex]
    const half = size / 2

    const boardRect = this.boardTarget.getBoundingClientRect()
    const left = Math.max(0, Math.min(boardRect.width / 2 - half, boardRect.width - size))
    const top = Math.max(0, Math.min(boardRect.height / 2 - half, boardRect.height - size))

    this.createRoomCharacter(characterId, Math.round(left), Math.round(top))
  }

  createRoomCharacter(characterId, x, y) {
    const url = `/rooms/${this.roomIdValue}/room_characters`
    const tokenMeta = document.querySelector("meta[name='csrf-token']")

    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json", "X-CSRF-Token": tokenMeta?.content },
      body: JSON.stringify({ room_character: { character_id: parseInt(characterId, 10), pos_x: x, pos_y: y, is_active: true } }),
    })
      .then((response) => response.ok ? response.json() : Promise.reject(response))
      .then(() => window.location.reload())
      .catch((error) => console.error("Error creando token en la sala", error))
  }

  removeRoomCharacter(event) {
    event.preventDefault()
    event.stopPropagation()

    const element = event.currentTarget.closest('[data-room-board-room-character-id-value]')
    const roomCharacterId = element?.dataset.roomBoardRoomCharacterIdValue
    if (!roomCharacterId) return

    const url = `/rooms/${this.roomIdValue}/room_characters/${roomCharacterId}`
    const tokenMeta = document.querySelector("meta[name='csrf-token']")

    fetch(url, {
      method: "DELETE",
      headers: { "Accept": "application/json", "X-CSRF-Token": tokenMeta?.content },
      credentials: "same-origin",
    })
      .then((response) => response.ok ? response.json() : Promise.reject(response))
      .then(() => {
        document.querySelectorAll(`[data-room-board-room-character-id-value="${roomCharacterId}"]`).forEach(e => e.remove())
      })
      .catch((error) => console.error("Error eliminando el personaje", error))
  }

  // ==========================================
  // 4. ATRIBUTOS (PUNTOS Y ESTRÉS)
  // ==========================================

  changeFatePoints(event) {
    event.preventDefault()
    const card = event.currentTarget.closest('[data-room-board-room-character-id-value]')
    const characterId = card?.dataset.characterId
    const delta = Number(event.currentTarget.dataset.fateDelta || 0)
    const pointsLabel = card.querySelector('[data-room-board-target="fatePoints"]')
    const currentPoints = Number(pointsLabel?.textContent || 0)
    const nextPoints = Math.max(0, currentPoints + delta)

    this.updateCharacterAttributes(characterId, { fate_points: nextPoints }, `Puntos de destino de ${this.characterName(card)} ${delta > 0 ? 'aumentaron' : 'disminuyeron'} a ${nextPoints}.`)
      .then(() => { if (pointsLabel) pointsLabel.textContent = nextPoints })
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
    const action = slots[index] ? 'marcado' : 'liberado'
    const label = type === 'physical' ? 'Estrés físico' : 'Estrés mental'

    this.updateCharacterAttributes(characterId, { [paramKey]: slots }, `${label} de ${this.characterName(card)} ${action}.`)
      .then(() => this.updateStressButtons(buttons, slots))
  }

  updateStressButtons(buttons, slots) {
    buttons.forEach((button) => {
      const index = Number(button.dataset.stressIndex)
      const filled = Boolean(slots[index])
      const type = button.dataset.stressType

      button.dataset.filled = filled
      button.setAttribute('aria-pressed', filled)

      if (type === 'physical') {
        button.className = `h-8 w-8 rounded-full border-2 transition-colors duration-150 focus:outline-none focus:ring-0 cursor-pointer ${filled ? 'border-red-600 bg-red-600' : 'border-red-600/70 bg-white'}`
      } else {
        button.className = `h-8 w-8 rounded-full border-2 transition-colors duration-150 focus:outline-none focus:ring-0 cursor-pointer ${filled ? 'border-blue-600 bg-blue-600' : 'border-blue-600/70 bg-white'}`
      }
    })
  }

  characterName(card) {
    return card?.querySelector('.character-name')?.textContent.trim() || 'Personaje'
  }

  updateCharacterAttributes(characterId, attributes, message) {
    if (!characterId) return Promise.reject()

    const url = `/characters/${characterId}`
    const tokenMeta = document.querySelector('meta[name="csrf-token"]')

    return fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-Token': tokenMeta?.content },
      body: JSON.stringify({ character: attributes }),
    })
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(data => { this.postGameLog(message); return data })
  }

  // ==========================================
  // 5. GAME LOG
  // ==========================================

    rollDice(event) {
        if (event) event.preventDefault()

        // 1. Capturamos el nombre inyectado por Rails en el botón
        const userName = event.currentTarget.dataset.userName || "Un jugador"

        const values = [-1, 0, 1]
        const roll = Array.from({ length: 4 }, () => values[Math.floor(Math.random() * values.length)])
        const sum = roll.reduce((a, b) => a + b, 0)

        const symbols = roll.map(v => v === 1 ? "+" : (v === -1 ? "-" : "0")).join(" ")
        const resultText = sum > 0 ? `+${sum}` : sum.toString()

        // 2. Lo añadimos al mensaje
        const message = `🎲 ${userName} : [ ${symbols} ] = ${resultText}`

        this.postGameLog(message)
    }

  postGameLog(message) {
    const url = `/rooms/${this.roomIdValue}/game_logs`
    const tokenMeta = document.querySelector('meta[name="csrf-token"]')

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-Token': tokenMeta?.content },
      body: JSON.stringify({ game_log: { message } }),
    })
  }

  clearLog(event) {
    event.preventDefault()
    
    if (!confirm("¿Seguro que quieres borrar todo el historial? Esta acción no se puede deshacer.")) return

    const url = `/rooms/${this.roomIdValue}/clear_game_logs`
    const tokenMeta = document.querySelector('meta[name="csrf-token"]')

    fetch(url, {
      method: 'DELETE',
      headers: { 'Accept': 'application/json', 'X-CSRF-Token': tokenMeta?.content },
      credentials: 'same-origin',
    })
    .then(response => {
      if (response.ok) {
        // 1. Si el servidor dice "OK", borramos la caja visualmente al instante
        if (this.hasGameLogListTarget) {
          this.gameLogListTarget.innerHTML = ""
        }
      } else {
        // 2. Si el servidor da un error 404 o 500, lo mostramos en la consola
        console.error("Error del servidor al intentar borrar:", response.status)
        alert("Hubo un problema al borrar el log. Mira la consola (F12).")
      }
    })
    .catch((error) => console.error("Error de red limpiando el log", error))
  }
}