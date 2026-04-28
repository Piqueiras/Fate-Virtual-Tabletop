class CreateRooms < ActiveRecord::Migration[8.1]
  def change
    create_table :rooms do |t|
      t.string :name, null: false
      t.string :password_digest
      t.references :dm, null: false, foreign_key: { to_table: :users }

      t.timestamps
    end
  end
end
