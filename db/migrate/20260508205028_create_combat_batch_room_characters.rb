class CreateCombatBatchRoomCharacters < ActiveRecord::Migration[8.1]
  def change
    create_table :combat_batch_room_characters do |t|
      t.references :combat_batch, null: false, foreign_key: true
      t.references :room_character, null: false, foreign_key: true

      t.timestamps
    end

    add_index :combat_batch_room_characters, [:combat_batch_id, :room_character_id], unique: true, name: "idx_cbrc_on_batch_and_character"
  end
end
