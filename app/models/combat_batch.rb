class CombatBatch < ApplicationRecord
  belongs_to :combat
  has_many :combat_batch_room_characters, dependent: :destroy
  has_many :room_characters, through: :combat_batch_room_characters

  validates :position, presence: true, numericality: { greater_than_or_equal_to: 0 }

  # Devuelve los nombres de los personajes del lote, separados por coma
  def character_names
    room_characters.includes(:character).map { |rc| rc.character.name }.join(", ")
  end
end