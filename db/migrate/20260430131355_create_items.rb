class CreateItems < ActiveRecord::Migration[8.1]
  def change
    create_table :items do |t|
      t.references :room, null: false, foreign_key: true
      # null: true es vital para que no dé error si no tiene dueño
      t.references :character, null: true, foreign_key: true 
      t.string :name
      t.text :description
      t.integer :pos_x, default: 0
      t.integer :pos_y, default: 0
      t.boolean :on_board, default: true # Al crearlo, aparece en el tablero por defecto

      t.timestamps
    end
  end
end