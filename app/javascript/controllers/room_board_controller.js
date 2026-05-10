import { Controller } from "@hotwired/stimulus"
import { createConsumer } from "@rails/actioncable"

// Tamaño virtual fijo del tablero (1920x1080 = 16:9)
const VIRTUAL_WIDTH = 1920
const VIRTUAL_HEIGHT = 1080

export default class extends Controller {
  static targets = ["board", "token", "activeList", "gameLogList", "background", "spacer", "canvas", "drawBtn", "tokenLayer", "drawToolbar", "eraserBtn", "clearCanvasBtn", "canvasDataStore"]
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
    this.isEraser = false
    this.drawingColor = '#000000'
    this.canvasSaveTimeout = null

    // 1. Candado de seguridad para evitar cálculos prematuros
    this.boardReady = false

    this.tokenSizes = [80, 160, 240, 320]
    const maxIndex = this.tokenSizes.length - 1
    const savedZoom = localStorage.getItem(`vtt_zoom_${this.roomIdValue}`)
    this.currentZoomIndex = savedZoom !== null ? parseInt(savedZoom, 10) : maxIndex

    // ActionCable - suscripción al canal de dibujo
    this.cable = createConsumer()
    this.drawingSubscription = this.cable.subscriptions.create(
      { channel: "DrawingChannel", room_id: this.roomIdValue },
      { received: (data) => this.handleDrawingData(data) }
    )

    this.resizeObserver = new ResizeObserver(() => {
      if (this.boardReady) {
        this.repositionAllTokens()
        this.resizeCanvas()
      }
    })
    this.resizeObserver.observe(this.boardTarget)

    // 2. Iniciamos la espera
    this.waitForBoardToLoad()

    // Guardar canvas al cerrar/recargar la página
    this.boundBeforeUnload = () => this.saveCanvasDataSync()
    window.addEventListener("beforeunload", this.boundBeforeUnload)
  }

  disconnect() {
    window.removeEventListener("beforeunload", this.boundBeforeUnload)
    if (this.resizeObserver) this.resizeObserver.disconnect()
    if (this.drawingSubscription) this.drawingSubscription.unsubscribe()
    if (this.cable) this.cable.disconnect()
    this.saveCanvasDataSync()
  }

  // ==========================================
  // SISTEMA DE COORDENADAS VIRTUALES
  // ==========================================

  // Convierte coordenada virtual X a píxel real en el board
  virtToRealX(virtX) {
    return (virtX / VIRTUAL_WIDTH) * this.boardTarget.offsetWidth
  }

  // Convierte coordenada virtual Y a píxel real en el board
  virtToRealY(virtY) {
    return (virtY / VIRTUAL_HEIGHT) * this.boardTarget.offsetHeight
  }

  // Convierte píxel real del board X a coordenada virtual
  realToVirtX(realX) {
    return (realX / this.boardTarget.offsetWidth) * VIRTUAL_WIDTH
  }

  // Convierte píxel real del board Y a coordenada virtual
  realToVirtY(realY) {
    return (realY / this.boardTarget.offsetHeight) * VIRTUAL_HEIGHT
  }

  // Convierte un tamaño virtual a píxel real (escala uniforme)
  virtToRealSize(virtSize) {
    const scale = this.boardTarget.offsetWidth / VIRTUAL_WIDTH
    return virtSize * scale
  }

  // Convierte tamaño real a virtual
  realToVirtSize(realSize) {
    const scale = VIRTUAL_WIDTH / this.boardTarget.offsetWidth
    return realSize * scale
  }

  repositionToken(token) {
    const virtX = parseFloat(token.dataset.virtX) || 0
    const virtY = parseFloat(token.dataset.virtY) || 0
    token.style.left = `${this.virtToRealX(virtX)}px`
    token.style.top = `${this.virtToRealY(virtY)}px`
  }

  repositionAllTokens() {
    this.tokenTargets.forEach(token => this.repositionToken(token))
  }

  // ==========================================
  // TOKEN TARGET CONNECTED (posicionamiento inicial)
  // ==========================================

  tokenTargetConnected(token) {
    const zoomIndex = this.currentZoomIndex !== undefined ? this.currentZoomIndex : 2
    const virtSize = this.tokenSizes ? this.tokenSizes[zoomIndex] : 120

    // Solo ponemos tamaño y guardamos datos virtuales
    // EL posicionamiento real se hace en unlockBoard -> applyZoom cuando boardReady=true
    // y también en repositionAllTokens cuando el ResizeObserver se dispara
    if (this.boardReady) {
      token.style.width = `${this.virtToRealSize(virtSize)}px`
      token.style.height = `${this.virtToRealSize(virtSize)}px`
      this.repositionToken(token)
    } else {
      // Marcar posición absoluta 0,0 temporal hasta que el board cargue
      token.style.left = '0px'
      token.style.top = '0px'
    }

    token.dataset.virtSize = virtSize
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
    if (!spacer.getAttribute('src') || spacer.complete) {
      this.unlockBoard()
    } else {
      spacer.addEventListener('load', () => this.unlockBoard(), { once: true })
      spacer.addEventListener('error', () => this.unlockBoard(), { once: true })
    }
  }

  unlockBoard() {
    requestAnimationFrame(() => {
      this.boardReady = true
      this.applyZoom()
      // Inicializar canvas para cargar dibujos guardados
      this.setupCanvas()
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
    const virtSize = this.tokenSizes[this.currentZoomIndex]
    const realSize = this.virtToRealSize(virtSize)
    localStorage.setItem(`vtt_zoom_${this.roomIdValue}`, this.currentZoomIndex)

    this.tokenTargets.forEach(token => {
      token.style.width = `${realSize}px`
      token.style.height = `${realSize}px`
      token.dataset.virtSize = virtSize
      // Reposicionar desde data-virt-x/y (crucial cuando se conectaron antes de boardReady)
      this.repositionToken(token)
    })

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

    canvas.width = VIRTUAL_WIDTH
    canvas.height = VIRTUAL_HEIGHT

    this.ctx = canvas.getContext('2d')
    this.ctx.lineWidth = 5
    this.ctx.lineCap = 'round'
    this.ctx.lineJoin = 'round'
    this.ctx.strokeStyle = this.drawingColor
    this.ctx.globalCompositeOperation = 'source-over'

    // Restaurar dibujos guardados si existen
    if (this.hasCanvasDataStoreTarget) {
      const data = this.canvasDataStoreTarget.textContent
      if (data && data.length > 100) { // Más de 100 caracteres = hay dibujo real
        const img = new Image()
        img.onload = () => {
          this.ctx.drawImage(img, 0, 0)
        }
        img.src = data
      }
    }
  }

  resizeCanvas() {
    // El navegador maneja el escalado del canvas con CSS w-full/h-full
  }

  toggleDrawMode(event) {
    if (event) event.preventDefault()
    this.isDrawingMode = !this.isDrawingMode

    const btn = this.drawBtnTarget
    const canvas = this.canvasTarget
    const toolbar = this.hasDrawToolbarTarget ? this.drawToolbarTarget : null

    if (this.isDrawingMode && !this.ctx) {
      this.setupCanvas()
    }

    if (this.isDrawingMode) {
      btn.classList.add('bg-indigo-100', 'border-indigo-300', 'text-indigo-700')
      btn.classList.remove('bg-white/90', 'text-slate-700')
      canvas.classList.remove('pointer-events-none')
      if (toolbar) toolbar.classList.remove('hidden')

      if (this.hasTokenLayerTarget) this.tokenLayerTarget.classList.add('pointer-events-none')
    } else {
      btn.classList.remove('bg-indigo-100', 'border-indigo-300', 'text-indigo-700')
      btn.classList.add('bg-white/90', 'text-slate-700')
      canvas.classList.add('pointer-events-none')
      if (toolbar) toolbar.classList.add('hidden')

      this.isEraser = false
      if (this.hasEraserBtnTarget) this.eraserBtnTarget.classList.remove('bg-indigo-100', 'rounded-full')
      if (this.ctx) this.ctx.globalCompositeOperation = 'source-over'

      if (this.hasTokenLayerTarget) this.tokenLayerTarget.classList.remove('pointer-events-none')
    }
  }

  selectColor(event) {
    const color = event.currentTarget.dataset.color
    this.drawingColor = color
    if (this.ctx) {
      this.ctx.strokeStyle = color
      if (this.isEraser) {
        this.isEraser = false
        if (this.hasEraserBtnTarget) this.eraserBtnTarget.classList.remove('bg-indigo-100', 'rounded-full')
        this.ctx.globalCompositeOperation = 'source-over'
      }
    }
  }

  toggleEraser(event) {
    if (!this.ctx) return
    this.isEraser = !this.isEraser
    const btn = this.eraserBtnTarget
    if (this.isEraser) {
      btn.classList.add('bg-indigo-100', 'rounded-full')
      this.ctx.globalCompositeOperation = 'destination-out'
      this.ctx.lineWidth = 40
    } else {
      btn.classList.remove('bg-indigo-100', 'rounded-full')
      this.ctx.globalCompositeOperation = 'source-over'
      this.ctx.lineWidth = 5
    }
  }

  startDrawing(event) {
    if (!this.isDrawingMode) return
    event.preventDefault()

    this.isPainting = true

    const canvas = this.canvasTarget
    const rect = canvas.getBoundingClientRect()
    const x = this.realToVirtX(event.clientX - rect.left)
    const y = this.realToVirtY(event.clientY - rect.top)

    this.ctx.beginPath()
    this.ctx.moveTo(x, y)

    this.currentStrokeId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    this.currentStrokePoints = [{ x: Math.round(x), y: Math.round(y) }]

    this.ctx.lineTo(x, y)
    this.ctx.stroke()
    this.ctx.beginPath()
    this.ctx.moveTo(x, y)
  }

  draw(event) {
    if (!this.isPainting || !this.isDrawingMode) return
    event.preventDefault()

    const canvas = this.canvasTarget
    const rect = canvas.getBoundingClientRect()
    const x = this.realToVirtX(event.clientX - rect.left)
    const y = this.realToVirtY(event.clientY - rect.top)

    this.ctx.lineTo(x, y)
    this.ctx.stroke()
    this.ctx.beginPath()
    this.ctx.moveTo(x, y)

    if (this.currentStrokePoints) {
      this.currentStrokePoints.push({ x: Math.round(x), y: Math.round(y) })
    }
  }

  stopDrawing(event) {
    if (!this.isPainting) return
    event.preventDefault()

    this.isPainting = false
    this.ctx.beginPath()

    if (this.currentStrokePoints && this.currentStrokePoints.length > 0) {
      this.broadcastStroke(this.currentStrokeId, this.currentStrokePoints, this.drawingColor, this.isEraser, this.ctx.lineWidth)
    }

    this.currentStrokeId = null
    this.currentStrokePoints = null

    // Guardar canvas en BD inmediatamente (sin debounce para evitar pérdida en recarga rápida)
    this.saveCanvasData()
  }

  scheduleSaveCanvas() {
    if (this.canvasSaveTimeout) clearTimeout(this.canvasSaveTimeout)
    this.canvasSaveTimeout = setTimeout(() => this.saveCanvasData(), 1000)
  }

  saveCanvasData() {
    if (!this.ctx || !this.hasCanvasTarget) return
    const dataUrl = this.canvasTarget.toDataURL()

    const tokenMeta = document.querySelector("meta[name='csrf-token']")
    fetch(`/rooms/${this.roomIdValue}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-Token': tokenMeta?.content },
      body: JSON.stringify({ room: { canvas_data: dataUrl } }),
    }).catch((error) => console.error("Error guardando canvas", error))
  }

  // Método síncrono para guardar al recargar/cerrar la página (usando sendBeacon)
  saveCanvasDataSync() {
    if (!this.ctx || !this.hasCanvasTarget) return
    const dataUrl = this.canvasTarget.toDataURL()
    const tokenMeta = document.querySelector("meta[name='csrf-token']")
    if (navigator.sendBeacon) {
      // sendBeacon es POST, necesitamos PATCH... no es posible.
      // Alternativa: usar fetch con keepalive: true
      fetch(`/rooms/${this.roomIdValue}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-Token': tokenMeta?.content },
        body: JSON.stringify({ room: { canvas_data: dataUrl } }),
        keepalive: true
      }).catch(() => {})
    }
  }

  clearCanvas(event) {
    if (event) event.preventDefault()
    if (!confirm("¿Seguro que quieres borrar todo el dibujo? Esta acción no se puede deshacer.")) return

    if (!this.ctx) return
    this.ctx.clearRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT)
    this.scheduleSaveCanvas()

    // Broadcast clear_canvas a todos los usuarios de la sala
    if (this.drawingSubscription) {
      this.drawingSubscription.perform('clear_canvas', {})
    }
  }

  // ==========================================
  // DIBUJO SINCRONIZADO (ACTION CABLE)
  // ==========================================

  broadcastStroke(strokeId, points, color, isEraser, lineWidth) {
    if (!this.drawingSubscription) return
    this.drawingSubscription.perform('draw', {
      stroke_id: strokeId,
      points: points,
      color: color,
      is_eraser: isEraser,
      line_width: lineWidth || 5
    })
  }

  handleDrawingData(data) {
    // Handle character updates
    if (data.action === 'character_update') {
      this.handleCharacterUpdate(data)
      return
    }

    // Handle clear_canvas action
    if (data.action === 'clear_canvas') {
      if (this.ctx) {
        this.ctx.clearRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT)
        this.scheduleSaveCanvas()
      }
      return
    }

    if (!this.isDrawingMode && !this.ctx) {
      this.setupCanvas()
    }
    if (!this.ctx) return

    const canvas = this.canvasTarget
    if (!canvas) return

    const points = data.points
    if (!points || points.length < 1) return

    const prevStroke = this.ctx.strokeStyle
    const prevOp = this.ctx.globalCompositeOperation
    const prevWidth = this.ctx.lineWidth

    if (data.is_eraser) {
      this.ctx.globalCompositeOperation = 'destination-out'
    } else {
      this.ctx.strokeStyle = data.color || '#000000'
      this.ctx.globalCompositeOperation = 'source-over'
    }
    this.ctx.lineWidth = data.line_width || 5
    this.ctx.lineCap = 'round'
    this.ctx.lineJoin = 'round'

    this.ctx.beginPath()
    this.ctx.moveTo(points[0].x, points[0].y)

    for (let i = 1; i < points.length; i++) {
      this.ctx.lineTo(points[i].x, points[i].y)
    }
    this.ctx.stroke()
    this.ctx.beginPath()

    this.ctx.strokeStyle = prevStroke
    this.ctx.globalCompositeOperation = prevOp
    this.ctx.lineWidth = prevWidth

    // Guardar canvas cuando recibimos datos remotos también
    this.scheduleSaveCanvas()
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

    token.classList.add("z-50")

    if (token.firstElementChild) {
      token.firstElementChild.classList.add("ring-4", "ring-indigo-500", "shadow-2xl", "scale-105", "transition-transform")
    }

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

    const virtX = Math.round(this.realToVirtX(left))
    const virtY = Math.round(this.realToVirtY(top))

    this.dragging.style.left = `${left}px`
    this.dragging.style.top = `${top}px`
    this.dragging.dataset.virtX = virtX
    this.dragging.dataset.virtY = virtY
    this.dragging.dataset.roomBoardLastX = virtX
    this.dragging.dataset.roomBoardLastY = virtY
  }

  endDrag(event) {
    if (!this.dragging) return
    event.preventDefault()

    const token = this.dragging
    token.classList.remove("z-50")
    if (token.firstElementChild) token.firstElementChild.classList.remove("ring-4", "ring-indigo-500", "shadow-2xl", "scale-105", "transition-transform")

    const isItem = !!token.dataset.itemId

    if (isItem) {
      token.style.pointerEvents = "none"
      const dropTarget = document.elementFromPoint(event.clientX, event.clientY)
      token.style.pointerEvents = "auto"

      const characterContainer = dropTarget?.closest('[data-character-id]')

      if (characterContainer) {
        const characterId = characterContainer.dataset.characterId
        this.assignItemToCharacter(token.dataset.itemId, characterId)
        this.cleanUpDragEvents()
        return
      }
    }

    const virtX = Number(token.dataset.virtX || 0)
    const virtY = Number(token.dataset.virtY || 0)
    this.savePosition(token, virtX, virtY)
    this.cleanUpDragEvents()
  }

  cleanUpDragEvents() {
    this.dragging = null
    window.removeEventListener("pointermove", this.moveBound)
    window.removeEventListener("pointerup", this.endBound)
    window.removeEventListener("pointercancel", this.endBound)
    this.moveBound = null
    this.endBound = null
  }

  clampTokenPositions(saveToDb = true) {
    if (!this.hasBoardTarget || !this.boardReady) return

    const tokens = this.hasTokenTarget ? this.tokenTargets : Array.from(this.boardTarget.querySelectorAll('[data-room-board-target="token"]'))

    tokens.forEach((token) => {
      const virtSize = parseFloat(token.dataset.virtSize) || 120
      let virtX = parseFloat(token.dataset.virtX) || 0
      let virtY = parseFloat(token.dataset.virtY) || 0
      let changed = false

      if (virtX + virtSize > VIRTUAL_WIDTH) { virtX = Math.max(0, VIRTUAL_WIDTH - virtSize); changed = true }
      if (virtY + virtSize > VIRTUAL_HEIGHT) { virtY = Math.max(0, VIRTUAL_HEIGHT - virtSize); changed = true }
      if (virtX < 0) { virtX = 0; changed = true }
      if (virtY < 0) { virtY = 0; changed = true }

      if (changed) {
        token.dataset.virtX = virtX
        token.dataset.virtY = virtY
        token.style.left = `${this.virtToRealX(virtX)}px`
        token.style.top = `${this.virtToRealY(virtY)}px`

        if (saveToDb) {
          this.savePosition(token, virtX, virtY)
        }
      }
    })
  }

  savePosition(token, x, y) {
    const roomCharacterId = token.dataset.roomBoardRoomCharacterIdValue
    const itemId = token.dataset.itemId
    const tokenMeta = document.querySelector("meta[name='csrf-token']")

    if (roomCharacterId) {
      const url = `/rooms/${this.roomIdValue}/room_characters/${roomCharacterId}`
      fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Accept": "application/json", "X-CSRF-Token": tokenMeta?.content },
        body: JSON.stringify({ room_character: { pos_x: Math.round(x), pos_y: Math.round(y) } }),
      }).catch((error) => console.error("Error guardando posición de personaje", error))

    } else if (itemId) {
      const url = `/rooms/${this.roomIdValue}/items/${itemId}`
      fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Accept": "application/json", "X-CSRF-Token": tokenMeta?.content },
        body: JSON.stringify({ item: { pos_x: Math.round(x), pos_y: Math.round(y) } }),
      }).catch((error) => console.error("Error guardando posición de objeto", error))
    }
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

    const itemId = event.dataTransfer.getData("item_id")
    if (itemId) {
      const boardRect = this.boardTarget.getBoundingClientRect()
      const realLeft = event.clientX - boardRect.left - 30
      const realTop = event.clientY - boardRect.top - 30
      const virtX = Math.round(this.realToVirtX(realLeft))
      const virtY = Math.round(this.realToVirtY(realTop))
      this.dropItemOnBoard(itemId, virtX, virtY)
      return
    }

    const characterId = event.dataTransfer.getData("text/plain")
    if (!characterId) return

    const virtSize = this.tokenSizes[this.currentZoomIndex]
    const half = virtSize / 2

    const boardRect = this.boardTarget.getBoundingClientRect()
    const realLeft = event.clientX - boardRect.left - this.virtToRealSize(half)
    const realTop = event.clientY - boardRect.top - this.virtToRealSize(half)

    const virtX = Math.round(this.realToVirtX(Math.max(0, Math.min(realLeft, boardRect.width - this.virtToRealSize(virtSize)))))
    const virtY = Math.round(this.realToVirtY(Math.max(0, Math.min(realTop, boardRect.height - this.virtToRealSize(virtSize)))))

    this.createRoomCharacter(characterId, virtX, virtY)
  }

  dropActive(event) {
    event.preventDefault()
    event.currentTarget.classList.remove("ring-2", "ring-indigo-500")

    const characterId = event.dataTransfer.getData("text/plain")
    if (!characterId) return

    const virtSize = this.tokenSizes[this.currentZoomIndex]
    const half = virtSize / 2

    const virtX = Math.round(VIRTUAL_WIDTH / 2 - half)
    const virtY = Math.round(VIRTUAL_HEIGHT / 2 - half)

    this.createRoomCharacter(characterId, virtX, virtY)
  }

  // Guarda el canvas síncronamente y espera a que termine antes de recargar
  saveCanvasSync() {
    if (!this.ctx || !this.hasCanvasTarget) return Promise.resolve()
    const dataUrl = this.canvasTarget.toDataURL()
    const tokenMeta = document.querySelector("meta[name='csrf-token']")
    return fetch(`/rooms/${this.roomIdValue}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-Token': tokenMeta?.content },
      body: JSON.stringify({ room: { canvas_data: dataUrl } }),
    }).catch((error) => console.error("Error guardando canvas", error))
  }

  createRoomCharacter(characterId, x, y) {
    const url = `/rooms/${this.roomIdValue}/room_characters`
    const tokenMeta = document.querySelector("meta[name='csrf-token']")

    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json", "X-CSRF-Token": tokenMeta?.content },
      body: JSON.stringify({ room_character: { character_id: parseInt(characterId, 10), pos_x: x, pos_y: y, is_active: true } }),
    }).catch((error) => console.error("Error creando token en la sala", error))
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
      .then((response) => {
        if (response.ok) {
          document.querySelectorAll(`[data-room-board-room-character-id-value="${roomCharacterId}"]`).forEach(e => e.remove())
        } else {
          return Promise.reject(response)
        }
      })
      .catch((error) => console.error("Error eliminando el personaje", error))
  }

  startItemDrag(event) {
    const itemCard = event.currentTarget
    const itemId = itemCard.dataset.itemId
    itemCard.classList.add("opacity-50", "ring-2", "ring-indigo-500")
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("item_id", itemId)
  }

  endItemDrag(event) {
    event.currentTarget.classList.remove("opacity-50", "ring-2", "ring-indigo-500")
  }

  assignItemToCharacter(itemId, characterId) {
    const url = `/rooms/${this.roomIdValue}/items/${itemId}`
    const tokenMeta = document.querySelector("meta[name='csrf-token']")
    fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Accept": "application/json", "X-CSRF-Token": tokenMeta?.content },
      body: JSON.stringify({ item: { character_id: characterId, on_board: false } }),
    }).catch((error) => console.error("Error asignando objeto a personaje", error))
  }

  dropItemOnBoard(itemId, x, y) {
    const url = `/rooms/${this.roomIdValue}/items/${itemId}`
    const tokenMeta = document.querySelector("meta[name='csrf-token']")
    fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Accept": "application/json", "X-CSRF-Token": tokenMeta?.content },
      body: JSON.stringify({ item: { character_id: null, on_board: true, pos_x: Math.round(x), pos_y: Math.round(y) } }),
    }).catch((error) => console.error("Error soltando objeto en el tablero", error))
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
      .then(() => {
        if (pointsLabel) pointsLabel.textContent = nextPoints
        // Actualizar el resumen contraído (summary bar)
        const summaryFate = card.querySelector('summary .inline-flex.h-8.min-w-\\[2rem\\]')
        if (summaryFate) summaryFate.textContent = nextPoints
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
    const action = slots[index] ? 'marcado' : 'liberado'
    const label = type === 'physical' ? 'Estrés físico' : 'Estrés mental'

    this.updateCharacterAttributes(characterId, { [paramKey]: slots }, `${label} de ${this.characterName(card)} ${action}.`)
      .then(() => {
        this.updateStressButtons(buttons, slots)
        // Actualizar el resumen contraído (summary bar)
        this.updateSummaryStress(card, type, slots)
      })
  }

  updateSummaryStress(card, type, slots) {
    // Buscar los spans del resumen en el summary
    const stressClass = type === 'physical' ? 'border-red-600' : 'border-blue-600'
    const summaryStressSpans = card.querySelectorAll(`summary span.rounded-full.h-7.w-7`)
    let typeIndex = 0
    let found = 0

    summaryStressSpans.forEach((span) => {
      if (span.classList.contains('border-red-600') || span.classList.contains('border-red-600/70') || span.classList.contains('border-blue-600') || span.classList.contains('border-blue-600/70')) {
        const currentType = (span.classList.contains('border-red-600') || span.classList.contains('border-red-600/70')) ? 'physical' : 'mental'
        if (currentType === type) {
          const filled = Boolean(slots[found])
          if (filled) {
            span.classList.add(type === 'physical' ? 'bg-red-600' : 'bg-blue-600', type === 'physical' ? 'border-red-600' : 'border-blue-600')
            span.classList.remove(type === 'physical' ? 'border-red-600/70' : 'border-blue-600/70', 'bg-white')
          } else {
            span.classList.add('bg-white', type === 'physical' ? 'border-red-600/70' : 'border-blue-600/70')
            span.classList.remove(type === 'physical' ? 'bg-red-600' : 'bg-blue-600', type === 'physical' ? 'border-red-600' : 'border-blue-600')
          }
          found++
        }
      }
    })
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

  handleCharacterUpdate(data) {
    // Buscar todas las tarjetas de este personaje y actualizar sus valores
    const cards = document.querySelectorAll(`[data-character-id="${data.character_id}"]`)
    cards.forEach((card) => {
      // Actualizar puntos de destino en el summary
      const summaryFate = card.querySelector('summary span.inline-flex.h-8.min-w-\\[2rem\\]')
      if (summaryFate) summaryFate.textContent = data.fate_points

      // Actualizar puntos de destino en el panel expandido
      const expandedFate = card.querySelector('[data-room-board-target="fatePoints"]')
      if (expandedFate) expandedFate.textContent = data.fate_points

      // Actualizar estreses en el summary
      if (data.physical_stress !== undefined) {
        const physSpans = card.querySelectorAll('summary span.rounded-full.h-7.w-7.shrink-0')
        let physIndex = 0
        physSpans.forEach((span) => {
          if ((span.classList.contains('border-red-600') || span.classList.contains('border-red-600/70') || span.classList.contains('bg-red-600'))) {
            const slotFilled = (data.physical_stress & (1 << physIndex)) > 0
            if (slotFilled) {
              span.classList.add('bg-red-600', 'border-red-600')
              span.classList.remove('border-red-600/70', 'bg-white')
            } else {
              span.classList.add('bg-white', 'border-red-600/70')
              span.classList.remove('bg-red-600', 'border-red-600')
            }
            physIndex++
          }
        })
      }

      if (data.mental_stress !== undefined) {
        const mentSpans = card.querySelectorAll('summary span.rounded-full.h-7.w-7.shrink-0')
        let mentIndex = 0
        mentSpans.forEach((span) => {
          if ((span.classList.contains('border-blue-600') || span.classList.contains('border-blue-600/70') || span.classList.contains('bg-blue-600'))) {
            const slotFilled = (data.mental_stress & (1 << mentIndex)) > 0
            if (slotFilled) {
              span.classList.add('bg-blue-600', 'border-blue-600')
              span.classList.remove('border-blue-600/70', 'bg-white')
            } else {
              span.classList.add('bg-white', 'border-blue-600/70')
              span.classList.remove('bg-blue-600', 'border-blue-600')
            }
            mentIndex++
          }
        })
      }

      // Actualizar botones de estrés en el panel expandido
      const allStressButtons = card.querySelectorAll('button[data-stress-type]')
      allStressButtons.forEach((btn) => {
        const type = btn.dataset.stressType
        const index = parseInt(btn.dataset.stressIndex)
        const stressValue = type === 'physical' ? data.physical_stress : data.mental_stress
        const filled = (stressValue & (1 << index)) > 0
        btn.dataset.filled = filled
        btn.setAttribute('aria-pressed', filled)
        if (type === 'physical') {
          btn.className = `h-8 w-8 rounded-full border-2 transition-colors duration-150 focus:outline-none focus:ring-0 cursor-pointer ${filled ? 'border-red-600 bg-red-600' : 'border-red-600/70 bg-white'}`
        } else {
          btn.className = `h-8 w-8 rounded-full border-2 transition-colors duration-150 focus:outline-none focus:ring-0 cursor-pointer ${filled ? 'border-blue-600 bg-blue-600' : 'border-blue-600/70 bg-white'}`
        }
      })
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

    const userName = event.currentTarget.dataset.userName || "Un jugador"

    const values = [-1, 0, 1]
    const roll = Array.from({ length: 4 }, () => values[Math.floor(Math.random() * values.length)])
    const sum = roll.reduce((a, b) => a + b, 0)

    const symbols = roll.map(v => v === 1 ? "+" : (v === -1 ? "-" : "0")).join(" ")
    const resultText = sum > 0 ? `+${sum}` : sum.toString()

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
        if (this.hasGameLogListTarget) {
          this.gameLogListTarget.innerHTML = ""
        }
      } else {
        console.error("Error del servidor al intentar borrar:", response.status)
        alert("Hubo un problema al borrar el log. Mira la consola (F12).")
      }
    })
    .catch((error) => console.error("Error de red limpiando el log", error))
  }
}