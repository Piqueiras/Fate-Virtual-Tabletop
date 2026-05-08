class CreateCombatBatches < ActiveRecord::Migration[8.1]
  def change
    create_table :combat_batches do |t|
      t.references :combat, null: false, foreign_key: true
      t.integer :position, null: false

      t.timestamps
    end
  end
end
