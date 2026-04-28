class RoomsController < ApplicationController
  before_action :authenticate_user!
  before_action :set_room, only: %i[show update]

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

  def update
    if @room.update(room_params)
      respond_to do |format|
        format.html { redirect_to @room, notice: "Imagen del tablero actualizada." }
        format.json do
          render json: {
            background_url: @room.background_image.attached? ? url_for(@room.background_image) : nil,
            background_width: @room.background_width,
            background_height: @room.background_height
          }
        end
      end
    else
      @room_characters = @room.room_characters.includes(:character)
      @available_characters = current_user.characters
      respond_to do |format|
        format.html { render :show, status: :unprocessable_entity }
        format.json { render json: { errors: @room.errors.full_messages }, status: :unprocessable_entity }
      end
    end
  end

  private

  def set_room
    @room = Room.find(params[:id])
  end

  def room_params
    params.require(:room).permit(:name, :password, :password_confirmation, :background_image, :background_width, :background_height)
  end
end
