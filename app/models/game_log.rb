class GameLog < ApplicationRecord
  belongs_to :room

  after_create_commit -> {
    broadcast_prepend_to room, 
                         target: "room_#{room.id}_game_logs", 
                         partial: "game_logs/game_log", 
                         locals: { log: self }
  }
end