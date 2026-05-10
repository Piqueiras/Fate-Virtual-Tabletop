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
    # Actualizar inventario del usuario afectado si cambió de dueño o estado
    if saved_change_to_character_id? || saved_change_to_on_board?
      broadcast_inventory_updates
    end

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
    broadcast_inventory_updates
  }

  private

  # Refresca el inventario de todos los usuarios que tienen personajes en esta sala
  # y que pudieron verse afectados por el cambio de dueño/estado del ítem
  def broadcast_inventory_updates
    # Averiguar qué usuarios necesitan refresco
    affected_user_ids = Set.new

    # El personaje que tenía el ítem antes (si cambió)
    if saved_change_to_character_id?
      old_char_id = attribute_before_last_save(:character_id)
      if old_char_id.present?
        old_char = Character.find_by(id: old_char_id)
        affected_user_ids.add(old_char.user_id) if old_char
      end
    end

    # El personaje que tiene el ítem ahora
    if character_id.present?
      affected_user_ids.add(character.user_id) if character
    end

    # Para cada usuario afectado, refrescar su inventario
    affected_user_ids.each do |user_id|
      user = User.find_by(id: user_id)
      next unless user

      Turbo::StreamsChannel.broadcast_replace_to(
        [room, user],
        target: "inventory_panel_user_#{user_id}",
        partial: "rooms/inventory_panel",
        locals: { room: room, user: user }
      )
    end
  end
end
