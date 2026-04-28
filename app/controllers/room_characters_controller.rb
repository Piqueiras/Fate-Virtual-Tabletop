class RoomCharactersController < ApplicationController
  before_action :authenticate_user!
  before_action :set_room
  before_action :set_room_character, only: %i[update destroy]

  def create
    @room_character = @room.room_characters.new(room_character_params)

    respond_to do |format|
      if @room_character.save
        format.html { redirect_to @room, notice: "Personaje añadido a la sala." }
        format.json { render json: @room_character, status: :created }
      else
        format.html { redirect_to @room, alert: @room_character.errors.full_messages.to_sentence }
        format.json { render json: { errors: @room_character.errors.full_messages }, status: :unprocessable_entity }
      end
    end
  end

  def update
    if @room_character.update(room_character_params)
      respond_to do |format|
        format.html { redirect_to @room, notice: "Estado del personaje actualizado." }
        format.json { head :no_content }
      end
    else
      respond_to do |format|
        format.html { redirect_to @room, alert: @room_character.errors.full_messages.to_sentence }
        format.json { render json: { errors: @room_character.errors.full_messages }, status: :unprocessable_entity }
      end
    end
  end

  def destroy
    @room_character.destroy
    respond_to do |format|
      format.html { redirect_to @room, notice: "Personaje retirado de la sala." }
      format.json { head :no_content }
    end
  end

  private

  def set_room
    @room = Room.find(params[:room_id])
  end

  def set_room_character
    @room_character = @room.room_characters.find(params[:id])
  end

  def room_character_params
    params.require(:room_character).permit(:character_id, :is_active, :pos_x, :pos_y)
  end
end
