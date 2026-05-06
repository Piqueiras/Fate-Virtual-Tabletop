class AddSkillsPrivateToCharacters < ActiveRecord::Migration[8.1]
  def change
    add_column :characters, :skills_private, :boolean
  end
end
