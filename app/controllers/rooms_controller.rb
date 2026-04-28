class RoomsController < ApplicationController
  before_action :authenticate_user!
  before_action :set_room, only: %i[show]

  def index
    @rooms = Room.includes(:dm).order(created_at: :desc)
  end

  def new
    @room = current_user.rooms.new
  end

  def create
    @room = current_user.rooms.new(room_params)

    if @room.save
      redirect_to @room, notice: "Sala creada correctamente."
    else
      render :new, status: :unprocessable_entity
    end
  end

  def show
    @room_characters = @room.room_characters.includes(:character)
    @available_characters = current_user.characters
  end

  private

  def set_room
    @room = Room.find(params[:id])
  end

  def room_params
    params.require(:room).permit(:name, :password, :password_confirmation, :background_image)
  end
end
