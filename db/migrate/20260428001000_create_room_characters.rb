class CreateRoomCharacters < ActiveRecord::Migration[8.1]
  def change
    create_table :room_characters do |t|
      t.references :room, null: false, foreign_key: true
      t.references :character, null: false, foreign_key: true
      t.boolean :is_active, null: false, default: false
      t.integer :pos_x, null: false, default: 0
      t.integer :pos_y, null: false, default: 0

      t.timestamps
    end

    add_index :room_characters, [:room_id, :character_id], unique: true
  end
end
