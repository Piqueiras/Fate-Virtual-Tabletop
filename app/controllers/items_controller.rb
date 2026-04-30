class ItemsController < ApplicationController
  before_action :authenticate_user!
  before_action :set_room

  def create
    @item = @room.items.new(item_params)
    @item.on_board = true 
    
    # Lo hacemos aparecer un poco separado de la esquina superior izquierda
    @item.pos_x = 100
    @item.pos_y = 100

    if @item.save
      GameLog.create!(room: @room, message: "💎❗ : #{@item.name}")
      render json: @item, status: :created
    else
      render json: { errors: @item.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def update
    @item = @room.items.find(params[:id])
    
    if @item.update(item_params)
      # Mensaje si se lo guarda
      if @item.saved_change_to_character_id? && @item.character
        GameLog.create!(room: @room, message: "✋ #{@item.character.name} cogió: #{@item.name}")
      # Mensaje si lo tira a la mesa
      elsif @item.saved_change_to_on_board? && @item.on_board
        GameLog.create!(room: @room, message: "⬇️ #{@item.name} fue soltado en el tablero.")
      end
      
      head :no_content
    else
      render json: { errors: @item.errors.full_messages }, status: :unprocessable_entity
    end
  end

  private

  def set_room
    @room = Room.find(params[:room_id])
  end

  def item_params
    params.require(:item).permit(:name, :image, :character_id, :pos_x, :pos_y, :on_board)
  end
end