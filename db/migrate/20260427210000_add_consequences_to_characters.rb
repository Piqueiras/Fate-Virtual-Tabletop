class AddConsequencesToCharacters < ActiveRecord::Migration[8.1]
  def change
    add_column :characters, :consequences, :json, default: []
  end
end
