class CreateCombats < ActiveRecord::Migration[8.1]
  def change
    create_table :combats do |t|
      t.references :room, null: false, foreign_key: true
      t.boolean :active, default: true, null: false
      t.integer :current_batch_index, default: 0, null: false

      t.timestamps
    end
  end
end
