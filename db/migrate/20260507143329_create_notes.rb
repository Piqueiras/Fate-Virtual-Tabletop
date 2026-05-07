class CreateNotes < ActiveRecord::Migration[8.1]
  def change
    create_table :notes do |t|
      t.references :room, null: false, foreign_key: true
      t.references :user, null: false, foreign_key: true
      t.string :title, null: false, default: ""
      t.text :content, default: ""
      t.boolean :public, default: false, null: false
      t.references :locked_by, foreign_key: { to_table: :users }
      t.datetime :locked_at

      t.timestamps
    end
  end
end