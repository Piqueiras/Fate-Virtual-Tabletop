class CreateCharacters < ActiveRecord::Migration[8.1]
  def change
    create_table :characters do |t|
      t.string :name
      t.text :description
      t.json :aspects
      t.json :skills
      t.json :stunts
      t.json :extras
      t.integer :physical_stress
      t.integer :mental_stress
      t.integer :fate_points
      t.boolean :is_secret

      t.timestamps
    end
  end
end
