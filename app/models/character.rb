class Character < ApplicationRecord
  belongs_to :user, optional: true
  has_one_attached :avatar
  has_many :room_characters, dependent: :destroy
  has_many :rooms, through: :room_characters
  # Si borras un personaje de tu cuenta, los objetos que tenía en una sala se caen al suelo
  has_many :items, dependent: :nullify

  scope :publicly_visible, -> { where(is_secret: [false, nil]) }
  scope :owned_by, ->(user) { where(user: user) }

  def public?
    !is_secret
  end

  def private?
    is_secret
  end

  SKILLS_LIST = [
    "Atletismo",
    "Carisma",
    "Contactos",
    "Recursos",
    "Físico",
    "Voluntad",
    "Sigilo",
    "Percepción",
    "Disparar",
    "Empatía",
    "Seducción",
    "Engañar",
    "Investigar",
    "Máquinas",
    "Pelear",
    "Provocar",
    "Robar",
    "Saber",
    "Arcana",
    "Magia oscura",
    "Magia santa",
    "Necromancia"
  ].freeze

  SKILLS_LEVELS = [
    { key: "5", label: "Excelente", display: "+5" },
    { key: "4", label: "Enorme", display: "+4" },
    { key: "3", label: "Grande", display: "+3" },
    { key: "2", label: "Bueno", display: "+2" },
    { key: "1", label: "Normal", display: "+1" },
    { key: "-1", label: "Malo", display: "-1" }
  ].freeze

  def skill_level(name)
    return 0 unless skills.is_a?(Hash)

    SKILLS_LEVELS.each do |level|
      return level[:key].to_i if Array(skills[level[:key]]).include?(name)
    end

    0
  end

  def physical_skill_level
    skill_level("Físico")
  end

  def mental_skill_level
    skill_level("Voluntad")
  end

  def self.stress_capacity_for_level(level)
    case level.to_i
    when -1, 0
      2
    when 1, 2
      3
    when 3, 4
      4
    when 5
      5
    else
      2
    end
  end

  def physical_stress_capacity
    self.class.stress_capacity_for_level(physical_skill_level)
  end

  def mental_stress_capacity
    self.class.stress_capacity_for_level(mental_skill_level)
  end

  def physical_stress_mask
    physical_stress.to_i
  end

  def mental_stress_mask
    mental_stress.to_i
  end

  def permanent_export
    {
      name: name,
      description: description,
      aspects: aspects,
      skills: skills,
      stunts: stunts,
      extras: extras,
      consequences: consequences
    }
  end

  def physical_stress_slot?(index)
    (physical_stress_mask & (1 << index)).positive?
  end

  def mental_stress_slot?(index)
    (mental_stress_mask & (1 << index)).positive?
  end

  def filled_physical_stress
    physical_stress_mask.to_s(2).count("1")
  end

  def filled_mental_stress
    mental_stress_mask.to_s(2).count("1")
  end

  def self.stress_mask_for_slots(slot_values)
    Array(slot_values).each_with_index.reduce(0) do |mask, (value, index)|
      value.to_s == "1" ? mask | (1 << index) : mask
    end
  end

  after_update_commit :broadcast_character_update

  def visible_to?(user, room = nil)
    return true if user_id == user&.id
    return true if room && room.dm_id == user&.id
    false
  end

  private

  def broadcast_character_update
    changed_attrs = saved_changes.keys.map(&:to_sym)
    relevant = changed_attrs & [:fate_points, :physical_stress, :mental_stress]
    return if relevant.empty?

    room_characters.where(is_active: true).find_each do |rc|
      ActionCable.server.broadcast(
        "drawing_room_#{rc.room_id}",
        {
          action: "character_update",
          character_id: id,
          fate_points: fate_points,
          physical_stress: physical_stress,
          mental_stress: mental_stress
        }
      )
    end
  end
end
