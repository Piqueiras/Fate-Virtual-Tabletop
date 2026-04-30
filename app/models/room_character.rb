class RoomCharacter < ApplicationRecord
  belongs_to :room
  belongs_to :character

  validates :character_id, uniqueness: { scope: :room_id }

  # Cuando se añade al tablero, lo dibuja a los demás
  after_create_commit -> {
    broadcast_append_to room, target: "board_tokens", partial: "rooms/board_token", locals: { room_character: self }
  }

  # NUEVO: Cuando se le cambian las coordenadas (x, y), se actualiza en las pantallas de los demás
  after_update_commit -> {
    broadcast_replace_to room, target: "board_token_#{id}", partial: "rooms/board_token", locals: { room_character: self }
  }

  # Cuando se saca del tablero, lo borra a los demás
  after_destroy_commit -> {
    broadcast_remove_to room, target: "board_token_#{id}"
  }
end