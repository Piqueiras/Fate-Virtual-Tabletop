class User < ApplicationRecord
  # Include default devise modules. Others available are:
  # :confirmable, :lockable, :timeoutable, :trackable and :omniauthable
  devise :database_authenticatable, :registerable,
         :rememberable, :validatable, authentication_keys: [:username], password_length: 1..128

  has_many :characters, dependent: :destroy

  validates :username, presence: true, uniqueness: { case_sensitive: false }

  before_validation :normalize_email

  def email_required?
    false
  end

  def email_changed?
    false
  end

  def will_save_change_to_email?
    false
  end

  private

  def normalize_email
    self.email = nil if email.blank?
  end
end
