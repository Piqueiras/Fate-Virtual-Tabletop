class CreateGameLogs < ActiveRecord::Migration[8.1]
  def change
    create_table :game_logs do |t|
      t.references :room, null: false, foreign_key: true
      t.string :message, null: false

      t.timestamps
    end
  end
end
