class Room < ApplicationRecord
  has_secure_password validations: false

  belongs_to :dm, class_name: "User"
  has_many :room_characters, dependent: :destroy
  has_many :characters, through: :room_characters
  has_many :game_logs, dependent: :destroy
  # Cuando se borra una sala, se borran sus objetos
  has_many :items, dependent: :destroy
  has_many :notes, dependent: :destroy
  has_one_attached :background_image

  validates :name, presence: true

  def public?
    password_digest.blank?
  end
end
