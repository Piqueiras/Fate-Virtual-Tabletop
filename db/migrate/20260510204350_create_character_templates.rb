class CreateCharacterTemplates < ActiveRecord::Migration[8.1]
  def change
    create_table :character_templates do |t|
      t.references :user, null: false, foreign_key: true
      t.string :name
      t.text :description
      t.json :aspects
      t.json :skills
      t.json :stunts
      t.json :extras
      t.json :consequences
      t.boolean :skills_private

      t.timestamps
    end
  end
end
