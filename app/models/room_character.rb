class RoomCharacter < ApplicationRecord
  belongs_to :room
  belongs_to :character

  validates :character_id, uniqueness: { scope: :room_id }
end
