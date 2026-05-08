class CombatBatchRoomCharacter < ApplicationRecord
  belongs_to :combat_batch
  belongs_to :room_character

  validates :room_character_id, uniqueness: { scope: :combat_batch_id }
end