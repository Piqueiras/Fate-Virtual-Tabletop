class AddUserToCharacters < ActiveRecord::Migration[8.1]
  def change
    add_reference :characters, :user, foreign_key: true, null: true
  end
end
