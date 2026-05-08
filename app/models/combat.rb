class Combat < ApplicationRecord
  belongs_to :room
  has_many :combat_batches, -> { order(position: :asc) }, dependent: :destroy
  has_many :combat_batch_room_characters, through: :combat_batches
  has_many :room_characters, through: :combat_batch_room_characters

  validates :active, inclusion: { in: [true, false] }
  validates :current_batch_index, presence: true, numericality: { greater_than_or_equal_to: 0 }

  # Avanza al siguiente lote (cíclico)
  def next_turn!
    return unless active?

    total_batches = combat_batches.count
    return if total_batches.zero?

    next_index = (current_batch_index + 1) % total_batches
    update!(current_batch_index: next_index)
    next_index
  end

  # Devuelve el lote actual
  def current_batch
    combat_batches.order(:position).offset(current_batch_index).first
  end

  # Construye la estructura de lotes desde un array de arrays de room_character_ids
  def build_batches_from_params(batches_params)
    # batches_params es un array de hashes: [{ position: 0, room_character_ids: [1,2] }, ...]
    combat_batches.destroy_all

    # Validar que solo se usen room_characters activos de esta sala
    valid_rc_ids = room.room_characters.where(is_active: true).pluck(:id).to_set

    batches_params.each do |batch_data|
      batch = combat_batches.create!(position: batch_data[:position])
      ids = Array(batch_data[:room_character_ids]).select { |id| valid_rc_ids.include?(id.to_i) }
      ids.each do |rc_id|
        batch.combat_batch_room_characters.create!(room_character_id: rc_id)
      end
    end
  end

  # Serialización para el frontend
  def serialized
    {
      id: id,
      active: active?,
      current_batch_index: current_batch_index,
      room_id: room_id,
      batches: combat_batches.includes(combat_batch_room_characters: :room_character).order(:position).map do |batch|
        {
          id: batch.id,
          position: batch.position,
          room_character_ids: batch.combat_batch_room_characters.pluck(:room_character_id)
        }
      end,
      active_room_characters: room.room_characters.where(is_active: true).includes(:character).map do |rc|
        {
          room_character_id: rc.id,
          character_id: rc.character_id,
          name: rc.character.name
        }
      end
    }
  end
end