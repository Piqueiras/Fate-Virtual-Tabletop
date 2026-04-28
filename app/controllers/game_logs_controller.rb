class GameLogsController < ApplicationController
  before_action :authenticate_user!
  before_action :set_room

  def create
    @game_log = @room.game_logs.new(game_log_params)

    if @game_log.save
      respond_to do |format|
        format.html { redirect_to @room, notice: "Evento registrado." }
        format.json { render json: @game_log, status: :created }
      end
    else
      respond_to do |format|
        format.html { redirect_to @room, alert: @game_log.errors.full_messages.to_sentence }
        format.json { render json: { errors: @game_log.errors.full_messages }, status: :unprocessable_entity }
      end
    end
  end

  private

  def set_room
    @room = Room.find(params[:room_id])
  end

  def game_log_params
    params.require(:game_log).permit(:message)
  end
end
