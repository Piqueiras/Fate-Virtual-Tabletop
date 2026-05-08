class CombatsController < ApplicationController
  before_action :authenticate_user!
  before_action :set_room
  before_action :ensure_dm!, except: [:show]
  before_action :set_combat, only: %i[show update destroy next_turn]

  # GET /rooms/:room_id/combats/:id
  def show
    render json: @combat.serialized
  end

  # POST /rooms/:room_id/combats
  def create
    @room.combats.update_all(active: false)
    @combat = @room.combats.new(active: true, current_batch_index: 0)

    if @combat.save
      if params[:combat][:combat_batches].present?
        @combat.build_batches_from_params(params[:combat][:combat_batches])
      end

      broadcast_combat_change
      render json: @combat.serialized, status: :created
    else
      render json: { errors: @combat.errors.full_messages }, status: :unprocessable_entity
    end
  end

  # PATCH /rooms/:room_id/combats/:id
  def update
    if params[:combat][:combat_batches].present?
      @combat.build_batches_from_params(params[:combat][:combat_batches])
      broadcast_combat_change
      render json: @combat.serialized
    else
      render json: { errors: ["No se proporcionaron lotes"] }, status: :unprocessable_entity
    end
  end

  # DELETE /rooms/:room_id/combats/:id
  def destroy
    @combat.update!(active: false)
    broadcast_combat_change
    render json: { message: "Combate terminado" }
  end

  # POST /rooms/:room_id/combats/:id/next_turn
  def next_turn
    @combat.next_turn!
    broadcast_combat_change
    render json: { current_batch_index: @combat.current_batch_index, combat: @combat.serialized }
  end

  private

  def set_room
    @room = Room.find(params[:room_id])
  end

  def set_combat
    @combat = @room.combats.find(params[:id])
  end

  def ensure_dm!
    unless @room.dm == current_user
      render json: { error: "Solo el DM puede gestionar el combate" }, status: :forbidden
    end
  end

  # Broadcast via ActionCable al canal de la sala para que TODOS los clientes actualicen su UI
  def broadcast_combat_change
    combat = @room.active_combat
    payload = combat&.serialized || { active: false, room_id: @room.id }

    ActionCable.server.broadcast(
      "drawing_room_#{@room.id}",
      {
        action: "combat_update",
        combat: payload
      }
    )
  end
end