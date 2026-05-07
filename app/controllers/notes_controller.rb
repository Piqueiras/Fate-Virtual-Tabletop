class NotesController < ApplicationController
  before_action :set_room
  before_action :set_note, only: %i[update destroy lock unlock force_unlock attach_drawing attach_image remove_drawing last_attachment_signed_id]
  before_action :authorize_note!, only: %i[update destroy lock unlock]
  before_action :check_dm!, only: :force_unlock

  def create
    @note = @room.notes.new(note_params)
    @note.user = current_user
    if @note.save
      render json: { id: @note.id, title: @note.title, public: @note.public }, status: :created
    else
      render json: { errors: @note.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def update
    updatable = note_params.to_h
    updatable.delete("public") unless @note.user == current_user
    if @note.update(updatable)
      render json: { id: @note.id, status: "updated" }, status: :ok
    else
      render json: { errors: @note.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def destroy
    @note.destroy!
    head :no_content
  end

  # ─── Locking ─────────────────────────
  def lock
    if @note.locked? && !@note.locked_by?(current_user)
      render json: { error: "Nota bloqueada por #{@note.locked_by_user.username}" }, status: :conflict
    elsif @note.acquire_lock!(current_user)
      render json: { locked: true, locked_by: current_user.username }, status: :ok
    else
      render json: { error: "No se pudo bloquear la nota" }, status: :unprocessable_entity
    end
  end

  def unlock
    if @note.locked_by?(current_user) || @room.dm == current_user
      @note.release_lock!
      render json: { locked: false }, status: :ok
    else
      render json: { error: "No puedes desbloquear esta nota" }, status: :forbidden
    end
  end

  def force_unlock
    @note.force_unlock!
    render json: { locked: false, forced: true }, status: :ok
  end

  # ─── Dibujo (canvas) ──────────────────
  def attach_drawing
    return render json: { error: "Sin imagen" }, status: :unprocessable_entity unless params[:drawing].present?
    @note.drawing.attach(params[:drawing])
    render json: { status: "ok" }, status: :created
  end

  def remove_drawing
    @note.drawing.purge
    head :no_content
  end

  # ─── Imágenes (markdown) ─────────────
  def attach_image
    return render json: { error: "Sin imagen" }, status: :unprocessable_entity unless params[:image].present?
    @note.images.attach(params[:image])
    render json: { status: "ok" }, status: :created
  end

  def last_attachment_signed_id
    attachment = @note.images.last
    if attachment
      render json: { signed_id: attachment.signed_id }
    else
      render json: { signed_id: nil }, status: :not_found
    end
  end

  private

  def set_room
    @room = Room.find(params[:room_id])
  end

  def set_note
    @note = @room.notes.find(params[:id])
  end

  def authorize_note!
    return if @note.user == current_user || @room.dm == current_user || @note.public?
    render json: { error: "No autorizado" }, status: :forbidden
  end

  def check_dm!
    return if @room.dm == current_user
    render json: { error: "Solo el DM puede forzar desbloqueo" }, status: :forbidden
  end

  def note_params
    params.require(:note).permit(:title, :content, :public)
  end
end