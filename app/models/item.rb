class Item < ApplicationRecord
  belongs_to :room
  belongs_to :character, optional: true
  has_one_attached :image
  validates :name, presence: true

  # 1. Cuando se crea, aparece en la mesa de todos
  after_create_commit -> {
    if on_board
      broadcast_append_to room, target: "board_tokens", partial: "rooms/board_item", locals: { item: self }
    end
  }

  # 2. Cuando se actualiza (se mueve o se guarda)
  after_update_commit -> {
    if saved_change_to_on_board?
      # Si cambió su estado "en el tablero"
      if on_board
        # Lo sacaron del inventario a la mesa
        broadcast_append_to room, target: "board_tokens", partial: "rooms/board_item", locals: { item: self }
      else
        # Se lo guardaron en el inventario, lo borramos de la mesa
        broadcast_remove_to room, target: "board_item_#{id}"
      end
    elsif on_board
      # Solo cambió de coordenadas en la mesa, lo actualizamos
      broadcast_replace_to room, target: "board_item_#{id}", partial: "rooms/board_item", locals: { item: self }
    end
  }

  # 3. Si se borra por completo
  after_destroy_commit -> {
    broadcast_remove_to room, target: "board_item_#{id}"
  }
end