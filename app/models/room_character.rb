class RoomCharacter < ApplicationRecord
  belongs_to :room
  belongs_to :character
  has_many :combat_batch_room_characters, dependent: :destroy

  validates :character_id, uniqueness: { scope: :room_id }

  # Cuando se añade al tablero, lo dibuja a los demás
  after_create_commit -> {
    broadcast_append_to room, target: "board_tokens", partial: "rooms/board_token", locals: { room_character: self }
    broadcast_active_list_update
  }

  # NUEVO: Cuando se le cambian las coordenadas (x, y), se actualiza en las pantallas de los demás
  after_update_commit -> {
    broadcast_replace_to room, target: "board_token_#{id}", partial: "rooms/board_token", locals: { room_character: self }
    broadcast_active_list_update
  }

  # Cuando se saca del tablero, lo borra a los demás
  after_destroy_commit -> {
    broadcast_remove_to room, target: "board_token_#{id}"
    broadcast_active_list_update
  }

  private

  def broadcast_active_list_update
    active_rcs = room.room_characters.where(is_active: true)

    # Broadcast para jugadores (sin controles DM)
    Turbo::StreamsChannel.broadcast_update_to(
      room,
      target: "room_#{room.id}_active_characters",
      partial: "rooms/active_characters_list",
      locals: { room_characters: active_rcs, is_dm: false }
    )

    # Broadcast para el DM (con controles)
    Turbo::StreamsChannel.broadcast_update_to(
      [room, room.dm],
      target: "room_#{room.id}_active_characters",
      partial: "rooms/active_characters_list",
      locals: { room_characters: active_rcs, is_dm: true }
    )
  end
end