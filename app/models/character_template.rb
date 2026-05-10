class CharacterTemplate < ApplicationRecord
  belongs_to :user
  has_one_attached :avatar

  validates :name, presence: true

  # Crea un Character a partir de esta plantilla, copiando todos los atributos
  # en deep dup para que sean independientes
  def build_character(override_name: nil)
    char = user.characters.new(
      name: override_name.presence || "#{name} (copia)",
      description: description,
      aspects: deep_dup_json(aspects),
      skills: deep_dup_json(skills),
      stunts: deep_dup_json(stunts),
      extras: deep_dup_json(extras),
      consequences: deep_dup_json(consequences),
      skills_private: skills_private
    )

    char
  end

  private

  def deep_dup_json(value)
    case value
    when Array then value.map { |v| deep_dup_json(v) }
    when Hash  then value.transform_values { |v| deep_dup_json(v) }
    when String, Numeric, TrueClass, FalseClass, NilClass then value
    else value
    end
  end
end