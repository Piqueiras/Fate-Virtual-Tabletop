import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["notesPanel", "gameLogPanel", "tabNotes", "tabLog", "notesList", "newNoteBtn"]
  static values = { roomId: Number }

  connect() {
    this.roomId = this.roomIdValue
    this.currentEditorId = null
    this.editIsNew = false
    this.drawingBlob = null      // blob del canvas actual (null = sin cambios)
    this.drawingLoadedUrl = null  // URL del dibujo existente (para cargarlo en canvas)

    this.ctx = null
    this.isPainting = false
    this.drawColor = "#1e293b"
    this.eraserActive = false
    this.drawHistory = []
  }

  disconnect() {
    if (this.currentEditorId && !this.editIsNew) {
      const url = `/rooms/${this.roomId}/notes/${this.currentEditorId}/unlock`
      if (navigator.sendBeacon) {
        const formData = new FormData()
        formData.append("_method", "patch")
        navigator.sendBeacon(url, formData)
      } else {
        fetch(url, {
          method: "PATCH",
          headers: { "X-CSRF-Token": this.csrfToken(), "Accept": "application/json" },
          keepalive: true
        })
      }
    }
  }

  beforeUnlock() { this.disconnect() }

  // ═══════════════════════════════════
  // Tabs
  // ═══════════════════════════════════

  switchToNotes() {
    this.gameLogPanelTarget.classList.add("hidden")
    this.notesPanelTarget.classList.remove("hidden")
    this.tabNotesTarget.classList.add("bg-indigo-600", "text-white")
    this.tabNotesTarget.classList.remove("bg-slate-100", "text-slate-600")
    this.tabLogTarget.classList.add("bg-slate-100", "text-slate-600")
    this.tabLogTarget.classList.remove("bg-indigo-600", "text-white")
  }

  switchToLog() {
    this.notesPanelTarget.classList.add("hidden")
    this.gameLogPanelTarget.classList.remove("hidden")
    this.tabLogTarget.classList.add("bg-indigo-600", "text-white")
    this.tabLogTarget.classList.remove("bg-slate-100", "text-slate-600")
    this.tabNotesTarget.classList.add("bg-slate-100", "text-slate-600")
    this.tabNotesTarget.classList.remove("bg-indigo-600", "text-white")
  }

  // ═══════════════════════════════════
  // Crear nota nueva
  // ═══════════════════════════════════

  newNote() {
    this.removeAnyExistingEditor()
    this.editIsNew = true
    this.currentEditorId = null
    this.drawingBlob = null
    this.drawingLoadedUrl = null

    const html = this.buildEditorHtml("new", "", "", false, null)
    this.notesListTarget.insertAdjacentHTML("afterbegin", html)
    this.setupDrawingCanvas("new")
  }

  removeAnyExistingEditor() {
    this.notesListTarget.querySelectorAll("[id^='note_editor_']").forEach(el => el.remove())
  }

  // ═══════════════════════════════════
  // Editar nota existente
  // ═══════════════════════════════════

  editNote(event) {
    const btn = event.currentTarget
    const noteId = btn.dataset.noteId
    const noteCard = document.getElementById(`note_${noteId}`)
    if (!noteCard) return

    const title = noteCard.querySelector("h4")?.textContent?.trim() || ""
    const publicSpan = noteCard.querySelector("[class*='emerald-100'], [class*='violet-100']")
    const isPublic = publicSpan ? !publicSpan.textContent.includes("Privada") : false
    const content = noteCard.dataset.noteContent || ""
    const isOwner = !!noteCard.querySelector("[data-action='click->notes#togglePublic']")
    // URL del dibujo si existe
    const drawImg = noteCard.querySelector("[data-drawing-signed-id]")
    this.drawingLoadedUrl = drawImg ? drawImg.src : null

    noteCard.insertAdjacentHTML("beforebegin", this.buildEditorHtml(noteId, title, content, isPublic, isOwner, this.drawingLoadedUrl))
    noteCard.classList.add("hidden")

    this.acquireLock(noteId).then(success => {
      if (!success) {
        this.removeAnyExistingEditor()
        noteCard.classList.remove("hidden")
        return
      }
      this.editIsNew = false
      this.currentEditorId = noteId
      this.setupDrawingCanvas(noteId)
    })
  }

  async acquireLock(noteId) {
    const url = `/rooms/${this.roomId}/notes/${noteId}/lock`
    try {
      const resp = await fetch(url, {
        method: "PATCH",
        headers: { "X-CSRF-Token": this.csrfToken(), "Accept": "application/json" }
      })
      if (!resp.ok) {
        const data = await resp.json()
        alert(data.error || "No se pudo bloquear la nota para edicion.")
        return false
      }
      return true
    } catch (err) { return false }
  }

  // ═══════════════════════════════════
  // Guardar nota
  // ═══════════════════════════════════

  saveNote(event) {
    const btn = event.currentTarget
    const isNew = this.editIsNew
    const suffix = isNew ? "new" : this.currentEditorId

    const titleEl = document.getElementById(`note_title_${suffix}`)
    const contentEl = document.getElementById(`note_content_${suffix}`)
    const publicEl = document.getElementById(`note_public_${suffix}`)
    const title = titleEl?.value?.trim()
    const content = contentEl?.value?.trim()

    if (!title || !content) {
      alert("El titulo y el contenido son obligatorios.")
      return
    }

    // Si el canvas tiene cambios con contenido, subir blob. Si se borró, eliminar dibujo anterior.
    if (this.drawingBlob) {
      btn.disabled = true; btn.textContent = "Guardando..."
      const canvas = document.getElementById(`drawing_canvas_${suffix}`)
      canvas.toBlob(blob => {
        this.uploadNoteWithDrawing(isNew, suffix, title, content, publicEl, blob, btn)
      }, "image/png")
    } else if (!isNew && this.drawingLoadedUrl) {
      // Había dibujo pero se borró → eliminar del servidor
      btn.disabled = true; btn.textContent = "Guardando..."
      this.removeDrawingAndSave(suffix, title, content, publicEl, btn)
    } else {
      this.sendNoteSave(isNew, suffix, title, content, publicEl, null, btn)
    }
  }

  uploadNoteWithDrawing(isNew, suffix, title, content, publicEl, blob, btn) {
    // Subir blob primero
    const fd = new FormData()
    fd.append("drawing", blob, "dibujo_nota.png")
    // Para notas nuevas: crear primero, luego adjuntar. Para existentes: adjuntar directamente.
    if (isNew) {
      this.createNoteAndAttach(title, content, publicEl, fd, btn)
    } else {
      this.attachAndUpdate(this.currentEditorId, title, content, publicEl, fd, btn)
    }
  }

  createNoteAndAttach(title, content, publicEl, drawingFd, btn) {
    const body = new FormData()
    body.append("note[title]", title)
    body.append("note[content]", content)
    body.append("note[public]", publicEl?.checked || false)

    fetch(`/rooms/${this.roomId}/notes`, {
      method: "POST",
      headers: { "X-CSRF-Token": this.csrfToken(), "Accept": "application/json" },
      body: body
    }).then(r => r.json()).then(data => {
      this.editIsNew = false
      this.currentEditorId = data.id
      // Adjuntar dibujo a la nota recién creada
      fetch(`/rooms/${this.roomId}/notes/${data.id}/attach_drawing`, {
        method: "POST",
        headers: { "X-CSRF-Token": this.csrfToken(), "Accept": "application/json" },
        body: drawingFd
      }).then(() => {
        // Actualizar la nota con el contenido final
        this.sendNoteSave(false, String(data.id), title, content, publicEl, null, btn)
      })
    }).catch(err => {
      alert("Error al crear la nota")
      btn.disabled = false; btn.textContent = "Crear Nota"
    })
  }

  attachAndUpdate(noteId, title, content, publicEl, drawingFd, btn) {
    // Eliminar dibujo anterior si existe
    const drawingData = this.drawingLoadedUrl ? { _remove_drawing: true } : {}
    fetch(`/rooms/${this.roomId}/notes/${noteId}/attach_drawing`, {
      method: "POST",
      headers: { "X-CSRF-Token": this.csrfToken(), "Accept": "application/json" },
      body: drawingFd
    }).then(() => {
      this.sendNoteSave(false, noteId, title, content, publicEl, null, btn)
    }).catch(err => {
      alert("Error al guardar el dibujo")
      btn.disabled = false; btn.textContent = "Guardar Cambios"
    })
  }

  removeDrawingAndSave(suffix, title, content, publicEl, btn) {
    const noteId = this.currentEditorId
    fetch(`/rooms/${this.roomId}/notes/${noteId}/remove_drawing`, {
      method: "DELETE",
      headers: { "X-CSRF-Token": this.csrfToken(), "Accept": "application/json" }
    }).then(() => {
      this.sendNoteSave(false, noteId, title, content, publicEl, null, btn)
    }).catch(err => {
      console.error("Error removing drawing:", err)
      this.sendNoteSave(false, noteId, title, content, publicEl, null, btn)
    })
  }

  sendNoteSave(isNew, suffix, title, content, publicEl, blob, btn) {
    const noteId = this.editIsNew ? null : this.currentEditorId
    const url = isNew ? `/rooms/${this.roomId}/notes` : `/rooms/${this.roomId}/notes/${noteId}`
    const body = new FormData()
    if (!isNew) body.append("_method", "patch")
    body.append("note[title]", title)
    body.append("note[content]", content)
    body.append("note[public]", publicEl?.checked || false)

    btn.disabled = true; btn.textContent = "Guardando..."

    fetch(url, {
      method: "POST",
      headers: { "X-CSRF-Token": this.csrfToken(), "Accept": "application/json" },
      body: body
    }).then(resp => {
      if (!resp.ok) return resp.json().then(d => { throw new Error(d.errors?.join(", ") || "Error") })
      return resp.json()
    }).then(() => this.cancelEdit())
      .catch(err => {
        alert(err.message)
        btn.disabled = false
        btn.textContent = isNew ? "Crear Nota" : "Guardar Cambios"
      })
  }

  // ═══════════════════════════════════
  // Cancelar
  // ═══════════════════════════════════

  cancelEdit() {
    if (this.currentEditorId && !this.editIsNew) this.releaseLock(this.currentEditorId)
    this.removeAnyExistingEditor()
    this.currentEditorId = null; this.editIsNew = false
    this.ctx = null; this.drawingBlob = null
    this.drawingLoadedUrl = null; this.drawHistory = []
  }

  async releaseLock(noteId) {
    try { await fetch(`/rooms/${this.roomId}/notes/${noteId}/unlock`, { method: "PATCH", headers: { "X-CSRF-Token": this.csrfToken(), "Accept": "application/json" }, keepalive: true }) } catch (e) {}
  }

  // ═══════════════════════════════════
  // Eliminar
  // ═══════════════════════════════════

  deleteNote(event) {
    const noteId = event.currentTarget.dataset.noteId
    if (!confirm("Eliminar esta nota permanentemente?")) return
    fetch(`/rooms/${this.roomId}/notes/${noteId}`, {
      method: "DELETE",
      headers: { "X-CSRF-Token": this.csrfToken(), "Accept": "application/json" }
    })
  }

  // ═══════════════════════════════════
  // Toggle público
  // ═══════════════════════════════════

  togglePublic(event) {
    const btn = event.currentTarget
    const currentPublic = btn.dataset.currentPublic === "true"
    fetch(`/rooms/${this.roomId}/notes/${btn.dataset.noteId}`, {
      method: "PATCH",
      headers: { "X-CSRF-Token": this.csrfToken(), "Accept": "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ note: { public: !currentPublic } })
    })
  }

  // ═══════════════════════════════════
  // Force unlock (DM)
  // ═══════════════════════════════════

  forceUnlock(event) {
    fetch(`/rooms/${this.roomId}/notes/${event.currentTarget.dataset.noteId}/force_unlock`, {
      method: "PATCH",
      headers: { "X-CSRF-Token": this.csrfToken(), "Accept": "application/json" }
    })
  }

  // ═══════════════════════════════════
  // Canvas (1 dibujo, siempre visible)
  // ═══════════════════════════════════

  setupDrawingCanvas(suffix) {
    const canvas = document.getElementById(`drawing_canvas_${suffix}`)
    if (!canvas) return
    setTimeout(() => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      this.ctx = canvas.getContext("2d")
      this.ctx.fillStyle = "#ffffff"
      this.ctx.fillRect(0, 0, canvas.width, canvas.height)
      this.ctx.lineWidth = 3
      this.ctx.lineCap = "round"
      this.ctx.strokeStyle = this.drawColor

      if (this.drawingLoadedUrl) {
        const img = new Image()
        img.onload = () => {
          this.ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          this.saveCanvasSnapshot()
        }
        img.src = this.drawingLoadedUrl
      } else {
        this.saveCanvasSnapshot()
      }
    }, 50)
  }

  saveCanvasSnapshot() {
    if (!this.ctx) return
    const dataUrl = this.ctx.canvas.toDataURL("image/png")
    this.drawHistory.push(dataUrl)
    if (this.drawHistory.length > 30) this.drawHistory.shift()
  }

  selectDrawColor(event) {
    this.drawColor = event.currentTarget.dataset.color
    this.eraserActive = false
    if (this.ctx) {
      this.ctx.strokeStyle = this.drawColor
      this.ctx.globalCompositeOperation = "source-over"
      this.ctx.lineWidth = 3
    }
    this.updateColorPaletteUI()
  }

  toggleEraserNote() {
    this.eraserActive = !this.eraserActive
    if (!this.ctx) return
    if (this.eraserActive) {
      this.ctx.globalCompositeOperation = "destination-out"
      this.ctx.lineWidth = 20
    } else {
      this.ctx.globalCompositeOperation = "source-over"
      this.ctx.lineWidth = 3
      this.ctx.strokeStyle = this.drawColor
    }
    this.updateColorPaletteUI()
  }

  undoDrawing() {
    if (!this.ctx || this.drawHistory.length < 2) return
    this.drawHistory.pop()
    const prev = this.drawHistory[this.drawHistory.length - 1]
    const img = new Image()
    img.onload = () => {
      this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height)
      this.ctx.drawImage(img, 0, 0)
    }
    img.src = prev
  }

  updateColorPaletteUI() {
    const suffix = this.editIsNew ? "new" : this.currentEditorId
    const palette = document.getElementById(`drawing_color_palette_${suffix}`)
    if (!palette) return
    palette.querySelectorAll("[data-color]").forEach(btn => {
      if (btn.dataset.color === this.drawColor && !this.eraserActive) {
        btn.classList.add("ring-2", "ring-slate-900")
      } else {
        btn.classList.remove("ring-2", "ring-slate-900")
      }
    })
    const eraserBtn = document.getElementById(`eraser_btn_${suffix}`)
    if (eraserBtn) {
      if (this.eraserActive) eraserBtn.classList.add("bg-amber-200")
      else eraserBtn.classList.remove("bg-amber-200")
    }
  }

  startDrawingNote(e) {
    this.isPainting = true
    this.drawNote(e)
  }

  drawNote(e) {
    if (!this.isPainting || !this.ctx) return
    e.preventDefault()
    const target = e.target
    const rect = target.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    this.ctx.lineTo(x, y)
    this.ctx.stroke()
    this.ctx.beginPath()
    this.ctx.moveTo(x, y)
  }

  stopDrawingNote() {
    if (this.isPainting && this.ctx) {
      this.saveCanvasSnapshot()
      this.setDrawingBlob()
    }
    this.isPainting = false
    if (this.ctx) this.ctx.beginPath()
  }

  clearDrawingCanvas() {
    if (!this.ctx) return
    const canvas = this.ctx.canvas
    this.ctx.clearRect(0, 0, canvas.width, canvas.height)
    this.ctx.fillStyle = "#ffffff"
    this.ctx.fillRect(0, 0, canvas.width, canvas.height)
    this.saveCanvasSnapshot()
    this.drawingBlob = null  // lienzo en blanco = sin dibujo
  }

  setDrawingBlob() {
    if (!this.ctx) { this.drawingBlob = null; return }
    const canvas = this.ctx.canvas
    canvas.toBlob(blob => {
      // Verificar si el blob es efectivamente un lienzo blanco
      this.isBlobBlank(blob).then(blank => {
        this.drawingBlob = blank ? null : blob
      })
    }, "image/png")
  }

  async isBlobBlank(blob) {
    return new Promise(resolve => {
      const img = new Image()
      img.onload = () => {
        const tmp = document.createElement("canvas")
        tmp.width = img.width; tmp.height = img.height
        const tctx = tmp.getContext("2d")
        tctx.drawImage(img, 0, 0)
        const data = tctx.getImageData(0, 0, tmp.width, tmp.height).data
        // Verificar si todos los píxeles son blancos (255,255,255,255)
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] !== 255 || data[i+1] !== 255 || data[i+2] !== 255) {
            resolve(false); return
          }
        }
        resolve(true)
      }
      img.src = URL.createObjectURL(blob)
    })
  }

  // ═══════════════════════════════════
  // Helpers
  // ═══════════════════════════════════

  buildEditorHtml(suffix, title, content, isPublic, isOwner, drawingUrl) {
    const esc = this.escapeHtml
    const checked = isPublic ? "checked" : ""
    const btnLabel = suffix === "new" ? "Crear Nota" : "Guardar Cambios"

    const visibilityHtml = isOwner
      ? `<div class="flex items-center gap-3 mb-3">
           <label class="flex items-center gap-2 cursor-pointer">
             <input type="checkbox" name="note[public]" id="note_public_${suffix}" ${checked}
                    class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500">
             <span class="text-xs text-slate-600">Nota publica (visible para todos)</span>
           </label>
         </div>`
      : ""

    const colorPalette = `
      <div id="drawing_color_palette_${suffix}" class="flex items-center gap-1 mb-2">
        <button type="button" data-action="click->notes#selectDrawColor" data-color="#1e293b" class="h-5 w-5 rounded-full border border-slate-300 cursor-pointer" style="background:#1e293b" title="Negro"></button>
        <button type="button" data-action="click->notes#selectDrawColor" data-color="#ef4444" class="h-5 w-5 rounded-full border border-slate-300 cursor-pointer" style="background:#ef4444" title="Rojo"></button>
        <button type="button" data-action="click->notes#selectDrawColor" data-color="#3b82f6" class="h-5 w-5 rounded-full border border-slate-300 cursor-pointer" style="background:#3b82f6" title="Azul"></button>
        <button type="button" data-action="click->notes#selectDrawColor" data-color="#22c55e" class="h-5 w-5 rounded-full border border-slate-300 cursor-pointer" style="background:#22c55e" title="Verde"></button>
        <button type="button" data-action="click->notes#selectDrawColor" data-color="#f97316" class="h-5 w-5 rounded-full border border-slate-300 cursor-pointer" style="background:#f97316" title="Naranja"></button>
        <div class="w-px h-4 bg-slate-300 mx-1"></div>
        <button type="button" id="eraser_btn_${suffix}" data-action="click->notes#toggleEraserNote" class="h-6 px-2 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition cursor-pointer" title="Goma">🧹</button>
        <button type="button" id="undo_btn_${suffix}" data-action="click->notes#undoDrawing" class="h-6 px-2 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition cursor-pointer" title="Deshacer">↩</button>
      </div>`

    return `<div id="note_editor_${suffix}" class="rounded-2xl border-2 border-indigo-300 bg-white p-4 shadow-md mb-3">
      <div class="mb-3">
        <label class="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Titulo</label>
        <input type="text" name="note[title]" id="note_title_${suffix}" value="${esc(title)}"
               class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-sm outline-none">
      </div>
      <div class="mb-3">
        <div class="flex items-center justify-between mb-1">
          <label class="text-xs font-bold text-slate-500 uppercase tracking-wider">Contenido (Markdown)</label>
          <button type="button" data-action="click->notes#insertImageRef"
                  class="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-2 py-1 rounded-lg transition">🖼️ Imagen</button>
        </div>
        <textarea name="note[content]" id="note_content_${suffix}" rows="6"
                  class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-sm outline-none resize-y font-mono">${esc(content)}</textarea>
      </div>
      <div class="mb-3">
        <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">Dibujo</span>
        ${colorPalette}
        <div class="relative w-full aspect-video bg-white border-2 border-amber-200 rounded-xl overflow-hidden touch-none cursor-crosshair">
          <canvas id="drawing_canvas_${suffix}"
                  data-action="pointerdown->notes#startDrawingNote pointermove->notes#drawNote pointerup->notes#stopDrawingNote pointerout->notes#stopDrawingNote"
                  class="w-full h-full relative z-10"></canvas>
        </div>
        <div class="flex items-center gap-2 mt-2">
          <button type="button" data-action="click->notes#clearDrawingCanvas"
                  class="text-[10px] font-semibold text-slate-500 hover:text-slate-700 bg-slate-100 px-2 py-1 rounded-lg transition">🗑️ Limpiar</button>
        </div>
      </div>
      ${visibilityHtml}
      <div class="flex items-center gap-2 pt-2 border-t border-slate-100">
        <button type="button" data-action="click->notes#cancelEdit" data-note-id="${suffix}"
                class="flex-1 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors">Cancelar</button>
        <button type="button" data-action="click->notes#saveNote"
                class="flex-1 py-2 rounded-xl bg-indigo-600 text-sm font-bold text-white hover:bg-indigo-700 shadow-md transition-colors active:scale-95">${btnLabel}</button>
      </div>
    </div>`
  }

  // ═══════════════════════════════════
  // Insertar imagen en markdown
  // ═══════════════════════════════════

  insertImageRef() {
    const input = document.createElement("input")
    input.type = "file"; input.accept = "image/*"
    input.onchange = (e) => {
      const file = e.target.files[0]; if (!file) return
      const suffix = this.editIsNew ? "new" : this.currentEditorId
      const contentEl = document.getElementById(`note_content_${suffix}`)
      if (!contentEl) return
      const fd = new FormData(); fd.append("image", file)

      if (this.editIsNew) {
        const title = document.getElementById("note_title_new")?.value?.trim() || "Nueva nota"
        const body = new FormData()
        body.append("note[title]", title); body.append("note[content]", " "); body.append("note[public]", false)
        fetch(`/rooms/${this.roomId}/notes`, {
          method: "POST",
          headers: { "X-CSRF-Token": this.csrfToken(), "Accept": "application/json" },
          body: body
        }).then(r => r.json()).then(data => {
          this.editIsNew = false; this.currentEditorId = data.id
          this.renameEditorIds(data.id)
          this.uploadImageToMarkdown(data.id, fd, document.getElementById(`note_content_${data.id}`))
        })
      } else {
        this.uploadImageToMarkdown(this.currentEditorId, fd, contentEl)
      }
    }
    input.click()
  }

  uploadImageToMarkdown(noteId, formData, contentEl) {
    fetch(`/rooms/${this.roomId}/notes/${noteId}/attach_image`, {
      method: "POST",
      headers: { "X-CSRF-Token": this.csrfToken(), "Accept": "application/json" },
      body: formData
    }).then(r => r.json()).then(() => {
      return fetch(`/rooms/${this.roomId}/notes/${noteId}/last_attachment_signed_id`, {
        headers: { "X-CSRF-Token": this.csrfToken(), "Accept": "application/json" }
      })
    }).then(r => r.json()).then(data => {
      if (data.signed_id && contentEl) {
        const token = `[image:${data.signed_id}]`
        contentEl.value = contentEl.value.trim() + "\n\n" + token + "\n"
      }
    }).catch(err => console.error("Error uploading image:", err))
  }

  csrfToken() { return document.querySelector("meta[name='csrf-token']")?.content || "" }

  escapeHtml(str) {
    if (!str) return ""
    const div = document.createElement("div")
    div.appendChild(document.createTextNode(str))
    return div.innerHTML
  }
}