class AddBackgroundDimensionsToRooms < ActiveRecord::Migration[7.1]
  def change
    add_column :rooms, :background_width, :integer
    add_column :rooms, :background_height, :integer
  end
end
