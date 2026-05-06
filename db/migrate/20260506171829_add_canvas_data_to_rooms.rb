class AddCanvasDataToRooms < ActiveRecord::Migration[8.1]
  def change
    add_column :rooms, :canvas_data, :text
  end
end
