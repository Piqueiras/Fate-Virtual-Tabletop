import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["modal", "canvas", "preview", "nameInput", "descInput", "submitBtn"]
  static values = { roomId: Number }

  connect() {
    this.ctx = null
    this.isPainting = false
    this.fileUploaded = null
  }

  open(event) {
    if (event) event.preventDefault()
    this.modalTarget.classList.remove('hidden')
    
    // Necesitamos un pequeñísimo retraso para que el navegador dibuje el modal 
    // antes de calcular las dimensiones exactas del canvas
    setTimeout(() => this.setupCanvas(), 50)
  }

  close(event) {
    if (event) event.preventDefault()
    this.modalTarget.classList.add('hidden')
    this.reset()
  }

  reset() {
    this.nameInputTarget.value = ''
    this.descInputTarget.value = ''
    this.fileUploaded = null
    this.previewTarget.classList.add('hidden')
    this.previewTarget.src = ''
    if (this.ctx) {
      this.ctx.fillStyle = "#ffffff"
      this.ctx.fillRect(0, 0, this.canvasTarget.width, this.canvasTarget.height)
    }
  }

  setupCanvas() {
    const canvas = this.canvasTarget
    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight
    this.ctx = canvas.getContext('2d')
    
    // Rellenamos de blanco para que no tenga fondo transparente al convertirlo a PNG
    this.ctx.fillStyle = "#ffffff"
    this.ctx.fillRect(0, 0, canvas.width, canvas.height)
    
    // Estilo del pincel
    this.ctx.lineWidth = 4
    this.ctx.lineCap = 'round'
    this.ctx.strokeStyle = '#1e293b' // Slate 800
  }

  startDrawing(e) {
    if (this.fileUploaded) return // Si subió foto, bloqueamos dibujo
    this.isPainting = true
    this.draw(e)
  }

  draw(e) {
    if (!this.isPainting || this.fileUploaded) return
    e.preventDefault()

    const rect = this.canvasTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    this.ctx.lineTo(x, y)
    this.ctx.stroke()
    this.ctx.beginPath()
    this.ctx.moveTo(x, y)
  }

  stopDrawing() {
    this.isPainting = false
    if (this.ctx) this.ctx.beginPath()
  }

  handleFileUpload(e) {
    const file = e.target.files[0]
    if (!file) return

    this.fileUploaded = file
    const url = URL.createObjectURL(file)
    this.previewTarget.src = url
    this.previewTarget.classList.remove('hidden')
  }

  submit(e) {
    const name = this.nameInputTarget.value.trim() || "Objeto Misterioso"
    const desc = this.descInputTarget.value.trim()
    const btn = this.submitBtnTarget
    btn.disabled = true
    btn.textContent = "Creando..."

    const formData = new FormData()
    formData.append('item[name]', name)
    formData.append('item[description]', desc)

    if (this.fileUploaded) {
      // Si subió foto, enviamos el archivo
      formData.append('item[image]', this.fileUploaded)
      this.sendToServer(formData)
    } else {
      // Si no, convertimos el Canvas a PNG y lo enviamos
      this.canvasTarget.toBlob((blob) => {
        formData.append('item[image]', blob, 'dibujo_objeto.png')
        this.sendToServer(formData)
      }, 'image/png')
    }
  }

  sendToServer(formData) {
    const url = `/rooms/${this.roomIdValue}/items`
    const tokenMeta = document.querySelector("meta[name='csrf-token']")

    fetch(url, {
      method: 'POST',
      headers: { 'X-CSRF-Token': tokenMeta?.content, 'Accept': 'application/json' },
      body: formData,
    })
    .then(response => response.ok ? response.json() : Promise.reject(response))
    .then(() => {
      // Recargamos la página para ver el objeto en el tablero y el mensaje en el chat
      window.location.reload() 
    })
    .catch(error => {
      console.error('Error creando objeto', error)
      alert("Hubo un problema al crear el objeto.")
      this.submitBtnTarget.disabled = false
      this.submitBtnTarget.textContent = "Crear Objeto"
    })
  }
}